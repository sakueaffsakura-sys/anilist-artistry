import { supabase } from "@/integrations/supabase/client";
import { HOME_SECTIONS, orderManualWorks, type HomeSectionKey, type SectionConfig, type ShelfWork } from "@/lib/home-sections";
import { allowedAgeRatings } from "@/lib/active-profile";

const SHELF_SELECT = "id, slug, title, cover_url, rating, kind, age_rating";

export async function fetchSectionConfigs(): Promise<SectionConfig[]> {
  const { data, error } = await supabase.from("home_sections").select("section, mode, series_ids");
  if (error) throw error;
  return data ?? [];
}

export async function fetchHomeSections(): Promise<Record<HomeSectionKey, ShelfWork[]>> {
  const configs = await fetchSectionConfigs();
  const entries = await Promise.all(HOME_SECTIONS.map(async ({ key }) => {
    const config = configs.find((row) => row.section === key);
    if (config?.mode === "manual" && !config.series_ids.length) return [key, []] as const;
    let query = supabase.from("series").select(SHELF_SELECT).eq("published", true);
    const kidsAges = allowedAgeRatings();
    if (kidsAges) query = query.in("age_rating", kidsAges);
    if (key === "manhwa") query = query.eq("kind", "Manhwa");
    if (config?.mode === "manual") {
      query = query.in("id", config.series_ids.slice(0, 12));
    } else {
      query = query.order(key === "trending" ? "anilist_trending" : "anilist_popularity", { ascending: false })
        .order("views", { ascending: false }).order("id").limit(12);
    }
    const { data, error } = await query;
    if (error) throw error;
    const rows = data ?? [];
    return [key, config?.mode === "manual" ? orderManualWorks(key, config.series_ids, rows) : rows] as const;
  }));
  return Object.fromEntries(entries) as Record<HomeSectionKey, ShelfWork[]>;
}

export async function fetchSectionAdminWorks() {
  const rows: Array<ShelfWork & { anilist_id: number | null; anilist_popularity: number; anilist_trending: number }> = [];
  for (let start = 0; ; start += 1000) {
    const { data, error } = await supabase.from("series")
      .select(`${SHELF_SELECT}, anilist_id, anilist_popularity, anilist_trending`)
      .eq("published", true).order("title").order("id").range(start, start + 999);
    if (error) throw error;
    rows.push(...(data ?? []));
    if ((data?.length ?? 0) < 1000) return rows;
  }
}