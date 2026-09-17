type Props = {
    samples?: number[] | null;
    bpm?: number;
};

export function OximeterPulsePreview({ samples }: Props) {
    const raw = samples && samples.length > 8 ? samples.slice(-220) : null;
    if (!raw) {
        return (
            <p className="kiosk-muted" style={{ margin: 0 }}>
                Onda de pulso não foi gravada nesta visita.
            </p>
        );
    }
    const lo = Math.min(...raw);
    const hi = Math.max(...raw);
    const span = Math.max(hi - lo, 8);
    const w = 640;
    const h = 140;
    const padX = 8;
    const padY = 16;
    const innerW = w - padX * 2;
    const innerH = h - padY * 2;
    const d = raw
        .map((value, index) => {
            const x = padX + (index / Math.max(raw.length - 1, 1)) * innerW;
            const y = padY + innerH - ((value - lo) / span) * innerH;
            return `${index === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`;
        })
        .join(' ');
    const lastX = padX + innerW;
    const base = padY + innerH;
    return (
        <div className="cabine-oxi-wave kiosk-oxi-wave-preview" aria-label="Gráfico da onda de pulso">
            <svg viewBox={`0 0 ${w} ${h}`} role="img">
                <title>Onda de pulso</title>
                <rect width={w} height={h} fill="#e2e8f0" />
                <path d={`${d} L${lastX} ${base} L${padX} ${base} Z`} fill="rgba(15,118,110,0.18)" />
                <path d={d} fill="none" stroke="#0f766e" strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round" />
            </svg>
        </div>
    );
}
