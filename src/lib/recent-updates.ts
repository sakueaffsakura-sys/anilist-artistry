export const RECENT_UPDATES_LIMIT = 7;

export function selectRecentUpdates<T>(rows: readonly T[]): T[] {
  return rows.slice(0, RECENT_UPDATES_LIMIT);
}