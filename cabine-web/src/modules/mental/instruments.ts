export type Choice = { label: string; score: number };

export type InstrumentItem = {
    id: string;
    text: string;
    options: Choice[];
    scale?: 'A' | 'D';
};

export const GATE_QUESTIONS = [
    'Nas últimas 2 semanas, com que frequência você se sentiu para baixo ou desanimado(a)?',
    'Nas últimas 2 semanas, com que frequência você se sentiu nervoso(a) ou tenso(a)?',
    'Nas últimas 2 semanas, com que frequência você bebeu mais do que pretendia?',
    'Nas últimas 2 semanas, com que frequência você dormiu mal ou se sentiu cansado(a) sem motivo?',
];

export const GATE_OPTIONS: Choice[] = [
    { label: 'Nenhuma vez', score: 0 },
    { label: 'Alguns dias', score: 1 },
    { label: 'Mais da metade dos dias', score: 2 },
    { label: 'Quase todos os dias', score: 3 },
];

const AUDIT_FREQ: Choice[] = [
    { label: 'Nunca', score: 0 },
    { label: 'Menos de uma vez por mês', score: 1 },
    { label: 'Uma vez por mês', score: 2 },
    { label: 'Uma vez por semana', score: 3 },
    { label: 'Todos ou quase todos os dias', score: 4 },
];

export const HAD_ITEMS: InstrumentItem[] = [
    {
        id: 'h1',
        scale: 'A',
        text: 'Eu me sinto tenso(a) ou contraído(a)',
        options: [
            { label: 'A maior parte do tempo', score: 3 },
            { label: 'Boa parte do tempo', score: 2 },
            { label: 'De vez em quando', score: 1 },
            { label: 'Nunca', score: 0 },
        ],
    },
    {
        id: 'h2',
        scale: 'D',
        text: 'Eu ainda sinto prazer nas coisas de que costumava gostar',
        options: [
            { label: 'Do mesmo jeito que antes', score: 0 },
            { label: 'Não tanto quanto antes', score: 1 },
            { label: 'Só um pouco', score: 2 },
            { label: 'Já não sinto mais prazer em nada', score: 3 },
        ],
    },
    {
        id: 'h3',
        scale: 'A',
        text: 'Eu sinto uma espécie de medo, como se alguma coisa ruim fosse acontecer',
        options: [
            { label: 'Sim, e muito forte', score: 3 },
            { label: 'Sim, mas não tão forte', score: 2 },
            { label: 'Um pouco, mas não me preocupa', score: 1 },
            { label: 'Não sinto nada disso', score: 0 },
        ],
    },
    {
        id: 'h4',
        scale: 'D',
        text: 'Dou risadas e me divirto quando vejo coisas engraçadas',
        options: [
            { label: 'Do mesmo jeito que antes', score: 0 },
            { label: 'Atualmente um pouco menos', score: 1 },
            { label: 'Atualmente bem menos', score: 2 },
            { label: 'Não consigo mais', score: 3 },
        ],
    },
    {
        id: 'h5',
        scale: 'A',
        text: 'Estou com a cabeça cheia de preocupações',
        options: [
            { label: 'A maior parte do tempo', score: 3 },
            { label: 'Boa parte do tempo', score: 2 },
            { label: 'De vez em quando', score: 1 },
            { label: 'Apenas ocasionalmente', score: 0 },
        ],
    },
    {
        id: 'h6',
        scale: 'D',
        text: 'Eu me sinto alegre',
        options: [
            { label: 'Nunca', score: 3 },
            { label: 'Poucas vezes', score: 2 },
            { label: 'Algumas vezes', score: 1 },
            { label: 'A maior parte do tempo', score: 0 },
        ],
    },
    {
        id: 'h7',
        scale: 'A',
        text: 'Consigo ficar sentado(a) à vontade e me sentir relaxado(a)',
        options: [
            { label: 'Sim, quase sempre', score: 0 },
            { label: 'Muitas vezes', score: 1 },
            { label: 'Poucas vezes', score: 2 },
            { label: 'Nunca', score: 3 },
        ],
    },
    {
        id: 'h8',
        scale: 'D',
        text: 'Eu estou lento(a) para pensar e fazer as coisas',
        options: [
            { label: 'Quase sempre', score: 3 },
            { label: 'Muitas vezes', score: 2 },
            { label: 'De vez em quando', score: 1 },
            { label: 'Nunca', score: 0 },
        ],
    },
    {
        id: 'h9',
        scale: 'A',
        text: 'Tenho uma sensação ruim de medo, como um frio na barriga ou aperto no estômago',
        options: [
            { label: 'Nunca', score: 0 },
            { label: 'De vez em quando', score: 1 },
            { label: 'Muitas vezes', score: 2 },
            { label: 'Quase sempre', score: 3 },
        ],
    },
    {
        id: 'h10',
        scale: 'D',
        text: 'Eu perdi o interesse em cuidar da minha aparência',
        options: [
            { label: 'Completamente', score: 3 },
            { label: 'Não estou me cuidando tanto quanto deveria', score: 2 },
            { label: 'Talvez não tanto quanto antes', score: 1 },
            { label: 'Me cuido do mesmo jeito que antes', score: 0 },
        ],
    },
    {
        id: 'h11',
        scale: 'A',
        text: 'Eu me sinto inquieto(a), como se não pudesse ficar parado(a)',
        options: [
            { label: 'Muito', score: 3 },
            { label: 'Bastante', score: 2 },
            { label: 'Um pouco', score: 1 },
            { label: 'Não me sinto assim', score: 0 },
        ],
    },
    {
        id: 'h12',
        scale: 'D',
        text: 'Fico animado(a) esperando coisas boas que estão por vir',
        options: [
            { label: 'Do mesmo jeito que antes', score: 0 },
            { label: 'Um pouco menos do que antes', score: 1 },
            { label: 'Bem menos do que antes', score: 2 },
            { label: 'Quase nunca', score: 3 },
        ],
    },
    {
        id: 'h13',
        scale: 'A',
        text: 'De repente, tenho a sensação de entrar em pânico',
        options: [
            { label: 'Com muita frequência', score: 3 },
            { label: 'Com bastante frequência', score: 2 },
            { label: 'Não com muita frequência', score: 1 },
            { label: 'Nunca', score: 0 },
        ],
    },
    {
        id: 'h14',
        scale: 'D',
        text: 'Consigo sentir prazer ao assistir a um bom programa de TV, rádio ou ao ler algo',
        options: [
            { label: 'Quase sempre', score: 0 },
            { label: 'Algumas vezes', score: 1 },
            { label: 'Poucas vezes', score: 2 },
            { label: 'Quase nunca', score: 3 },
        ],
    },
];

export const AUDIT_ITEMS: InstrumentItem[] = [
    {
        id: 'a1',
        text: 'Com que frequência você consome bebidas alcoólicas?',
        options: [
            { label: 'Nunca', score: 0 },
            { label: 'Uma vez por mês ou menos', score: 1 },
            { label: 'De 2 a 4 vezes por mês', score: 2 },
            { label: 'De 2 a 3 vezes por semana', score: 3 },
            { label: '4 ou mais vezes por semana', score: 4 },
        ],
    },
    {
        id: 'a2',
        text: 'Nas ocasiões em que bebe, quantas doses costuma consumir? (1 dose = 1 lata de cerveja, 1 taça de vinho ou 1 dose de destilado)',
        options: [
            { label: '1 ou 2', score: 0 },
            { label: '3 ou 4', score: 1 },
            { label: '5 ou 6', score: 2 },
            { label: '7, 8 ou 9', score: 3 },
            { label: '10 ou mais', score: 4 },
        ],
    },
    {
        id: 'a3',
        text: 'Com que frequência você consome 5 ou mais doses em uma única ocasião?',
        options: AUDIT_FREQ,
    },
    {
        id: 'a4',
        text: 'Nos últimos 12 meses, com que frequência percebeu que não conseguia parar de beber depois que começava?',
        options: AUDIT_FREQ,
    },
    {
        id: 'a5',
        text: 'Nos últimos 12 meses, com que frequência o fato de beber impediu que você fizesse o que era esperado?',
        options: AUDIT_FREQ,
    },
    {
        id: 'a6',
        text: 'Nos últimos 12 meses, com que frequência precisou beber logo pela manhã para funcionar após uma bebedeira?',
        options: AUDIT_FREQ,
    },
    {
        id: 'a7',
        text: 'Nos últimos 12 meses, com que frequência se sentiu culpado(a) ou com remorso depois de beber?',
        options: AUDIT_FREQ,
    },
    {
        id: 'a8',
        text: 'Nos últimos 12 meses, com que frequência não conseguiu lembrar o que aconteceu na noite anterior por causa da bebida?',
        options: AUDIT_FREQ,
    },
    {
        id: 'a9',
        text: 'Você ou outra pessoa já se machucou em decorrência do seu modo de beber?',
        options: [
            { label: 'Não', score: 0 },
            { label: 'Sim, mas não no último ano', score: 2 },
            { label: 'Sim, no último ano', score: 4 },
        ],
    },
    {
        id: 'a10',
        text: 'Algum familiar, amigo, médico ou profissional de saúde já se preocupou com seu modo de beber ou sugeriu que diminuísse?',
        options: [
            { label: 'Não', score: 0 },
            { label: 'Sim, mas não no último ano', score: 2 },
            { label: 'Sim, no último ano', score: 4 },
        ],
    },
];

const WHO5_OPTIONS: Choice[] = [
    { label: 'Todo o tempo', score: 5 },
    { label: 'Na maior parte do tempo', score: 4 },
    { label: 'Mais da metade do tempo', score: 3 },
    { label: 'Menos da metade do tempo', score: 2 },
    { label: 'Raramente', score: 1 },
    { label: 'Em nenhum momento', score: 0 },
];

export const WHO5_ITEMS: InstrumentItem[] = [
    { id: 'w1', text: 'Tenho me sentido animado(a) e de bom humor', options: WHO5_OPTIONS },
    { id: 'w2', text: 'Tenho me sentido calmo(a) e relaxado(a)', options: WHO5_OPTIONS },
    { id: 'w3', text: 'Tenho me sentido ativo(a) e vigoroso(a)', options: WHO5_OPTIONS },
    { id: 'w4', text: 'Acordei sentindo-me descansado(a) e renovado(a)', options: WHO5_OPTIONS },
    { id: 'w5', text: 'Meu dia a dia tem sido preenchido com coisas que me interessam', options: WHO5_OPTIONS },
];

export function instrumentItems(id: 'HAD' | 'AUDIT' | 'WHO-5') {
    if (id === 'HAD') return HAD_ITEMS;
    if (id === 'AUDIT') return AUDIT_ITEMS;
    return WHO5_ITEMS;
}

export function instrumentMinutes(id: 'HAD' | 'AUDIT' | 'WHO-5') {
    if (id === 'HAD') return 3;
    if (id === 'AUDIT') return 2;
    return 1;
}
