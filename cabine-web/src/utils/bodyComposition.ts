export type Sexo = 'feminino' | 'masculino';

export interface BodyCompositionInput {
    pesoKg: number;
    alturaCm: number;
    aniversario: string;
    sexo: Sexo;
}

export interface BodyCompositionResult {
    idade: number;
    imc: number;
    imcClassificacao: string;
    percentualGordura: number;
    massaGordaKg: number;
    massaMagraKg: number;
    aguaCorporalKg: number;
    aguaCorporalPct: number;
    tmbKcal: number;
}

export function ageFromBirthday(aniversario: string, hoje = new Date()): number {
    const [year, month, day] = aniversario.split('-').map(Number);
    const birth = new Date(year, month - 1, day);
    let age = hoje.getFullYear() - birth.getFullYear();
    const monthDiff = hoje.getMonth() - birth.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && hoje.getDate() < birth.getDate())) {
        age -= 1;
    }
    return Math.max(age, 0);
}

export function classifyBmi(imc: number): string {
    if (imc < 18.5) return 'Abaixo do peso';
    if (imc < 25) return 'Peso normal';
    if (imc < 30) return 'Sobrepeso';
    if (imc < 35) return 'Obesidade grau I';
    if (imc < 40) return 'Obesidade grau II';
    return 'Obesidade grau III';
}

/** Deurenberg et al.: BF% a partir de IMC, idade e sexo. */
function bodyFatPercentDeurenberg(imc: number, idade: number, sexo: Sexo): number {
    const sexFactor = sexo === 'masculino' ? 1 : 0;
    return 1.2 * imc + 0.23 * idade - 10.8 * sexFactor - 5.4;
}

/** Watson et al.: água corporal total (L ≈ kg). */
function totalBodyWaterKg(pesoKg: number, alturaCm: number, idade: number, sexo: Sexo): number {
    if (sexo === 'masculino') {
        return 2.447 - 0.09156 * idade + 0.1074 * alturaCm + 0.3362 * pesoKg;
    }
    return -2.097 + 0.1069 * alturaCm + 0.2466 * pesoKg;
}

/** Mifflin–St Jeor: taxa metabólica basal (kcal/dia). */
function basalMetabolicRate(pesoKg: number, alturaCm: number, idade: number, sexo: Sexo): number {
    const base = 10 * pesoKg + 6.25 * alturaCm - 5 * idade;
    return sexo === 'masculino' ? base + 5 : base - 161;
}

function round1(value: number): number {
    return Math.round(value * 10) / 10;
}

function round2(value: number): number {
    return Math.round(value * 100) / 100;
}

export function calculateBodyComposition(input: BodyCompositionInput): BodyCompositionResult | null {
    const { pesoKg, alturaCm, aniversario, sexo } = input;
    if (!(pesoKg > 0) || !(alturaCm > 0) || !aniversario || !sexo) return null;

    const idade = ageFromBirthday(aniversario);
    const alturaM = alturaCm / 100;
    const imc = pesoKg / (alturaM * alturaM);
    const percentualGordura = Math.min(60, Math.max(3, bodyFatPercentDeurenberg(imc, idade, sexo)));
    const massaGordaKg = (pesoKg * percentualGordura) / 100;
    const massaMagraKg = pesoKg - massaGordaKg;
    const aguaCorporalKg = Math.max(0, totalBodyWaterKg(pesoKg, alturaCm, idade, sexo));
    const aguaCorporalPct = (aguaCorporalKg / pesoKg) * 100;
    const tmbKcal = Math.max(0, basalMetabolicRate(pesoKg, alturaCm, idade, sexo));

    return {
        idade,
        imc: round1(imc),
        imcClassificacao: classifyBmi(imc),
        percentualGordura: round1(percentualGordura),
        massaGordaKg: round1(massaGordaKg),
        massaMagraKg: round1(massaMagraKg),
        aguaCorporalKg: round1(aguaCorporalKg),
        aguaCorporalPct: round1(aguaCorporalPct),
        tmbKcal: Math.round(tmbKcal),
    };
}
