import type { LucideIcon } from 'lucide-react';
import { ChevronLeft } from 'lucide-react';
import type { ReactNode } from 'react';

type IconProps = {
    icon: LucideIcon;
    size?: number;
    strokeWidth?: number;
    className?: string;
};

export function KioskIcon({ icon: Icon, size = 22, strokeWidth = 2, className }: IconProps) {
    return <Icon className={className} size={size} strokeWidth={strokeWidth} aria-hidden />;
}

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
