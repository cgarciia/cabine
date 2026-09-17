type OxiGuide = 'searching' | 'finger' | 'reading' | 'done';

type Props = {
    step: OxiGuide;
    spo2?: number | null;
    pulse?: number | null;
};

/** Arte CC0 (Openclipart — Pulse Oximeter 2, Arvin61r58). */
export function OximeterGuideIllustration({ step }: Props) {
    return (
        <div className={`kiosk-oximeter-art kiosk-oximeter-art--${step}`} aria-hidden>
            <img
                className="kiosk-oxi-asset"
                src="/kiosk/oximeter-guide.svg"
                alt=""
                width={280}
                height={290}
            />
        </div>
    );
}
