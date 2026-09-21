import type { MentalResult } from '../types/mental';
import type { ScaleMetrics } from '../types/measurement';

export function mentalAdvice(results: MentalResult[] | undefined, refused?: boolean): string[] {
    if (refused) {
        return ['Tudo bem não responder agora. Se quiser conversar depois, o RH pode indicar os canais de apoio sem você precisar contar o resultado.'];
    }
    const tone = results?.some((item) => item.tone === 'alert')
        ? 'alert'
        : results?.some((item) => item.tone === 'watch')
            ? 'watch'
            : 'ok';
    if (tone === 'alert') {
        return [
            'Pode ser um bom momento para conversar com alguém de confiança ou com um profissional de saúde.',
            'Cuidar do sono, da rotina e das relações ajuda. Se quiser conversar, um amigo, um familiar, um profissional de saúde ou o CVV 188 (24 horas) podem ser um apoio.',
            'Nada aqui é diagnóstico. O detalhamento fica com o profissional.',
        ];
    }
    if (tone === 'watch') {
        return [
            'Nas próximas semanas, observe como você se sente e reserve pequenos intervalos de descanso.',
            'Movimento, sono e conversa com pessoas de confiança costumam ajudar.',
            'Se quiser, um profissional pode acompanhar isso com mais calma. Este retorno não classifica você.',
        ];
    }
    return [
        'Siga cuidando do sono, da atividade física e das suas relações.',
        'Se em algum momento quiser conversar, o RH pode indicar os canais de apoio sem você precisar explicar o questionário.',
    ];
}

export function biaAdvice(metrics: ScaleMetrics | null | undefined, weightKg: number | null): string[] {
    const recs: string[] = [];
    if (metrics?.agua_status === 'baixo') {
        recs.push('Distribuir água ao longo do dia costuma ajudar na disposição.');
    }
    if (metrics?.gordura_pct_status === 'alto' || metrics?.imc_status === 'alto' || (metrics?.gordura_visceral != null && metrics.gordura_visceral >= 10)) {
        recs.push('Incluir movimento na semana e uma alimentação mais regular são cuidados úteis. Um profissional pode montar o plano com você.');
    }
    if (metrics?.gordura_pct_status === 'baixo' || metrics?.imc_status === 'baixo') {
        recs.push('Manter refeições consistentes e, se possível, algum fortalecimento ajuda o corpo a se organizar.');
    }
    if (metrics?.equilibrio && ((metrics.equilibrio.bracos_diff_pct ?? 0) >= 10 || (metrics.equilibrio.pernas_diff_pct ?? 0) >= 10)) {
        recs.push('Variar o movimento dos dois lados do corpo na rotina de exercícios pode ser interessante.');
    }
    if (!recs.length) {
        recs.push(weightKg != null
            ? 'A medição foi registrada. Manter rotina de movimento, alimentação e descanso já é um bom cuidado.'
            : 'Quando a medição terminar, um profissional poderá olhar os detalhes com você.');
    }
    recs.push('Os números completos e qualquer classificação ficam com o profissional de saúde.');
    return recs.slice(0, 3);
}
