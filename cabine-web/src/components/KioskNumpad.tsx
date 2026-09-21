import { Delete } from 'lucide-react';

type Props = {
    onDigit: (digit: string) => void;
    onBackspace: () => void;
    disabled?: boolean;
};

const DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'] as const;

export function KioskNumpad({ onDigit, onBackspace, disabled }: Props) {
    return (
        <div className="kiosk-numpad" role="group" aria-label="Teclado numérico">
            {DIGITS.map((digit) => (
                <button
                    key={digit}
                    type="button"
                    className="kiosk-numpad-key"
                    disabled={disabled}
                    onClick={() => onDigit(digit)}
                >
                    {digit}
                </button>
            ))}
            <button
                type="button"
                className="kiosk-numpad-key kiosk-numpad-key-action"
                disabled={disabled}
                onClick={onBackspace}
                aria-label="Apagar"
            >
                <Delete size={28} strokeWidth={2.1} aria-hidden />
            </button>
            <button
                type="button"
                className="kiosk-numpad-key"
                disabled={disabled}
                onClick={() => onDigit('0')}
            >
                0
            </button>
            <span className="kiosk-numpad-spacer" aria-hidden />
        </div>
    );
}
