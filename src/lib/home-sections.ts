export const HOME_SECTIONS = [
  { key: "popular", title: "Obras populares" },
  { key: "trending", title: "Em alta agora" },
  { key: "manhwa", title: "Manhwa popular" },
] as const;

export type HomeSectionKey = (typeof HOME_SECTIONS)[number]["key"];
export type SectionMode = "automatic" | "manual";
export interface SectionConfig {
  section: string;
  mode: string;
  series_ids: string[];
}
export interface ShelfWork {
  id: string;
  slug: string;
  title: string;
  cover_url: string | null;
  rating: number;
  kind: string;
  age_rating?: string | null;

}

export function eligibleForSection(section: HomeSectionKey, kind: string): boolean {
  return section !== "manhwa" || kind === "Manhwa";
}

export function orderManualWorks<T extends ShelfWork>(section: HomeSectionKey, ids: string[], rows: T[]): T[] {
  const byId = new Map(rows.filter((row) => eligibleForSection(section, row.kind)).map((row) => [row.id, row]));
  return [...new Set(ids)].flatMap((id) => {
    const row = byId.get(id);
    return row ? [row] : [];
  });
}

export function anilistMetrics(item: { popularity?: number; trending?: number }) {
  const safeCount = (value: number | undefined) => Number.isFinite(value) && (value ?? 0) >= 0 ? Math.floor(value ?? 0) : 0;
  return { anilist_popularity: safeCount(item.popularity), anilist_trending: safeCount(item.trending) };
}