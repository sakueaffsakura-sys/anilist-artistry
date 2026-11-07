/** Quantas obras a lista "Capítulos novos" da home busca e mostra (a mesma conta nos dois lugares). */
export const RECENT_UPDATES_LIMIT = 12;

export function selectRecentUpdates<T>(rows: readonly T[]): T[] {
  return rows.slice(0, RECENT_UPDATES_LIMIT);
}
