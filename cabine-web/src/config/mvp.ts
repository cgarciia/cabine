/**
 * Configuração do MVP ativo.
 *
 * Definido em tempo de build pela variável de ambiente VITE_MVP_VERSION.
 *   MVP 1 — Questionários + Bioimpedância + Oximetria
 *   MVP 2 — Temperatura (placeholder) + Pressão + Oximetria
 *
 * Para iniciar:
 *   npm run dev -- --mode mvp1   → carrega .env.mvp1
 *   npm run dev -- --mode mvp2   → carrega .env.mvp2
 */

export const MVP_VERSION: 1 | 2 =
    (import.meta.env.VITE_MVP_VERSION === '2' ? 2 : 1) as 1 | 2;

export const isMVP1 = MVP_VERSION === 1;
export const isMVP2 = MVP_VERSION === 2;

/** Módulos funcionais do sistema. */
export type MvpModule =
    | 'questionario'
    | 'bioimpedancia'
    | 'oximetria'
    | 'pressao'
    | 'temperatura';

const MVP1_MODULES: MvpModule[] = ['questionario', 'bioimpedancia', 'oximetria'];
const MVP2_MODULES: MvpModule[] = ['temperatura', 'pressao', 'oximetria'];

const ACTIVE_MODULES: MvpModule[] = MVP_VERSION === 1 ? MVP1_MODULES : MVP2_MODULES;

/** Retorna true se o módulo está ativo no MVP atual. */
export function hasModule(module: MvpModule): boolean {
    return ACTIVE_MODULES.includes(module);
}
