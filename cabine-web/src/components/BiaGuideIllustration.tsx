type BiaStep = 'step_on' | 'hold_bar' | 'extend_bar' | 'measuring' | 'done' | string;

type Props = {
    step: BiaStep;
};

const ASSETS: Record<'scale' | 'hold' | 'hold40', { src: string; width: number; height: number }> = {
    scale: { src: '/kiosk/bia-guide-feet.png', width: 640, height: 640 },
    hold: { src: '/kiosk/bia-guide-hold.png', width: 640, height: 640 },
    hold40: { src: '/kiosk/bia-guide-arms.png', width: 640, height: 640 },
};

/** Ilustrações de orientação da bioimpedância no totem (pés nos eletrodos, barra, braços a 40°). */
export function BiaGuideIllustration({ step }: Props) {
    const kind =
        step === 'extend_bar' || step === 'measuring' || step === 'done'
            ? 'hold40'
            : step === 'hold_bar'
                ? 'hold'
                : 'scale';
    const asset = ASSETS[kind];

    return (
        <div className={`kiosk-bia-art kiosk-bia-art--${kind}`} aria-hidden>
            <img
                className="kiosk-bia-asset"
                src={asset.src}
                alt=""
                width={asset.width}
                height={asset.height}
            />
        </div>
    );
}
