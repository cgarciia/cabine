import { Check } from 'lucide-react';
import { scaleCue, type ScaleTone } from '../utils/scaleCue';

type Props = {
    label: string;
    score: number;
    scores: number[];
    higherIsBetter: boolean;
    checkable?: boolean;
    checked?: boolean;
};

export function optionScaleClass(
    score: number,
    scores: number[],
    higherIsBetter: boolean,
): string {
    const cue = scaleCue(score, scores, higherIsBetter);
    return cue ? ` scale-${cue.tone}` : '';
}

export function KioskOptionContent({
    label,
    score,
    scores,
    higherIsBetter,
    checkable = false,
    checked = false,
}: Props) {
    const cue = scaleCue(score, scores, higherIsBetter);
    if (!cue && !checkable) return label;
    return (
        <span className="kiosk-option-scale">
            {checkable ? <OptionCheck on={checked} /> : null}
            {cue ? <ScaleFace tone={cue.tone} /> : null}
            <span>{label}</span>
        </span>
    );
}

function OptionCheck({ on }: { on: boolean }) {
    return (
        <span className={`kiosk-check${on ? ' is-on' : ''}`} aria-hidden>
            {on ? <Check className="kiosk-check-mark" size={16} strokeWidth={3} /> : null}
        </span>
    );
}

function ScaleFace({ tone }: { tone: ScaleTone }) {
    const fill = {
        good: '#22c55e',
        ok: '#84cc16',
        mid: '#eab308',
        poor: '#f97316',
        bad: '#ef4444',
    }[tone];
    const mouth = {
        good: 'M 9 20 C 12 24 20 24 23 20',
        ok: 'M 10 20 C 13 23 19 23 22 20',
        mid: 'M 10 21 H 22',
        poor: 'M 9 22 C 12 18 20 18 23 22',
        bad: 'M 9 23 C 12 17 20 17 23 23',
    }[tone];
    return (
        <svg className="kiosk-option-face" viewBox="0 0 32 32" aria-hidden>
            <circle cx="16" cy="16" r="14" fill={fill} />
            <circle cx="11" cy="13" r="2.1" fill="#0f172a" />
            <circle cx="21" cy="13" r="2.1" fill="#0f172a" />
            <path d={mouth} fill="none" stroke="#0f172a" strokeWidth="2.2" strokeLinecap="round" />
        </svg>
    );
}
