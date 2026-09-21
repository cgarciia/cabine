export type BpGuideStep = 'cuff' | 'sensors' | 'start' | 'stabilize' | 'record' | 'pause' | 'wait_bp';

type Props = {
    step: BpGuideStep;
};

export function BpGuideIllustration({ step }: Props) {
    const kind = step === 'wait_bp' ? 'wait' : step === 'pause' ? 'sensors' : step;
    return (
        <div className={`kiosk-bp-art kiosk-bp-art--${kind}`} aria-hidden>
            <svg className="kiosk-bp-asset" viewBox="0 0 280 220" fill="none">
                {kind === 'cuff' ? <CuffScene /> : null}
                {kind === 'sensors' ? <SensorsScene /> : null}
                {kind === 'start' ? <StartScene /> : null}
                {kind === 'stabilize' || kind === 'record' ? <MeasureScene live={kind === 'record'} /> : null}
                {kind === 'wait' ? <WaitScene /> : null}
            </svg>
        </div>
    );
}

function Device({ glow = false }: { glow?: boolean }) {
    return (
        <g>
            <rect x="78" y="58" width="124" height="86" rx="16" fill="#f8fafc" stroke="#0f766e" strokeWidth="3" />
            <rect x="96" y="72" width="88" height="36" rx="8" fill="#0f172a" />
            <circle cx="108" cy="124" r="11" fill={glow ? '#0f766e' : '#cbd5e1'} />
            <circle cx="108" cy="124" r="5" fill={glow ? '#ecfdf5' : '#94a3b8'} />
            <rect x="128" y="116" width="54" height="16" rx="8" fill={glow ? '#0f766e' : '#e2e8f0'} />
            <text x="155" y="128" textAnchor="middle" fill={glow ? '#ecfdf5' : '#64748b'} fontSize="8" fontWeight="800" fontFamily="Segoe UI, sans-serif">
                START
            </text>
            <rect x="86" y="148" width="28" height="10" rx="3" fill="#99f6e4" />
            <rect x="166" y="148" width="28" height="10" rx="3" fill="#99f6e4" />
        </g>
    );
}

function CuffScene() {
    return (
        <g>
            <ellipse cx="140" cy="196" rx="70" ry="10" fill="#e2e8f0" />
            <path d="M86 168c8-52 28-92 54-92s46 40 54 92" fill="#fde7d4" stroke="#e2a37a" strokeWidth="3" />
            <rect x="92" y="92" width="96" height="42" rx="14" fill="#0f766e" />
            <rect x="100" y="100" width="80" height="10" rx="5" fill="#99f6e4" opacity="0.7" />
            <path d="M188 108h28" stroke="#0f766e" strokeWidth="6" strokeLinecap="round" />
            <circle cx="220" cy="108" r="10" fill="#14b8a6" />
        </g>
    );
}

function SensorsScene() {
    return (
        <g>
            <ellipse cx="140" cy="198" rx="78" ry="10" fill="#e2e8f0" />
            <Device />
            <path d="M54 168c12-28 28-34 46-22 8 6 14 20 14 32" fill="#fde7d4" stroke="#e2a37a" strokeWidth="3" />
            <path d="M226 168c-12-28-28-34-46-22-8 6-14 20-14 32" fill="#fde7d4" stroke="#e2a37a" strokeWidth="3" />
            <circle cx="100" cy="153" r="8" fill="#0f766e" opacity="0.35" />
            <circle cx="180" cy="153" r="8" fill="#0f766e" opacity="0.35" />
        </g>
    );
}

function StartScene() {
    return (
        <g>
            <ellipse cx="140" cy="198" rx="78" ry="10" fill="#e2e8f0" />
            <Device glow />
            <circle cx="155" cy="124" r="22" fill="none" stroke="#14b8a6" strokeWidth="3" opacity="0.7" />
            <circle cx="155" cy="124" r="32" fill="none" stroke="#99f6e4" strokeWidth="2" opacity="0.85" />
        </g>
    );
}

function MeasureScene({ live }: { live: boolean }) {
    return (
        <g>
            <ellipse cx="140" cy="198" rx="78" ry="10" fill="#e2e8f0" />
            <Device />
            <path
                d="M100 88h8l4-10 6 22 5-16 4 8h18"
                stroke="#4ade80"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
            {live ? <circle cx="228" cy="72" r="7" fill="#ef4444" /> : null}
        </g>
    );
}

function WaitScene() {
    return (
        <g>
            <ellipse cx="140" cy="198" rx="78" ry="10" fill="#e2e8f0" />
            <Device />
            <text x="140" y="94" textAnchor="middle" fill="#4ade80" fontSize="13" fontWeight="800" fontFamily="Segoe UI, sans-serif">
                128 / 82
            </text>
        </g>
    );
}
