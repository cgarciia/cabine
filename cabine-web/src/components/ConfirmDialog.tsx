import { useEffect, useId, type ReactNode } from 'react';

type Props = {
    open: boolean;
    title: string;
    description: ReactNode;
    cancelLabel?: string;
    confirmLabel?: string;
    onCancel: () => void;
    onConfirm: () => void;
};

export const END_SESSION_CONFIRM = {
    title: 'Deseja encerrar?',
    description: 'A sessão será finalizada e você voltará à tela inicial.',
    cancelLabel: 'Voltar',
    confirmLabel: 'Continuar',
} as const;

export function ConfirmDialog({
    open,
    title,
    description,
    cancelLabel = 'Voltar',
    confirmLabel = 'Continuar',
    onCancel,
    onConfirm,
}: Props) {
    const titleId = useId();

    useEffect(() => {
        if (!open) return;

        function onKeyDown(event: KeyboardEvent) {
            if (event.key === 'Escape') onCancel();
        }

        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [open, onCancel]);

    if (!open) return null;

    return (
        <div className="kiosk-modal-backdrop no-print" onClick={onCancel}>
            <div
                className="kiosk-modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                onClick={(event) => event.stopPropagation()}
            >
                <h2 id={titleId}>{title}</h2>
                {typeof description === 'string' ? <p>{description}</p> : description}
                <div className="kiosk-modal-actions">
                    <button type="button" className="kiosk-btn kiosk-btn-ghost" onClick={onCancel}>
                        {cancelLabel}
                    </button>
                    <button type="button" className="kiosk-btn kiosk-btn-primary" onClick={onConfirm}>
                        {confirmLabel}
                    </button>
                </div>
            </div>
        </div>
    );
}
