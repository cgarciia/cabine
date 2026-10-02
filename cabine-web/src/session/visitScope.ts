/** Leitura gravada nesta sessão. Sem `session_id` fica: foi montada nesta aba antes do POST. */
export function sameVisit(
    reading: { session_id?: string | null } | null | undefined,
    sessionId: string | null | undefined,
): boolean {
    if (!reading) return false;
    if (!sessionId || !reading.session_id) return true;
    return reading.session_id === sessionId;
}

/** Acha a linha desta sessão pelo id. Não usa a mais recente da pessoa. */
export function findVisitRow<T extends { id: string; session_id?: string | null }>(
    rows: T[],
    id: string | undefined,
    sessionId: string | null | undefined,
): T | undefined {
    if (!id) return undefined;
    const row = rows.find((item) => item.id === id);
    if (!row || !sameVisit(row, sessionId)) return undefined;
    return row;
}

/** Entre as leituras desta sessão, a que tem os mesmos números. A lista vem da mais nova para a mais antiga. */
export function findVisitMatch<T extends { session_id?: string | null }>(
    rows: T[],
    sessionId: string | null | undefined,
    predicate: (row: T) => boolean,
): T | undefined {
    if (!sessionId) return undefined;
    return rows.find((row) => row.session_id === sessionId && predicate(row));
}
