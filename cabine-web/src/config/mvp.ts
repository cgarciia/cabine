/**
 * Cardápio do totem e do painel. A API não tem versão de MVP: um processo
 * atende questionário, balança, oxímetro e pressão.
 *
 * A lista ativa vem de VITE_MVP_VERSION, lida pelo Vite no modo de dev:
 *   npm run dev -- --mode mvp1   → .env.mvp1 → porta 5173
 *   npm run dev -- --mode mvp2   → .env.mvp2 → porta 5174
 *
 * Os dois podem ficar abertos no mesmo navegador. Cada porta tem o próprio
 * localStorage (cabine.token), então o login de uma não derruba a outra.
 * As duas falam com a API em :8000.
 */

export const MVP_VERSION: 1 | 2 =
    (import.meta.env.VITE_MVP_VERSION === '2' ? 2 : 1) as 1 | 2;

/** Módulos que o menu desta porta pode mostrar. */
export type MvpModule =
    | 'questionario'
    | 'bioimpedancia'
    | 'oximetria'
    | 'pressao'
    | 'temperatura';

const MVP1_MODULES: MvpModule[] = ['questionario', 'bioimpedancia', 'oximetria'];
const MVP2_MODULES: MvpModule[] = ['temperatura', 'pressao', 'oximetria'];

const ACTIVE_MODULES: readonly MvpModule[] = MVP_VERSION === 1 ? MVP1_MODULES : MVP2_MODULES;

export function activeModules(): readonly MvpModule[] {
    return ACTIVE_MODULES;
}

/** Retorna true se o módulo está no cardápio desta porta. */
export function hasModule(module: MvpModule): boolean {
    return ACTIVE_MODULES.includes(module);
}

/** Primeira tela do painel quando o operador abre /admin. */
export function adminHomePath(): string {
    if (hasModule('bioimpedancia')) return '/admin/avaliacao';
    if (hasModule('pressao')) return '/admin/pressao';
    if (hasModule('oximetria')) return '/admin/oximetria';
    return '/admin/pessoas';
}
