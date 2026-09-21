import { useEffect, useRef, useState, type PointerEvent } from 'react';

import { HEM7530_ECG_HZ } from '../utils/hem7530EcgWorklet';

const SAMPLE_HZ = HEM7530_ECG_HZ;
const WINDOW_SEC = 8;
const WINDOW_N = Math.round(SAMPLE_HZ * WINDOW_SEC);
const LOOKBACK_N = Math.round(SAMPLE_HZ * 0.25);
const MV_FLOOR = 2;
const LP25 = butterLp2(25, SAMPLE_HZ);

type Props = {
    bpm: number | null;
    active: boolean;
    /** Amostras demoduladas do tom 19 kHz (mV). */
    trace?: number[];
    toneLocked?: boolean;
    /** Relatório: janela de 8 s com arraste pelos 30 s gravados. */
    review?: boolean;
};

type Rhythm = {
    bpm: number;
    peaks: number[];
};

type Biquad = {
    b0: number;
    b1: number;
    b2: number;
    a1: number;
    a2: number;
};

export function HeartbeatMonitor({ bpm, active, trace, toneLocked = false, review = false }: Props) {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const traceRef = useRef<number[]>([]);
    const scaleRef = useRef(MV_FLOOR);
    const offsetRef = useRef(0);
    const dragRef = useRef<{ x: number; offset: number } | null>(null);
    const stableRef = useRef(true);
    const [offset, setOffset] = useState(0);
    const [stable, setStable] = useState(true);
    traceRef.current = trace ?? [];
    stableRef.current = stable;

    const totalN = traceRef.current.length;
    const maxOffset = Math.max(0, totalN - WINDOW_N);
    const canPan = review && maxOffset > 0;

    useEffect(() => {
        if (!review) return;
        offsetRef.current = 0;
        setOffset(0);
    }, [totalN, review]);

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
            const hasWave = live.length >= 40 && (toneLocked || review || live.length >= WINDOW_N / 5);
            if (hasWave) {
                paintEcg(ctx, width, height, live, scaleRef, bpm, review, offsetRef.current, stableRef.current);
            } else {
                paintWaiting(ctx, width, height, active);
            }
            raf = window.requestAnimationFrame(draw);
        };

        raf = window.requestAnimationFrame(draw);
        return () => window.cancelAnimationFrame(raf);
    }, [active, bpm, toneLocked, review]);

    function clampOffset(value: number): number {
        const max = Math.max(0, traceRef.current.length - WINDOW_N);
        if (value < 0) return 0;
        if (value > max) return max;
        return value;
    }

    function moveView(next: number) {
        const clamped = clampOffset(next);
        offsetRef.current = clamped;
        setOffset(clamped);
    }

    function onPointerDown(event: PointerEvent<HTMLCanvasElement>) {
        if (!canPan) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        dragRef.current = { x: event.clientX, offset: offsetRef.current };
    }

    function onPointerMove(event: PointerEvent<HTMLCanvasElement>) {
        const drag = dragRef.current;
        if (!drag) return;
        const width = event.currentTarget.clientWidth || 1;
        const dx = event.clientX - drag.x;
        moveView(drag.offset - dx * (WINDOW_N / width));
    }

    function onPointerUp() {
        dragRef.current = null;
    }

    const totalSec = totalN / SAMPLE_HZ;

    return (
        <div className={review ? 'kiosk-ecg-wave kiosk-ecg-wave--review' : 'kiosk-ecg-wave'}>
            <canvas
                ref={canvasRef}
                aria-label={
                    review
                        ? 'Eletrocardiograma - ECG completo. Arraste para ver o registro completo.'
                        : 'Gráfico do eletrocardiograma - ECG.'
                }
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
            />
            <div className="kiosk-ecg-tools no-print">
                <button
                    type="button"
                    className={stable ? 'kiosk-ecg-toggle is-on' : 'kiosk-ecg-toggle'}
                    aria-pressed={stable}
                    onClick={() => setStable((value) => !value)}
                >
                    {stable ? 'Suavizado' : 'Original'}
                </button>
                {canPan ? (
                    <div className="kiosk-ecg-scrub">
                        <input
                            type="range"
                            min={0}
                            max={maxOffset}
                            step={1}
                            value={Math.min(offset, maxOffset)}
                            aria-label="Posição do eletrocardiograma"
                            onChange={(event) => moveView(Number(event.target.value))}
                        />
                        <p>Arraste para percorrer os {formatSec(totalSec)} s</p>
                    </div>
                ) : null}
            </div>
        </div>
    );
}

function formatSec(value: number): string {
    const rounded = Math.round(value * 10) / 10;
    return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1).replace('.', ',');
}

function butterLp2(fc: number, sr: number): Biquad {
    const k = Math.tan((Math.PI * fc) / sr);
    const k2 = k * k;
    const n = 1 / (1 + Math.SQRT2 * k + k2);
    return {
        b0: k2 * n,
        b1: 2 * k2 * n,
        b2: k2 * n,
        a1: 2 * (k2 - 1) * n,
        a2: (1 - Math.SQRT2 * k + k2) * n,
    };
}

function applyBiquad(samples: number[], c: Biquad): number[] {
    let z1 = 0;
    let z2 = 0;
    const out = new Array<number>(samples.length);
    for (let i = 0; i < samples.length; i += 1) {
        const x = samples[i]!;
        const y = c.b0 * x + z1;
        z1 = c.b1 * x - c.a1 * y + z2;
        z2 = c.b2 * x - c.a2 * y;
        out[i] = y;
    }
    return out;
}

/** Tira o serrilhado fino e mantém o QRS. */
function stabilize(samples: number[]): number[] {
    const lp = applyBiquad(samples, LP25);
    const n = lp.length;
    if (n < 5) return lp;
    const out = new Array<number>(n);
    out[0] = lp[0]!;
    out[1] = (lp[0]! + 2 * lp[1]! + lp[2]!) / 4;
    for (let i = 2; i < n - 2; i += 1) {
        out[i] = (lp[i - 2]! + 4 * lp[i - 1]! + 6 * lp[i]! + 4 * lp[i + 1]! + lp[i + 2]!) / 16;
    }
    out[n - 2] = (lp[n - 3]! + 2 * lp[n - 2]! + lp[n - 1]!) / 4;
    out[n - 1] = lp[n - 1]!;
    return out;
}

function polarity(samples: number[]): number {
    let pos = 0;
    let neg = 0;
    for (const value of samples) {
        if (value > pos) pos = value;
        if (value < neg) neg = value;
    }
    return -neg > pos * 1.25 ? -1 : 1;
}

function findRhythm(samples: number[], sampleHz = SAMPLE_HZ): Rhythm | null {
    if (samples.length < sampleHz * 1.6) return null;
    let peak = 0;
    for (const value of samples) {
        if (value > peak) peak = value;
    }
    if (peak < 0.12) return null;
    const thr = peak * 0.42;
    const minGap = Math.round(sampleHz * 0.32);
    const peaks: number[] = [];
    for (let i = 4; i < samples.length - 4; i += 1) {
        const v = samples[i]!;
        if (v < thr) continue;
        if (v < samples[i - 1]! || v < samples[i + 1]!) continue;
        if (v < samples[i - 2]! || v < samples[i + 2]!) continue;
        const last = peaks[peaks.length - 1];
        if (last == null || i - last >= minGap) peaks.push(i);
        else if (v > samples[last]!) peaks[peaks.length - 1] = i;
    }
    if (peaks.length < 3) return null;
    const gaps: number[] = [];
    for (let i = 1; i < peaks.length; i += 1) gaps.push(peaks[i]! - peaks[i - 1]!);
    gaps.sort((a, b) => a - b);
    const med = gaps[Math.floor(gaps.length * 0.5)]!;
    const rate = (60 * sampleHz) / med;
    if (rate < 40 || rate > 180) return null;
    return { bpm: Math.round(rate), peaks };
}

function paintEcg(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    samples: number[],
    scaleRef: { current: number },
    bpm: number | null,
    review: boolean,
    offset: number,
    stable: boolean,
) {
    paintGrid(ctx, width, height);
    const maxOffset = Math.max(0, samples.length - WINDOW_N);
    const viewStart = review ? Math.min(Math.max(0, Math.round(offset)), maxOffset) : Math.max(0, samples.length - WINDOW_N);
    const from = Math.max(0, viewStart - (stable ? LOOKBACK_N : 0));
    const chunk = samples.slice(from, viewStart + WINDOW_N);
    const sign = polarity(review ? samples : chunk);
    const signed = sign === 1 ? chunk : chunk.map((value) => value * sign);
    const filtered = stable ? stabilize(signed) : signed;
    const wave = filtered.slice(viewStart - from);
    const rhythm = findRhythm(wave);
    const rate = rhythm?.bpm ?? (bpm && bpm > 0 ? bpm : null);
    const totalSec = samples.length / SAMPLE_HZ;
    const t0 = viewStart / SAMPLE_HZ;
    const t1 = (viewStart + wave.length) / SAMPLE_HZ;

    ctx.strokeStyle = 'rgba(74, 222, 128, 0.28)';
    ctx.lineWidth = 1;
    for (let sec = 1; sec < WINDOW_SEC; sec += 1) {
        const x = review
            ? Math.round(width * (sec / WINDOW_SEC)) + 0.5
            : Math.round(width * (1 - sec / WINDOW_SEC)) + 0.5;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
    }

    ctx.fillStyle = '#86efac';
    ctx.font = '600 13px "Segoe UI", system-ui, sans-serif';
    ctx.fillText(rate != null ? `Pulso ${rate} bpm` : 'Batimentos', 14, 22);
    ctx.fillStyle = 'rgba(134, 239, 172, 0.7)';
    ctx.font = '600 11px "Segoe UI", system-ui, sans-serif';
    if (review) {
        ctx.fillText(`${formatSec(t0)}–${formatSec(t1)} s`, width - 92, 22);
        ctx.fillText(`${formatSec(totalSec)} s no total`, width - 92, 38);
    } else {
        ctx.fillText(`${WINDOW_SEC.toString().replace('.', ',')} s`, width - 42, 22);
    }
    ctx.fillText(stable ? 'Leitura suavizada' : 'Leitura ao vivo', 14, height - 12);

    let peak = 0;
    for (const value of wave) {
        const abs = Math.abs(value);
        if (abs > peak) peak = abs;
    }
    const target = peak > MV_FLOOR ? Math.min(4.5, peak * 1.12) : MV_FLOOR;
    scaleRef.current = scaleRef.current * 0.92 + target * 0.08;
    const mid = height * 0.52;
    const amp = height * 0.38;
    const scale = scaleRef.current;

    ctx.strokeStyle = 'rgba(74, 222, 128, 0.22)';
    ctx.beginPath();
    ctx.moveTo(0, mid);
    ctx.lineTo(width, mid);
    ctx.stroke();

    ctx.beginPath();
    ctx.strokeStyle = '#4ade80';
    ctx.lineWidth = 1.8;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    const last = wave.length;
    const span = Math.max(WINDOW_N - 1, 1);
    const startX = review ? 0 : width * (1 - last / WINDOW_N);
    for (let i = 0; i < last; i += 1) {
        const x = startX + (i / span) * width;
        let v = wave[i]! / scale;
        if (v > 1.2) v = 1.2;
        if (v < -1.2) v = -1.2;
        const y = mid - v * amp;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
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
