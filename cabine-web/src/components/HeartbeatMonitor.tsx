import { Spline } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { HEM7530_ECG_HZ } from '../utils/hem7530EcgWorklet';

const SAMPLE_HZ = HEM7530_ECG_HZ;
const LIVE_SEC = 3;
const LIVE_N = Math.round(SAMPLE_HZ * LIVE_SEC);
const LOOKBACK_N = Math.round(SAMPLE_HZ * 0.2);
/** Largura do relatório: dá para ler o QRS e rolar os 30 s. */
const STRIP_PX_PER_SEC = 150;
/** Faixa apagada na frente do traço, para a volta não emendar no traço antigo. */
const SWEEP_GAP = Math.round(SAMPLE_HZ * 0.22);
/** Ganho de repouso. O aparelho vai até ±5 mV. */
const DISPLAY_MV = 0.8;

type Props = {
    bpm: number | null;
    active: boolean;
    /** Amostras demoduladas do tom 19 kHz (mV). */
    trace?: number[];
    toneLocked?: boolean;
    /** Relatório: a faixa inteira, com rolagem para o lado. */
    review?: boolean;
    /**
     * Contador crescente das amostras ao vivo.
     * Com ele, o traço varre da esquerda para a direita e recomeça no fim da tela.
     */
    traceSeq?: number;
};

type Rhythm = {
    bpm: number;
    peaks: number[];
};

type Sweep = {
    buf: number[];
    head: number;
    filled: boolean;
    prevSeq: number;
};

function emptySweep(): Sweep {
    return { buf: new Array<number>(LIVE_N).fill(Number.NaN), head: 0, filled: false, prevSeq: 0 };
}

export function HeartbeatMonitor({
    bpm,
    active,
    trace,
    toneLocked = false,
    review = false,
    traceSeq,
}: Props) {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const traceRef = useRef<number[]>([]);
    const scaleRef = useRef(DISPLAY_MV);
    const rateRef = useRef<number | null>(null);
    const polarityRef = useRef(1);
    const stableRef = useRef(true);
    const seqRef = useRef<number | null>(null);
    const sweepRef = useRef<Sweep>(emptySweep());
    const [stable, setStable] = useState(true);
    traceRef.current = trace ?? [];
    stableRef.current = stable;
    seqRef.current = traceSeq ?? null;

    const totalN = traceRef.current.length;
    const stripWidth = Math.max(640, Math.ceil((totalN / SAMPLE_HZ) * STRIP_PX_PER_SEC));

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        let raf = 0;

        const draw = () => {
            const width = canvas.clientWidth || 640;
            const height = canvas.clientHeight || 220;
            const dpr = window.devicePixelRatio || 1;
            const pixelW = Math.floor(width * dpr);
            const pixelH = Math.floor(height * dpr);
            if (canvas.width !== pixelW || canvas.height !== pixelH) {
                canvas.width = pixelW;
                canvas.height = pixelH;
            }
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            const live = traceRef.current;
            const seq = seqRef.current;
            const sweep = !review && seq != null ? ingestSweep(sweepRef.current, live, seq) : null;
            const hasWave = (sweep ? sweep.filled || sweep.head >= 40 : live.length >= 40) && (review || toneLocked);
            if (hasWave) {
                paintEcg(
                    ctx,
                    width,
                    height,
                    live,
                    scaleRef,
                    rateRef,
                    polarityRef,
                    bpm,
                    review,
                    stableRef.current,
                    sweep,
                );
            } else {
                paintWaiting(ctx, width, height, active);
            }
            raf = window.requestAnimationFrame(draw);
        };

        raf = window.requestAnimationFrame(draw);
        return () => window.cancelAnimationFrame(raf);
    }, [active, bpm, toneLocked, review]);

    return (
        <div className={review ? 'kiosk-ecg-wave kiosk-ecg-wave--review' : 'kiosk-ecg-wave'}>
            <div className="kiosk-ecg-scroll">
                <canvas
                    ref={canvasRef}
                    style={review ? { width: stripWidth } : undefined}
                    aria-label={
                        review
                            ? 'Eletrocardiograma completo. Role para ver o registro completo.'
                            : 'Gráfico do eletrocardiograma.'
                    }
                />
            </div>
            <button
                type="button"
                className={stable ? 'kiosk-ecg-toggle is-on no-print' : 'kiosk-ecg-toggle no-print'}
                aria-pressed={stable}
                aria-label={stable ? 'Estabilização ligada' : 'Estabilização desligada'}
                title={stable ? 'Estabilização ligada. Toque para ver o traço cru.' : 'Estabilização desligada. Toque para alisar o traço.'}
                onClick={() => setStable((value) => !value)}
            >
                <Spline size={16} strokeWidth={2.2} aria-hidden />
            </button>
        </div>
    );
}

function formatSec(value: number): string {
    const rounded = Math.round(value * 10) / 10;
    return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1).replace('.', ',');
}

/** Fora do QRS o desenho passa em 12 Hz. O pico fica no sinal cru. */
const DISPLAY_LP_HALF = 35;
const DISPLAY_LP = lowpassTaps(12, DISPLAY_LP_HALF);
const QRS_RADIUS = 12;
const QRS_SLOPE = 0.07;

function lowpassTaps(cutoffHz: number, half: number): number[] {
    const taps: number[] = [];
    for (let n = -half; n <= half; n += 1) {
        const sinc = n === 0
            ? (2 * cutoffHz) / SAMPLE_HZ
            : Math.sin((2 * Math.PI * cutoffHz * n) / SAMPLE_HZ) / (Math.PI * n);
        const window = 0.54 - 0.46 * Math.cos((2 * Math.PI * (n + half)) / (2 * half));
        taps.push(sinc * window);
    }
    const gain = taps.reduce((sum, value) => sum + value, 0);
    return taps.map((value) => value / gain);
}

/**
 * Só no desenho. A linha entre os batimentos é alisada. Onde a subida é de QRS,
 * o traço continua o sinal cru, para o pico não encolher. O ícone desligado
 * e o sinal gravado não passam aqui.
 */
function stabilizeDisplay(samples: number[]): number[] {
    const heavy = new Array<number>(samples.length);
    for (let i = 0; i < samples.length; i += 1) {
        let acc = 0;
        for (let k = 0; k < DISPLAY_LP.length; k += 1) {
            const index = Math.min(samples.length - 1, Math.max(0, i + k - DISPLAY_LP_HALF));
            acc += DISPLAY_LP[k]! * (samples[index] ?? 0);
        }
        heavy[i] = acc;
    }
    const slope = new Array<number>(samples.length);
    slope[0] = 0;
    for (let i = 1; i < samples.length; i += 1) {
        slope[i] = Math.abs((samples[i] ?? 0) - (samples[i - 1] ?? 0));
    }
    return samples.map((value, i) => {
        let env = 0;
        for (let k = -QRS_RADIUS; k <= QRS_RADIUS; k += 1) {
            const j = i + k;
            if (j < 0 || j >= samples.length) continue;
            const fall = 1 - Math.abs(k) / (QRS_RADIUS + 1);
            env = Math.max(env, (slope[j] ?? 0) * fall);
        }
        const w = Math.min(1, env / QRS_SLOPE);
        const mix = w * w * (3 - 2 * w);
        return value * mix + (heavy[i] ?? value) * (1 - mix);
    });
}

function median(samples: number[]): number {
    if (samples.length === 0) return 0;
    const copy = samples.slice().sort((a, b) => a - b);
    return copy[copy.length >> 1] ?? 0;
}

/** O QRS do Complete aponta para cima. Um pico largo para baixo vira o traço. */
function upright(samples: number[], held: number): number {
    let pos = 0;
    let neg = 0;
    for (const value of samples) {
        if (value > pos) pos = value;
        if (value < neg) neg = value;
    }
    const down = -neg;
    if (pos === 0 && down === 0) return held;
    if (pos < 0.2 && down < 0.2) return held;
    const next = down > pos ? -1 : 1;
    if (next === held) return held;
    const winner = Math.max(pos, down);
    const loser = Math.min(pos, down);
    return winner > loser * 1.8 && winner > 0.35 ? next : held;
}

function findRhythm(samples: number[], sampleHz = SAMPLE_HZ): Rhythm | null {
    if (samples.length < sampleHz * 1.4) return null;
    const abs = samples.map((value) => Math.abs(value)).sort((a, b) => a - b);
    const robust = abs[Math.min(abs.length - 1, Math.floor(abs.length * 0.98))] ?? 0;
    if (robust < 0.18) return null;
    const thr = Math.max(0.12, robust * 0.45);
    const minGap = Math.round(sampleHz * 0.34);
    const maxGap = Math.round(sampleHz * 1.45);
    const peaks: number[] = [];
    for (let i = 4; i < samples.length - 4; i += 1) {
        const value = samples[i]!;
        if (value < thr) continue;
        if (value < samples[i - 1]! || value < samples[i + 1]!) continue;
        if (value < samples[i - 2]! || value < samples[i + 2]!) continue;
        const last = peaks[peaks.length - 1];
        if (last == null || i - last >= minGap) peaks.push(i);
        else if (value > samples[last]!) peaks[peaks.length - 1] = i;
    }
    if (peaks.length < 2) return null;
    const usable: number[] = [];
    for (let i = 1; i < peaks.length; i += 1) {
        const gap = peaks[i]! - peaks[i - 1]!;
        if (gap <= maxGap) usable.push(gap);
    }
    if (usable.length === 0) return null;
    usable.sort((a, b) => a - b);
    const med = usable[Math.floor(usable.length * 0.5)]!;
    const tight = usable.filter((gap) => gap < med * 1.55 && gap > med * 0.55);
    const chosen = tight.length > 0 ? tight : usable;
    const rateGap = chosen[Math.floor(chosen.length * 0.5)]!;
    const rate = (60 * sampleHz) / rateGap;
    if (rate < 42 || rate > 170) return null;
    return { bpm: Math.round(rate), peaks };
}

function ingestSweep(sweep: Sweep, samples: number[], seq: number): Sweep {
    if (samples.length === 0 || seq < sweep.prevSeq) {
        sweep.buf.fill(Number.NaN);
        sweep.head = 0;
        sweep.filled = false;
        const restarted = seq < sweep.prevSeq && samples.length > 0;
        sweep.prevSeq = restarted ? seq - Math.min(samples.length, LIVE_N) : seq;
        if (samples.length === 0) return sweep;
    }
    const delta = seq - sweep.prevSeq;
    sweep.prevSeq = seq;
    if (delta <= 0) return sweep;
    const added = samples.slice(Math.max(0, samples.length - delta));
    for (const value of added) {
        sweep.buf[sweep.head] = value;
        sweep.head += 1;
        if (sweep.head >= LIVE_N) {
            sweep.head = 0;
            sweep.filled = true;
        }
    }
    return sweep;
}

function paintEcg(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    samples: number[],
    scaleRef: { current: number },
    rateRef: { current: number | null },
    polarityRef: { current: number },
    bpm: number | null,
    review: boolean,
    stable: boolean,
    sweep: Sweep | null,
) {
    paintGrid(ctx, width, height);
    let windowSec = LIVE_SEC;
    let windowN = LIVE_N;
    const totalSec = samples.length / SAMPLE_HZ;
    let wave: number[];
    let columns: Array<number | null> | null = null;

    if (sweep && (sweep.filled || sweep.head > 0)) {
        const order: number[] = [];
        const count = sweep.filled ? LIVE_N : sweep.head;
        for (let i = 0; i < count; i += 1) order.push(sweep.filled ? (sweep.head + i) % LIVE_N : i);
        const raw = order.map((index) => sweep.buf[index] ?? 0);
        const sign = upright(raw, polarityRef.current);
        polarityRef.current = sign;
        const signed = sign === 1 ? raw : raw.map((value) => -value);
        const filtered = stable ? stabilizeDisplay(signed) : signed;
        const base = median(filtered);
        wave = filtered.map((value) => value - base);
        columns = new Array<number | null>(LIVE_N).fill(null);
        for (let j = 0; j < wave.length; j += 1) columns[order[j]!] = wave[j] ?? null;
        if (sweep.filled) {
            for (let g = 0; g < SWEEP_GAP; g += 1) columns[(sweep.head + g) % LIVE_N] = null;
            if (stable) {
                for (let g = 1; g <= DISPLAY_LP_HALF; g += 1) {
                    columns[(sweep.head - g + LIVE_N) % LIVE_N] = null;
                }
            }
        }
    } else if (review) {
        windowSec = Math.max(totalSec, 0.2);
        windowN = Math.max(samples.length, 1);
        const sign = upright(samples, polarityRef.current);
        polarityRef.current = sign;
        const signed = sign === 1 ? samples : samples.map((value) => -value);
        const filtered = stable ? stabilizeDisplay(signed) : signed;
        const base = median(filtered);
        wave = filtered.map((value) => value - base);
    } else {
        const viewStart = Math.max(0, samples.length - windowN);
        const pad = stable ? Math.round(SAMPLE_HZ * 0.8) : LOOKBACK_N;
        const from = Math.max(0, viewStart - pad);
        const chunk = samples.slice(from, viewStart + windowN);
        const sign = upright(review ? samples : chunk, polarityRef.current);
        polarityRef.current = sign;
        const signed = sign === 1 ? chunk : chunk.map((value) => -value);
        const filtered = stable ? stabilizeDisplay(signed) : signed;
        const sliced = filtered.slice(viewStart - from);
        const base = median(sliced);
        wave = sliced.map((value) => value - base);
    }
    if (sweep && !sweep.filled && sweep.head < SAMPLE_HZ) rateRef.current = null;
    const rhythm = findRhythm(wave);
    if (rhythm) {
        const next = rhythm.bpm;
        const held = rateRef.current;
        if (held == null || Math.abs(next - held) <= 18) rateRef.current = next;
    }
    const rate = rateRef.current ?? (bpm && bpm > 0 ? bpm : null);

    ctx.strokeStyle = 'rgba(74, 222, 128, 0.16)';
    ctx.lineWidth = 1;
    const minorStep = 0.2;
    for (let t = minorStep; t < windowSec - 0.05; t += minorStep) {
        const major = Math.abs(t - Math.round(t)) < 0.01;
        ctx.strokeStyle = major ? 'rgba(74, 222, 128, 0.32)' : 'rgba(34, 197, 94, 0.12)';
        const x = Math.round(width * (t / windowSec)) + 0.5;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
        if (review && major) {
            ctx.fillStyle = 'rgba(134, 239, 172, 0.8)';
            ctx.font = '600 11px "Segoe UI", system-ui, sans-serif';
            ctx.fillText(`${Math.round(t)} s`, x + 4, height - 8);
        }
    }

    ctx.fillStyle = '#86efac';
    ctx.font = '600 13px "Segoe UI", system-ui, sans-serif';
    ctx.fillText(rate != null ? `Pulso ${rate} bpm` : 'Batimentos', 14, 22);
    ctx.fillStyle = 'rgba(134, 239, 172, 0.7)';
    ctx.font = '600 11px "Segoe UI", system-ui, sans-serif';
    if (review) {
        ctx.fillText(`${formatSec(totalSec)} s no total`, 14, 38);
    } else {
        ctx.fillText(`${formatSec(windowSec)} s`, width - 78, 22);
    }
    let target = scaleRef.current;
    if (rhythm && rhythm.peaks.length > 0) {
        const heights = rhythm.peaks.map((index) => Math.abs(wave[index] ?? 0)).sort((a, b) => a - b);
        const typical = heights[heights.length >> 1] ?? DISPLAY_MV;
        target = Math.min(2.2, Math.max(DISPLAY_MV, typical * 1.55));
    }
    scaleRef.current += (target - scaleRef.current) * 0.02;
    const mid = height * 0.56;
    const amp = height * 0.46;
    const scale = scaleRef.current;
    const pxPerMv = amp / scale;
    const barTop = height - 16 - pxPerMv;
    ctx.strokeStyle = '#86efac';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(16, height - 16);
    ctx.lineTo(16, barTop);
    ctx.moveTo(12, height - 16);
    ctx.lineTo(20, height - 16);
    ctx.moveTo(12, barTop);
    ctx.lineTo(20, barTop);
    ctx.stroke();
    ctx.fillStyle = '#86efac';
    ctx.font = '600 11px "Segoe UI", system-ui, sans-serif';
    ctx.fillText('1 mV', 24, height - 12);

    ctx.strokeStyle = 'rgba(74, 222, 128, 0.22)';
    ctx.beginPath();
    ctx.moveTo(0, mid);
    ctx.lineTo(width, mid);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(74, 222, 128, 0.1)';
    ctx.lineWidth = 1;
    for (const mark of [0.5, 1]) {
        if (mark > scale * 1.15) continue;
        const dy = (mark / scale) * amp;
        ctx.beginPath();
        ctx.moveTo(0, mid - dy);
        ctx.lineTo(width, mid - dy);
        ctx.moveTo(0, mid + dy);
        ctx.lineTo(width, mid + dy);
        ctx.stroke();
    }

    ctx.beginPath();
    ctx.strokeStyle = '#4ade80';
    ctx.lineWidth = 2.2;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    if (columns) {
        let drawing = false;
        for (let i = 0; i < columns.length; i += 1) {
            const value = columns[i];
            if (value == null || !Number.isFinite(value)) {
                drawing = false;
                continue;
            }
            const x = (i / columns.length) * width;
            const y = mid - (value / scale) * amp;
            if (!drawing) {
                ctx.moveTo(x, y);
                drawing = true;
            } else ctx.lineTo(x, y);
        }
    } else {
        const last = wave.length;
        const span = Math.max(windowN - 1, 1);
        const startX = review ? 0 : width * (1 - last / windowN);
        for (let i = 0; i < last; i += 1) {
            const x = startX + (i / span) * width;
            const y = mid - (wave[i]! / scale) * amp;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
    }
    ctx.stroke();
}

function paintGrid(ctx: CanvasRenderingContext2D, width: number, height: number) {
    ctx.fillStyle = '#07131a';
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = 'rgba(34, 197, 94, 0.12)';
    ctx.lineWidth = 1;
    for (let x = 0; x < width; x += 18) {
        ctx.beginPath();
        ctx.moveTo(x + 0.5, 0);
        ctx.lineTo(x + 0.5, height);
        ctx.stroke();
    }
    for (let y = 0; y < height; y += 18) {
        ctx.beginPath();
        ctx.moveTo(0, y + 0.5);
        ctx.lineTo(width, y + 0.5);
        ctx.stroke();
    }
}

function paintWaiting(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    active: boolean,
) {
    paintGrid(ctx, width, height);
    ctx.fillStyle = '#86efac';
    ctx.font = '600 13px "Segoe UI", system-ui, sans-serif';
    ctx.fillText(
        active
            ? 'Aguardando o sinal dos sensores'
            : 'Batimentos',
        14,
        22,
    );
    const mid = height * 0.52;
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(74, 222, 128, 0.28)';
    ctx.lineWidth = 2;
    ctx.moveTo(0, mid);
    ctx.lineTo(width, mid);
    ctx.stroke();
}
