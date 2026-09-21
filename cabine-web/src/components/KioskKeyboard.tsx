import { Delete } from 'lucide-react';
import { useState } from 'react';

const ROWS = [
    ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
    ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'],
    ['z', 'x', 'c', 'v', 'b', 'n', 'm'],
] as const;

const ACCENTS = ['á', 'é', 'í', 'ó', 'ú', 'ã', 'õ', 'ç'] as const;

type Props = {
    onChar: (value: string) => void;
    onBackspace: () => void;
    disabled?: boolean;
};

export function KioskKeyboard({ onChar, onBackspace, disabled }: Props) {
    const [shifted, setShifted] = useState(true);

    function typeChar(value: string) {
        const next = shifted ? value.toUpperCase() : value;
        onChar(next);
        if (shifted) setShifted(false);
    }

    return (
        <div className="kiosk-keyboard" role="group" aria-label="Teclado">
            <div className="kiosk-keyboard-accents">
                {ACCENTS.map((char) => (
                    <button
                        key={char}
                        type="button"
                        className="kiosk-keyboard-key kiosk-keyboard-key-accent"
                        disabled={disabled}
                        onClick={() => typeChar(char)}
                    >
                        {shifted ? char.toUpperCase() : char}
                    </button>
                ))}
            </div>
            {ROWS.map((row, index) => (
                <div key={row.join('')} className={`kiosk-keyboard-row${index === 2 ? ' is-bottom' : ''}`}>
                    {index === 2 ? (
                        <button
                            type="button"
                            className={`kiosk-keyboard-key kiosk-keyboard-key-action${shifted ? ' is-on' : ''}`}
                            disabled={disabled}
                            onClick={() => setShifted((prev) => !prev)}
                            aria-pressed={shifted}
                        >
                            ⇧
                        </button>
                    ) : null}
                    {row.map((char) => (
                        <button
                            key={char}
                            type="button"
                            className="kiosk-keyboard-key"
                            disabled={disabled}
                            onClick={() => typeChar(char)}
                        >
                            {shifted ? char.toUpperCase() : char}
                        </button>
                    ))}
                    {index === 2 ? (
                        <button
                            type="button"
                            className="kiosk-keyboard-key kiosk-keyboard-key-action"
                            disabled={disabled}
                            onClick={onBackspace}
                            aria-label="Apagar"
                        >
                            <Delete size={22} strokeWidth={2.1} aria-hidden />
                        </button>
                    ) : null}
                </div>
            ))}
            <div className="kiosk-keyboard-row">
                <button
                    type="button"
                    className="kiosk-keyboard-key kiosk-keyboard-key-space"
                    disabled={disabled}
                    onClick={() => {
                        onChar(' ');
                        setShifted(true);
                    }}
                >
                    espaço
                </button>
            </div>
        </div>
    );
}
