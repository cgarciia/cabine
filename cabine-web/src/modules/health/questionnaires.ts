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
    /** Em múltipla escolha, selecionar esta opção limpa as demais e avança. */
    exclusiveOptionId?: string;
    /** Em única escolha, mostra campo de texto quando esta opção é escolhida. */
    followUpWhenOptionId?: string;
    /** Em múltipla escolha, mostra campo de texto quando esta opção está marcada. */
    followUpOptionId?: string;
    followUpPrompt?: string;
    followUpPlaceholder?: string;
};

export type QuestionnaireDef = {
    id: 'saude_geral' | 'saude_mental';
    title: string;
    category: string;
    estimatedSeconds: number;
    questions: Question[];
};

/** Triagem de saúde geral — Questionário de Triagem Cabine de Saúde. */
export const SAUDE_GERAL: QuestionnaireDef = {
    id: 'saude_geral',
    title: 'Questionário Saúde Geral',
    category: 'Saúde Geral',
    estimatedSeconds: 240,
    questions: [
        {
            id: 'sg1',
            text: 'Como você considera sua saúde atualmente?',
            kind: 'single',
            options: [
                { id: 'muito_boa', label: 'Muito boa', score: 4 },
                { id: 'boa', label: 'Boa', score: 3 },
                { id: 'regular', label: 'Regular', score: 2 },
                { id: 'ruim', label: 'Ruim', score: 1 },
                { id: 'muito_ruim', label: 'Muito ruim', score: 0 },
            ],
        },
        {
            id: 'sg2',
            text: 'Você possui alguma condição de saúde que acompanha ou trata atualmente?',
            kind: 'single',
            options: [
                { id: 'nao', label: 'Não', score: 2 },
                { id: 'sim', label: 'Sim', score: 1 },
            ],
            followUpWhenOptionId: 'sim',
            followUpPrompt: 'Qual?',
            followUpPlaceholder: 'Descreva a condição',
        },
        {
            id: 'sg3',
            text: 'Faz uso contínuo de algum medicamento?',
            kind: 'single',
            options: [
                { id: 'nao', label: 'Não', score: 2 },
                { id: 'sim', label: 'Sim', score: 1 },
            ],
            followUpWhenOptionId: 'sim',
            followUpPrompt: 'Qual(is)?',
            followUpPlaceholder: 'Liste o(s) medicamento(s)',
        },
        {
            id: 'sg4',
            text: 'Nos últimos 30 dias, apresentou algum destes sintomas?',
            kind: 'multiple',
            exclusiveOptionId: 'nenhum',
            followUpOptionId: 'outro',
            followUpPrompt: 'Qual?',
            followUpPlaceholder: 'Descreva o sintoma',
            options: [
                { id: 'dor_cabeca', label: 'Dor de cabeça frequente', score: 0 },
                { id: 'tontura', label: 'Tontura', score: 0 },
                { id: 'falta_ar', label: 'Falta de ar', score: 0 },
                { id: 'dor_peito', label: 'Dor ou desconforto no peito', score: 0 },
                { id: 'palpitacoes', label: 'Palpitações', score: 0 },
                { id: 'cansaco', label: 'Cansaço excessivo', score: 0 },
                { id: 'dores_musculares', label: 'Dores musculares ou articulares', score: 0 },
                { id: 'sono', label: 'Alterações do sono', score: 0 },
                { id: 'gastro', label: 'Alterações gastrointestinais', score: 0 },
                { id: 'nenhum', label: 'Nenhum dos anteriores', score: 3 },
                { id: 'outro', label: 'Outro', score: 0 },
            ],
        },
        {
            id: 'sg5',
            text: 'Como está a qualidade do seu sono?',
            kind: 'single',
            options: [
                { id: 'boa', label: 'Boa', score: 2 },
                { id: 'regular', label: 'Regular', score: 1 },
                { id: 'ruim', label: 'Ruim', score: 0 },
            ],
        },
        {
            id: 'sg6',
            text: 'Você pratica atividade física regularmente?',
            kind: 'single',
            options: [
                { id: 'sim', label: 'Sim', score: 2 },
                { id: 'as_vezes', label: 'Às vezes', score: 1 },
                { id: 'nao', label: 'Não', score: 0 },
            ],
        },
        {
            id: 'sg7',
            text: 'Você fuma ou utiliza produtos com nicotina?',
            kind: 'single',
            options: [
                { id: 'nao', label: 'Não', score: 2 },
                { id: 'sim', label: 'Sim', score: 0 },
                { id: 'parei', label: 'Já utilizei, mas parei', score: 1 },
            ],
        },
        {
            id: 'sg8',
            text: 'Com que frequência consome bebidas alcoólicas?',
            kind: 'single',
            options: [
                { id: 'nao', label: 'Não consumo', score: 4 },
                { id: 'raramente', label: 'Raramente', score: 3 },
                { id: 'mes', label: 'Algumas vezes por mês', score: 2 },
                { id: 'semana', label: 'Algumas vezes por semana', score: 1 },
                { id: 'diario', label: 'Diariamente', score: 0 },
            ],
        },
        {
            id: 'sg9',
            text: 'Nos últimos meses, precisou procurar atendimento médico por algum problema de saúde?',
            kind: 'single',
            options: [
                { id: 'nao', label: 'Não', score: 2 },
                { id: 'sim', label: 'Sim', score: 1 },
            ],
            followUpWhenOptionId: 'sim',
            followUpPrompt: 'Motivo:',
            followUpPlaceholder: 'Informe o motivo',
        },
        {
            id: 'sg10',
            text: 'Existe alguma questão relacionada à sua saúde que gostaria de informar ou acompanhar?',
            kind: 'single',
            options: [
                { id: 'nao', label: 'Não', score: 1 },
                { id: 'sim', label: 'Sim', score: 1 },
            ],
            followUpWhenOptionId: 'sim',
            followUpPrompt: 'Qual?',
            followUpPlaceholder: 'Descreva o que gostaria de informar',
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
export type DetailMap = Record<string, string>;

export type HealthFinding = {
    code: string;
    title: string;
    detail: string;
};

export type QuestionnaireScore = {
    total: number;
    max: number;
    percent: number;
    label: string;
    answers: AnswerMap;
    details: DetailMap;
    findings: HealthFinding[];
    items: { id: string; text: string; answer: string; detail?: string }[];
};

export function questionDetailKey(questionId: string) {
    return questionId;
}

export function followUpVisible(question: Question, selected: string[]): boolean {
    if (question.kind === 'single' && question.followUpWhenOptionId) {
        return selected.includes(question.followUpWhenOptionId);
    }
    if (question.kind === 'multiple' && question.followUpOptionId) {
        return selected.includes(question.followUpOptionId);
    }
    return false;
}

export function isQuestionAnswered(
    question: Question,
    selected: string[],
    detail: string,
): boolean {
    if (selected.length === 0) return false;
    if (followUpVisible(question, selected) && !detail.trim()) return false;
    return true;
}

export function scoreQuestionnaire(
    def: QuestionnaireDef,
    answers: AnswerMap,
    details: DetailMap = {},
): QuestionnaireScore {
    let total = 0;
    let max = 0;
    for (const question of def.questions) {
        if (question.kind === 'multiple' && question.exclusiveOptionId) {
            const exclusive = question.options.find((o) => o.id === question.exclusiveOptionId);
            max += exclusive?.score ?? 0;
        } else {
            max += Math.max(...question.options.map((o) => o.score), 0);
        }
        const selected = answers[question.id] ?? [];
        for (const optionId of selected) {
            const option = question.options.find((o) => o.id === optionId);
            if (option) total += option.score;
        }
    }
    const percent = max > 0 ? Math.round((total / max) * 100) : 0;

    let label: string;
    if (def.id === 'saude_mental') {
        if (percent <= 25) label = 'Baixo indício de desconforto';
        else if (percent <= 50) label = 'Desconforto leve';
        else if (percent <= 75) label = 'Desconforto moderado';
        else label = 'Desconforto elevado';
    } else if (percent >= 75) label = 'Saúde geral boa';
    else if (percent >= 50) label = 'Saúde geral regular';
    else if (percent >= 25) label = 'Atenção à saúde geral';
    else label = 'Saúde geral baixa';

    const items = def.questions.map((question) => {
        const selected = answers[question.id] ?? [];
        const answer = selected
            .map((id) => question.options.find((option) => option.id === id)?.label ?? id)
            .join(', ');
        const detail = details[question.id]?.trim() || undefined;
        return { id: question.id, text: question.text, answer, detail };
    });

    return {
        total,
        max,
        percent,
        label,
        answers,
        details,
        items,
        findings: detectHealthFindings(def, answers, details, label, percent),
    };
}

function selectedIds(answers: AnswerMap, questionId: string): string[] {
    return answers[questionId] ?? [];
}

function optionLabels(def: QuestionnaireDef, questionId: string, ids: string[]): string {
    const question = def.questions.find((item) => item.id === questionId);
    if (!question) return ids.join(', ');
    return ids
        .map((id) => question.options.find((option) => option.id === id)?.label ?? id)
        .join(', ');
}

export function detectHealthFindings(
    def: QuestionnaireDef,
    answers: AnswerMap,
    details: DetailMap,
    label: string,
    percent: number,
): HealthFinding[] {
    if (def.id !== 'saude_geral') {
        return [{ code: 'overall', title: label, detail: 'Resultado da triagem.' }];
    }

    const findings: HealthFinding[] = [];
    if (percent < 75) {
        findings.push({
            code: 'overall',
            title: label,
            detail: percent < 50
                ? 'A triagem aponta vários pontos de atenção. Vale conversar com um profissional de saúde.'
                : 'Há hábitos ou sintomas que merecem acompanhamento.',
        });
    }

    const sg1 = selectedIds(answers, 'sg1');
    if (sg1.includes('ruim') || sg1.includes('muito_ruim')) {
        findings.push({
            code: 'sg1',
            title: 'Autoavaliação de saúde baixa',
            detail: optionLabels(def, 'sg1', sg1),
        });
    }

    if (selectedIds(answers, 'sg2').includes('sim')) {
        findings.push({
            code: 'sg2',
            title: 'Condição de saúde em acompanhamento',
            detail: details.sg2?.trim() || 'Informou condição em tratamento.',
        });
    }

    if (selectedIds(answers, 'sg3').includes('sim')) {
        findings.push({
            code: 'sg3',
            title: 'Uso contínuo de medicamento',
            detail: details.sg3?.trim() || 'Informou medicamento de uso contínuo.',
        });
    }

    const symptoms = selectedIds(answers, 'sg4').filter((id) => id !== 'nenhum');
    if (symptoms.length) {
        const extra = details.sg4?.trim();
        findings.push({
            code: 'sg4',
            title: 'Sintomas recentes',
            detail: [optionLabels(def, 'sg4', symptoms), extra].filter(Boolean).join(' — '),
        });
    }

    if (selectedIds(answers, 'sg5').includes('ruim')) {
        findings.push({
            code: 'sg5',
            title: 'Qualidade do sono ruim',
            detail: 'Relatou sono ruim nas últimas semanas.',
        });
    }

    if (selectedIds(answers, 'sg6').includes('nao')) {
        findings.push({
            code: 'sg6',
            title: 'Pouca atividade física',
            detail: 'Não pratica atividade física regularmente.',
        });
    }

    if (selectedIds(answers, 'sg7').includes('sim')) {
        findings.push({
            code: 'sg7',
            title: 'Uso de nicotina',
            detail: 'Fuma ou utiliza produtos com nicotina.',
        });
    }

    const alcohol = selectedIds(answers, 'sg8');
    if (alcohol.includes('semana') || alcohol.includes('diario')) {
        findings.push({
            code: 'sg8',
            title: 'Consumo frequente de álcool',
            detail: optionLabels(def, 'sg8', alcohol),
        });
    }

    if (selectedIds(answers, 'sg9').includes('sim')) {
        findings.push({
            code: 'sg9',
            title: 'Atendimento médico recente',
            detail: details.sg9?.trim() || 'Procurou atendimento nos últimos meses.',
        });
    }

    if (selectedIds(answers, 'sg10').includes('sim')) {
        findings.push({
            code: 'sg10',
            title: 'Questão de saúde a acompanhar',
            detail: details.sg10?.trim() || 'Pediu para informar ou acompanhar um tema de saúde.',
        });
    }

    return findings;
}
