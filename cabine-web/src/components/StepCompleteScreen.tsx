type Props = {
    title: string;
    description: string;
    nextLabel: string;
    onNext: () => void;
    onMenu: () => void;
    hint?: string;
};

export function StepCompleteScreen({
    title,
    description,
    nextLabel,
    onNext,
    onMenu,
    hint,
}: Props) {
    return (
        <div className="kiosk-center-card kiosk-step-complete">
            <div className="kiosk-success-ring" aria-hidden />
            <h1 className="kiosk-title">{title}</h1>
            <p className="kiosk-subtitle">{description}</p>
            {hint ? <p className="kiosk-step-complete-hint">{hint}</p> : null}
            <p className="kiosk-subtitle">Quer ir para a próxima etapa agora?</p>
            <div className="kiosk-menu-actions">
                <button
                    type="button"
                    className="kiosk-btn kiosk-btn-primary kiosk-btn-xl"
                    onClick={onNext}
                >
                    {nextLabel}
                </button>
                <button type="button" className="kiosk-btn kiosk-btn-ghost" onClick={onMenu}>
                    Voltar ao menu
                </button>
            </div>
        </div>
    );
}
