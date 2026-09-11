export type HealthQuestion =
    | {
          id: string;
          text: string;
          type: 'radio';
          options: string[];
          followUpWhen?: string;
          followUpPrompt?: string;
          followUpPlaceholder?: string;
      }
    | {
          id: string;
          text: string;
          type: 'checkbox';
          options: string[];
          exclusiveOption?: string;
          followUpOption?: string;
          followUpPrompt?: string;
          followUpPlaceholder?: string;
      };

export const HEALTH_QUESTIONS: HealthQuestion[] = [
    {
        id: '1_1',
        text: 'Como você considera sua saúde atualmente?',
        type: 'radio',
        options: ['Muito boa', 'Boa', 'Regular', 'Ruim', 'Muito ruim'],
    },
    {
        id: '1_2',
        text: 'Você possui alguma condição de saúde que acompanha ou trata atualmente?',
        type: 'radio',
        options: ['Não', 'Sim'],
        followUpWhen: 'Sim',
        followUpPrompt: 'Qual?',
        followUpPlaceholder: 'Descreva a condição',
    },
    {
        id: '1_3',
        text: 'Faz uso contínuo de algum medicamento?',
        type: 'radio',
        options: ['Não', 'Sim'],
        followUpWhen: 'Sim',
        followUpPrompt: 'Qual(is)?',
        followUpPlaceholder: 'Liste o(s) medicamento(s)',
    },
    {
        id: '1_4',
        text: 'Nos últimos 30 dias, apresentou algum destes sintomas?',
        type: 'checkbox',
        options: [
            'Dor de cabeça frequente',
            'Tontura',
            'Falta de ar',
            'Dor ou desconforto no peito',
            'Palpitações',
            'Cansaço excessivo',
            'Dores musculares ou articulares',
            'Alterações do sono',
            'Alterações gastrointestinais',
            'Nenhum dos anteriores',
            'Outro',
        ],
        exclusiveOption: 'Nenhum dos anteriores',
        followUpOption: 'Outro',
        followUpPrompt: 'Qual?',
        followUpPlaceholder: 'Descreva o sintoma',
    },
    {
        id: '1_5',
        text: 'Como está a qualidade do seu sono?',
        type: 'radio',
        options: ['Boa', 'Regular', 'Ruim'],
    },
    {
        id: '1_6',
        text: 'Você pratica atividade física regularmente?',
        type: 'radio',
        options: ['Sim', 'Às vezes', 'Não'],
    },
    {
        id: '1_7',
        text: 'Você fuma ou utiliza produtos com nicotina?',
        type: 'radio',
        options: ['Não', 'Sim', 'Já utilizei, mas parei'],
    },
    {
        id: '1_8',
        text: 'Com que frequência consome bebidas alcoólicas?',
        type: 'radio',
        options: ['Não consumo', 'Raramente', 'Algumas vezes por mês', 'Algumas vezes por semana', 'Diariamente'],
    },
    {
        id: '1_9',
        text: 'Nos últimos meses, precisou procurar atendimento médico por algum problema de saúde?',
        type: 'radio',
        options: ['Não', 'Sim'],
        followUpWhen: 'Sim',
        followUpPrompt: 'Motivo:',
        followUpPlaceholder: 'Informe o motivo',
    },
    {
        id: '1_10',
        text: 'Existe alguma questão relacionada à sua saúde que gostaria de informar ou acompanhar?',
        type: 'radio',
        options: ['Não', 'Sim'],
        followUpWhen: 'Sim',
        followUpPrompt: 'Qual?',
        followUpPlaceholder: 'Descreva o que gostaria de informar',
    },
];

export function healthDetailKey(questionId: string) {
    return `${questionId}_detail`;
}

export function healthDetailText(answers: Record<string, string | string[]>, questionId: string) {
    const value = answers[healthDetailKey(questionId)];
    return typeof value === 'string' ? value : '';
}

export function healthFollowUpVisible(question: HealthQuestion, value: string | string[] | undefined) {
    if (question.type === 'radio') {
        return Boolean(question.followUpWhen && value === question.followUpWhen);
    }
    return Boolean(question.followUpOption && Array.isArray(value) && value.includes(question.followUpOption));
}

export function isHealthAnswered(question: HealthQuestion, answers: Record<string, string | string[]>) {
    const value = answers[question.id];
    const detail = healthDetailText(answers, question.id).trim();
    if (question.type === 'checkbox') {
        if (!Array.isArray(value) || value.length === 0) return false;
        if (question.followUpOption && value.includes(question.followUpOption)) return detail.length > 0;
        return true;
    }
    if (typeof value !== 'string' || value.length === 0) return false;
    if (question.followUpWhen && value === question.followUpWhen) return detail.length > 0;
    return true;
}

export function formatHealthAnswer(question: HealthQuestion, answers: Record<string, string | string[]>) {
    const value = answers[question.id];
    const detail = healthDetailText(answers, question.id).trim();
    if (question.type === 'checkbox') {
        const selected = Array.isArray(value) ? value : [];
        return selected.map((option) => {
            if (question.followUpOption && option === question.followUpOption && detail) {
                return `Outro: ${detail}`;
            }
            return option;
        });
    }
    if (typeof value !== 'string' || !value) return '';
    if (question.followUpWhen && value === question.followUpWhen && detail) {
        const prompt = question.followUpPrompt?.replace(/[:?]\s*$/, '') ?? '';
        return prompt ? `Sim. ${prompt}: ${detail}` : `Sim: ${detail}`;
    }
    return value;
}
