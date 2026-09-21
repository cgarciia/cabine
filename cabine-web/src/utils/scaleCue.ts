export type ScaleTone = 'good' | 'ok' | 'mid' | 'poor' | 'bad';

export type ScaleCue = {
    tone: ScaleTone;
};

/** Escala Likert (3+ níveis). `higherIsBetter` define se pontuação alta é o polo positivo. */
export function scaleCue(score: number, scores: number[], higherIsBetter: boolean): ScaleCue | null {
    const unique = [...new Set(scores)].sort((a, b) => a - b);
    if (unique.length < 3) return null;
    const min = unique[0];
    const max = unique[unique.length - 1];
    if (max === min) return null;
    let t = (score - min) / (max - min);
    if (!higherIsBetter) t = 1 - t;
    if (t >= 0.8) return { tone: 'good' };
    if (t >= 0.6) return { tone: 'ok' };
    if (t >= 0.4) return { tone: 'mid' };
    if (t >= 0.2) return { tone: 'poor' };
    return { tone: 'bad' };
}
