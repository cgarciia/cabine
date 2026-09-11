export type QuestionKind = 'single' | 'multiple';

export type QuestionOption = {
    id: string;
    label: string;
    score: number;
};

export type Question = {
    id: string;
    text: string;
    kind: QuestionKind;
    options: QuestionOption[];
};

export type QuestionnaireDef = {
    id: 'saude_geral' | 'saude_mental';
    title: string;
    category: string;
    estimatedSeconds: number;
    questions: Question[];
};

/** Conteúdo provisório autorizado para o MVP1 (4 perguntas por formulário). */
export const SAUDE_GERAL: QuestionnaireDef = {
    id: 'saude_geral',
    title: 'Questionário Saúde Geral',
    category: 'Saúde Geral',
    estimatedSeconds: 90,
    questions: [
        {
            id: 'sg1',
            text: 'Como você considera sua saúde atualmente?',
            kind: 'single',
            options: [
                { id: 'a', label: 'Muito boa', score: 3 },
                { id: 'b', label: 'Boa', score: 2 },
                { id: 'c', label: 'Regular', score: 1 },
                { id: 'd', label: 'Ruim', score: 0 },
            ],
        },
        {
            id: 'sg2',
            text: 'Com que frequência você pratica atividade física?',
            kind: 'single',
            options: [
                { id: 'a', label: 'Quase todos os dias', score: 3 },
                { id: 'b', label: '3 ou mais vezes por semana', score: 2 },
                { id: 'c', label: '1 a 2 vezes por semana', score: 1 },
                { id: 'd', label: 'Raramente ou nunca', score: 0 },
            ],
        },
        {
            id: 'sg3',
            text: 'Como está a qualidade do seu sono?',
            kind: 'single',
            options: [
                { id: 'a', label: 'Excelente', score: 3 },
                { id: 'b', label: 'Boa', score: 2 },
                { id: 'c', label: 'Regular', score: 1 },
                { id: 'd', label: 'Ruim', score: 0 },
            ],
        },
        {
            id: 'sg4',
            text: 'Como avalia seu nível de energia no dia a dia?',
            kind: 'single',
            options: [
                { id: 'a', label: 'Alto', score: 3 },
                { id: 'b', label: 'Bom', score: 2 },
                { id: 'c', label: 'Baixo', score: 1 },
                { id: 'd', label: 'Muito baixo', score: 0 },
            ],
        },
    ],
};

export const SAUDE_MENTAL: QuestionnaireDef = {
    id: 'saude_mental',
    title: 'Questionário Saúde Mental',
    category: 'Saúde Mental',
    estimatedSeconds: 60,
    questions: [
        {
            id: 'sm1',
            text: 'Nas últimas 2 semanas, com que frequência se sentiu nervoso?',
            kind: 'single',
            options: [
                { id: 'a', label: 'Nenhuma vez', score: 0 },
                { id: 'b', label: 'Alguns dias', score: 1 },
                { id: 'c', label: 'Mais da metade dos dias', score: 2 },
                { id: 'd', label: 'Quase todos os dias', score: 3 },
            ],
        },
        {
            id: 'sm2',
            text: 'Nas últimas 2 semanas, com que frequência teve dificuldade para relaxar?',
            kind: 'single',
            options: [
                { id: 'a', label: 'Nenhuma vez', score: 0 },
                { id: 'b', label: 'Alguns dias', score: 1 },
                { id: 'c', label: 'Mais da metade dos dias', score: 2 },
                { id: 'd', label: 'Quase todos os dias', score: 3 },
            ],
        },
        {
            id: 'sm3',
            text: 'Nas últimas 2 semanas, com que frequência se sentiu desanimado?',
            kind: 'single',
            options: [
                { id: 'a', label: 'Nenhuma vez', score: 0 },
                { id: 'b', label: 'Alguns dias', score: 1 },
                { id: 'c', label: 'Mais da metade dos dias', score: 2 },
                { id: 'd', label: 'Quase todos os dias', score: 3 },
            ],
        },
        {
            id: 'sm4',
            text: 'Nas últimas 2 semanas, com que frequência sentiu menos interesse nas atividades?',
            kind: 'single',
            options: [
                { id: 'a', label: 'Nenhuma vez', score: 0 },
                { id: 'b', label: 'Alguns dias', score: 1 },
                { id: 'c', label: 'Mais da metade dos dias', score: 2 },
                { id: 'd', label: 'Quase todos os dias', score: 3 },
            ],
        },
    ],
};

export type AnswerMap = Record<string, string[]>;

export type QuestionnaireScore = {
    total: number;
    max: number;
    percent: number;
    label: string;
    answers: AnswerMap;
};

export function scoreQuestionnaire(def: QuestionnaireDef, answers: AnswerMap): QuestionnaireScore {
    let total = 0;
    let max = 0;
    for (const question of def.questions) {
        const optionMax = Math.max(...question.options.map((o) => o.score));
        max += optionMax;
        const selected = answers[question.id] ?? [];
        for (const optionId of selected) {
            const option = question.options.find((o) => o.id === optionId);
            if (option) total += option.score;
        }
    }
    const percent = max > 0 ? Math.round((total / max) * 100) : 0;

    let label: string;
    if (def.id === 'saude_mental') {
        // pontuação alta = mais sintomas
        if (percent <= 25) label = 'Baixo indício de desconforto';
        else if (percent <= 50) label = 'Desconforto leve';
        else if (percent <= 75) label = 'Desconforto moderado';
        else label = 'Desconforto elevado';
    } else if (percent >= 75) label = 'Saúde geral boa';
    else if (percent >= 50) label = 'Saúde geral regular';
    else if (percent >= 25) label = 'Atenção à saúde geral';
    else label = 'Saúde geral baixa';

    return { total, max, percent, label, answers };
}
