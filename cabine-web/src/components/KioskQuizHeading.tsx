import { ChevronLeft } from 'lucide-react';

type Props = {
    category: string;
    onBack?: () => void;
};

export function KioskQuizHeading({ category, onBack }: Props) {
    return (
        <div className="kiosk-quiz-heading">
            {onBack ? (
                <button type="button" className="kiosk-back" onClick={onBack}>
                    <ChevronLeft size={22} strokeWidth={2.25} aria-hidden />
                    Voltar
                </button>
            ) : null}
            <div className="kiosk-quiz-category">{category}</div>
        </div>
    );
}
