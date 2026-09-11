import type { MentalInstrumentId, MentalResult } from '../../session/cabineSession';
import { HAD_ITEMS, type InstrumentItem } from './instruments';

export function routeInstrument(p: number[]): { primary: MentalInstrumentId; optional: MentalInstrumentId | null } {
    const had = p[0] >= 2 || p[1] >= 2 || p[3] >= 2;
    const audit = p[2] >= 2;
    if (had) return { primary: 'HAD', optional: audit ? 'AUDIT' : null };
    if (audit) return { primary: 'AUDIT', optional: null };
    return { primary: 'WHO-5', optional: null };
}

function sumScores(items: InstrumentItem[], answers: number[]) {
    return items.reduce((total, item, index) => total + (item.options[answers[index]]?.score ?? 0), 0);
}

export function scoreHad(answers: number[]): MentalResult {
    const hadA = HAD_ITEMS.reduce((total, item, index) => {
        if (item.scale !== 'A') return total;
        return total + (item.options[answers[index]]?.score ?? 0);
    }, 0);
    const hadD = HAD_ITEMS.reduce((total, item, index) => {
        if (item.scale !== 'D') return total;
        return total + (item.options[answers[index]]?.score ?? 0);
    }, 0);
    const max = Math.max(hadA, hadD);
    let band = 'Sem sintomas relevantes';
    let tone: MentalResult['tone'] = 'ok';
    if (max >= 11) {
        band = 'Sintomas relevantes';
        tone = 'alert';
    } else if (max >= 8) {
        band = 'Sintomas leves';
        tone = 'watch';
    }
    return { instrument: 'HAD', score: max, hadA, hadD, band, tone };
}

export function scoreAudit(answers: number[], items: InstrumentItem[]): MentalResult {
    const score = sumScores(items, answers);
    let band = 'Zona I — consumo de baixo risco';
    let tone: MentalResult['tone'] = 'ok';
    if (score >= 20) {
        band = 'Zona IV — faixa que merece avaliação especializada';
        tone = 'alert';
    } else if (score >= 16) {
        band = 'Zona III — consumo nocivo';
        tone = 'alert';
    } else if (score >= 8) {
        band = 'Zona II — consumo de risco';
        tone = 'watch';
    }
    return { instrument: 'AUDIT', score, band, tone };
}

export function scoreWho5(answers: number[], items: InstrumentItem[]): MentalResult {
    const raw = sumScores(items, answers);
    const score = raw * 4;
    let band = 'Bem-estar adequado';
    let tone: MentalResult['tone'] = 'ok';
    if (score <= 28) {
        band = 'Bem-estar baixo';
        tone = 'alert';
    } else if (score <= 50) {
        band = 'Bem-estar reduzido';
        tone = 'watch';
    }
    return { instrument: 'WHO-5', score, band, tone };
}

export function scoreInstrument(id: MentalInstrumentId, answers: number[], items: InstrumentItem[]): MentalResult {
    if (id === 'HAD') return scoreHad(answers);
    if (id === 'AUDIT') return scoreAudit(answers, items);
    return scoreWho5(answers, items);
}

export function needsSafety(results: MentalResult[]) {
    return results.some((result) => {
        if (result.instrument === 'HAD') return (result.hadA ?? 0) >= 15 || (result.hadD ?? 0) >= 15;
        if (result.instrument === 'AUDIT') return result.score >= 20;
        return false;
    });
}

export function pickPatientResult(results: MentalResult[]): MentalResult | undefined {
    return results.find((item) => item.instrument === 'HAD')
        ?? results.find((item) => item.instrument === 'AUDIT')
        ?? results.find((item) => item.instrument === 'WHO-5');
}

export function resultCopy(result: MentalResult) {
    if (result.instrument === 'HAD') {
        if ((result.hadA ?? 0) >= 11 || (result.hadD ?? 0) >= 11) {
            return 'Seu rastreio indica vários sintomas de ansiedade e humor nas últimas duas semanas. Pode ser útil conversar com um profissional de saúde.';
        }
        if ((result.hadA ?? 0) >= 8 || (result.hadD ?? 0) >= 8) {
            return 'Seu rastreio indica alguns sintomas. Vale observar como você se sente nas próximas semanas e, se quiser, conversar com um profissional de saúde.';
        }
        return 'Seu rastreio não indica sintomas relevantes neste momento. Continue cuidando do sono, da atividade física e das suas relações.';
    }
    if (result.instrument === 'AUDIT') {
        if (result.score >= 20) {
            return 'Seu padrão de consumo está em uma faixa que merece avaliação especializada.';
        }
        if (result.score >= 16) {
            return 'Seu padrão de consumo está em uma faixa que merece conversa com um profissional e acompanhamento.';
        }
        if (result.score >= 8) {
            return 'Seu padrão de consumo está em uma faixa que merece atenção. Reduzir a frequência pode fazer diferença.';
        }
        return 'Seu padrão de consumo está em uma faixa de baixo risco. Vale manter o cuidado com a frequência e a quantidade.';
    }
    if (result.score <= 28) {
        return 'Seus indicadores de bem-estar estão baixos. Cuidar do sono, da rotina e das relações pode ajudar. Se quiser, um profissional pode conversar com você.';
    }
    if (result.score <= 50) {
        return 'Seus indicadores de bem-estar estão reduzidos. Cuidar do sono, da rotina e das relações pode ajudar. Vale repetir a avaliação em cerca de 30 dias.';
    }
    return 'Seus indicadores de bem-estar estão adequados. Continue cuidando do seu sono, da atividade física e das suas relações.';
}

export function patientResultCopy(results: MentalResult[]) {
    const result = pickPatientResult(results);
    if (!result) return 'Obrigado por responder. Este é um rastreio e não estabelece diagnóstico.';
    return resultCopy(result);
}
