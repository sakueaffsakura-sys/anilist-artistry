export type DuplicateWork = {
  id: string; title: string; alt_titles: string | null; published: boolean;
};
const accents = 'áàâãäåéèêëíìîïóòôõöúùûüçñ';
const replacements = 'aaaaaaeeeeiiiiooooouuuucn';
export function duplicateTitleKey(value: string): string {
  return value.toLowerCase().replace(/[áàâãäåéèêëíìîïóòôõöúùûüçñ]/g, char => replacements[accents.indexOf(char)] ?? char).replace(/\s+/g, ' ').trim();
}
export function findDuplicateWorks<T extends DuplicateWork>(works: T[]): { works: T[]; matches: string[] }[] {
  const owners = new Map<string, Set<string>>();
  const records = new Map<string, T>();
  for (const work of works) {
    if (!work.published) continue;
    records.set(work.id, work);
    const keys = new Set([work.title, ...(work.alt_titles ?? '').split(/[,;|\n\r]+/)].map(duplicateTitleKey).filter(Boolean));
    for (const key of keys) {
      const ids = owners.get(key) ?? new Set<string>(); ids.add(work.id); owners.set(key, ids);
    }
  }
  const links = new Map<string, Set<string>>();
  for (const ids of owners.values()) {
    if (ids.size < 2) continue;
    for (const id of ids) {
      const neighbors = links.get(id) ?? new Set<string>();
      for (const other of ids) neighbors.add(other);
      links.set(id, neighbors);
    }
  }
  const visited = new Set<string>();
  const groups: { works: T[]; matches: string[] }[] = [];
  for (const root of links.keys()) {
    if (visited.has(root)) continue;
    const ids = new Set<string>(); const pending = [root];
    while (pending.length) {
      const id = pending.pop(); if (!id || visited.has(id)) continue;
      visited.add(id); ids.add(id);
      for (const neighbor of links.get(id) ?? []) if (!visited.has(neighbor)) pending.push(neighbor);
    }
    groups.push({ works: [...ids].flatMap(id => { const work = records.get(id); return work ? [work] : []; }),
      matches: [...owners].filter(([, members]) => members.size > 1 && [...members].some(id => ids.has(id))).map(([key]) => key).sort() });
  }
  return groups;
}
