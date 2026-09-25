import type { MentalResult } from '../types/mental';

export function oximeterAdvice(spo2: number | null, pulse: number | null, waiting: boolean): string {
    if (waiting || spo2 == null || pulse == null) {
        return 'Coloque o dedo até o fundo do oxímetro, sem apertar, e permaneça parado. A oxigenação e o pulso aparecem sozinhos.';
    }
    if (spo2 < 90) {
        return 'A saturação está baixa nesta leitura. Avise o profissional da cabine e não force exercício agora.';
    }
    if (spo2 < 95) {
        return 'A saturação está um pouco abaixo do usual. Sente-se, respire com calma e avise o profissional se continuar assim.';
    }
    if (pulse < 50 || pulse > 120) {
        return 'O pulso saiu da faixa comum de repouso. Vale repetir a leitura parado e conversar com o profissional.';
    }
    return 'Leitura dentro de uma faixa comum em repouso. Este número não substitui avaliação clínica.';
}

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