/** Leitura gravada com a visita. Sem `visit_id` fica: foi montada nesta aba antes do POST. */
export function sameVisit(
    reading: { visit_id?: string | null } | null | undefined,
    visitId: string | null | undefined,
): boolean {
    if (!reading) return false;
    if (!visitId || !reading.visit_id) return true;
    return reading.visit_id === visitId;
}

/** Acha a linha desta visita pelo id. Não usa a mais recente da pessoa. */
export function findVisitRow<T extends { id: string; visit_id?: string | null }>(
    rows: T[],
    id: string | undefined,
    visitId: string | null | undefined,
): T | undefined {
    if (!id) return undefined;
    const row = rows.find((item) => item.id === id);
    if (!row || !sameVisit(row, visitId)) return undefined;
    return row;
}

/** Entre as leituras desta visita, a que tem os mesmos números. A lista vem da mais nova para a mais antiga. */
export function findVisitMatch<T extends { visit_id?: string | null }>(
    rows: T[],
    visitId: string | null | undefined,
    predicate: (row: T) => boolean,
): T | undefined {
    if (!visitId) return undefined;
    return rows.find((row) => row.visit_id === visitId && predicate(row));
}
