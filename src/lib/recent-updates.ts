/** Quantas obras a grade "Atualizados" da home busca e mostra: 3 fileiras de 7 capas (a mesma conta nos dois lugares). */
export const RECENT_UPDATES_LIMIT = 21;

export function selectRecentUpdates<T>(rows: readonly T[]): T[] {
  return rows.slice(0, RECENT_UPDATES_LIMIT);
}
