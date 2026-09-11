import { useEffect, useRef } from 'react';

/** Pontos visíveis na faixa (estilo monitor de oxímetro). */
const VISIBLE = 220;
const MAX_BUFFER = 480;

type Props = {
    samples: number[];
    bpm: number | null;
    active: boolean;
};

/**
 * Só desenha amostras reais do aparelho (pleth).
 * Sem PPG sintético — se não houver onda BLE, a faixa fica quieta.
 */
export function OximeterPulseGraph({ samples, bpm, active }: Props) {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const bufferRef = useRef<number[]>([]);
    const scaleRef = useRef({ min: 0, max: 127 });
    const lastSampleAtRef = useRef(0);
    const pulseFlashRef = useRef(0);

    useEffect(() => {
        if (!samples.length) return;
        lastSampleAtRef.current = performance.now();
        const next = bufferRef.current.concat(samples);
        bufferRef.current = next.length > MAX_BUFFER ? next.slice(-MAX_BUFFER) : next;
    }, [samples]);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        let raf = 0;

        const draw = (now: number) => {
            const width = canvas.clientWidth || 640;
            const height = canvas.clientHeight || 168;
            const dpr = window.devicePixelRatio || 1;
            const pixelW = Math.floor(width * dpr);
            const pixelH = Math.floor(height * dpr);
            if (canvas.width !== pixelW || canvas.height !== pixelH) {
                canvas.width = pixelW;
                canvas.height = pixelH;
            }
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

            const hasLive = now - lastSampleAtRef.current < 1500 && bufferRef.current.length >= 2;
            const points = hasLive ? bufferRef.current.slice(-VISIBLE) : [];

            paintMonitor(ctx, width, height, points, scaleRef.current, {
                active,
                hasLive,
                bpm,
            });

            if (hasLive && points.length > 8) {
                const peak = points[points.length - 1] ?? 0;
                const prev = points[points.length - 4] ?? 0;
                if (peak - prev > 12 && now - pulseFlashRef.current > 280) {
                    pulseFlashRef.current = now;
                }
            }
            const flash = Math.max(0, 1 - (now - pulseFlashRef.current) / 180);
            if (flash > 0) {
                ctx.beginPath();
                ctx.fillStyle = `rgba(15, 118, 110, ${0.18 * flash})`;
                ctx.arc(width - 22, 22, 7 + flash * 4, 0, Math.PI * 2);
                ctx.fill();
            }

            raf = window.requestAnimationFrame(draw);
        };

        raf = window.requestAnimationFrame(draw);
        return () => window.cancelAnimationFrame(raf);
    }, [active, bpm]);

    return (
        <div className="cabine-oxi-wave">
            <canvas ref={canvasRef} aria-label="Gráfico da onda de pulso" />
        </div>
    );
}

function smooth(values: number[]): number[] {
    if (values.length < 3) return values;
    const out = new Array<number>(values.length);
    for (let i = 0; i < values.length; i += 1) {
        const a = values[Math.max(0, i - 1)]!;
        const b = values[i]!;
        const c = values[Math.min(values.length - 1, i + 1)]!;
        out[i] = (a + b * 2 + c) / 4;
    }
    return out;
}

function paintMonitor(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    raw: number[],
    scale: { min: number; max: number },
    state: { active: boolean; hasLive: boolean; bpm: number | null },
) {
    ctx.clearRect(0, 0, width, height);
    const g = ctx.createLinearGradient(0, 0, 0, height);
    g.addColorStop(0, '#f1f5f9');
    g.addColorStop(1, '#e2e8f0');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, width, height);

    const padX = 10;
    const padY = 28;
    const innerW = width - padX * 2;
    const innerH = height - padY - 12;

    ctx.strokeStyle = 'rgba(148, 163, 184, 0.35)';
    ctx.lineWidth = 1;
    for (let i = 1; i <= 3; i += 1) {
        const y = padY + (innerH * i) / 4;
        ctx.beginPath();
        ctx.moveTo(padX, y);
        ctx.lineTo(width - padX, y);
        ctx.stroke();
    }

    ctx.fillStyle = '#64748b';
    ctx.font = '600 12px "Segoe UI", system-ui, sans-serif';
    if (state.hasLive) {
        ctx.fillText('Onda real do sensor', 14, 20);
    } else if (state.active && state.bpm != null) {
        ctx.fillText('SpO2/pulso ok — aguardando onda BLE do aparelho', 14, 20);
    } else if (state.active) {
        ctx.fillText('Aguardando amostras de onda do oxímetro…', 14, 20);
    } else {
        ctx.fillText('Pulso', 14, 20);
    }

    if (raw.length < 2) {
        ctx.fillStyle = '#94a3b8';
        ctx.font = '13px "Segoe UI", system-ui, sans-serif';
        const msg = state.bpm != null
            ? 'Números estão vindo; a curva só aparece se o PC-60NW enviar pacotes de onda.'
            : 'Sem onda ainda';
        ctx.fillText(msg, padX + 4, padY + innerH / 2);
        return;
    }

    const points = smooth(raw);
    let lo = Math.min(...points);
    let hi = Math.max(...points);
    if (hi - lo < 8) {
        const mid = (hi + lo) / 2;
        lo = mid - 8;
        hi = mid + 8;
    }
    scale.min += (lo - 6 - scale.min) * 0.12;
    scale.max += (hi + 6 - scale.max) * 0.12;
    const span = Math.max(scale.max - scale.min, 1);

    const toX = (i: number) => padX + (i / Math.max(points.length - 1, 1)) * innerW;
    const toY = (v: number) => padY + innerH - ((v - scale.min) / span) * innerH;

    ctx.beginPath();
    ctx.moveTo(toX(0), padY + innerH);
    points.forEach((value, index) => {
        ctx.lineTo(toX(index), toY(value));
    });
    ctx.lineTo(toX(points.length - 1), padY + innerH);
    ctx.closePath();
    const fill = ctx.createLinearGradient(0, padY, 0, padY + innerH);
    fill.addColorStop(0, 'rgba(15, 118, 110, 0.22)');
    fill.addColorStop(1, 'rgba(15, 118, 110, 0.02)');
    ctx.fillStyle = fill;
    ctx.fill();

    ctx.beginPath();
    ctx.strokeStyle = '#0f766e';
    ctx.lineWidth = 2.2;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    points.forEach((value, index) => {
        const x = toX(index);
        const y = toY(value);
        if (index === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    });
    ctx.stroke();

    const last = points[points.length - 1]!;
    ctx.beginPath();
    ctx.fillStyle = '#0f766e';
    ctx.arc(toX(points.length - 1), toY(last), 3.2, 0, Math.PI * 2);
    ctx.fill();
}
