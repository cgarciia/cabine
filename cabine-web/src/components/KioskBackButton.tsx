import { ChevronLeft } from 'lucide-react';
import type { ReactNode } from 'react';

type BackProps = {
    onClick: () => void;
    children?: ReactNode;
};

export function KioskBackButton({ onClick, children = 'Voltar' }: BackProps) {
    return (
        <button type="button" className="kiosk-back" onClick={onClick}>
            <ChevronLeft size={22} strokeWidth={2.25} aria-hidden />
            {children}
        </button>
    );
}
