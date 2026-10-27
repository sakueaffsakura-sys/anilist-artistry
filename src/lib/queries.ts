import { supabase } from "@/integrations/supabase/client";
import { SERIES_SUMMARY_SELECT } from "@/lib/series-summary";
import { activeProfileId, allowedAgeRatings } from "@/lib/active-profile";

export { KINDS } from "@/lib/work-categories";

export type ChapterLite = {
  id: string;
  number: number;
  title: string | null;
  created_at: string;
};

export type SeriesRow = {
  id: string;
  slug: string;
  title: string;
  cover_url: string | null;
  banner_url: string | null;
  synopsis: string | null;
  genres: string[] | null;
  age_rating: string | null;
  kind: string;
  status: string;
  rating: number;
  views: number;
  pinned: boolean;
  in_slider: boolean;
  created_at: string;
  updated_at: string;
  chapters: ChapterLite[];
  chapter_count?: number;
};

const SERIES_SELECT = SERIES_SUMMARY_SELECT;

function normalize(rows: unknown): SeriesRow[] {
  return ((rows ?? []) as Array<SeriesRow & { chapter_total?: Array<{ count: number }>; recent_chapters?: ChapterLite[] }>).map((row) => ({
    ...row,
    chapter_count: row.chapter_total?.[0]?.count ?? row.chapters?.length ?? 0,
    chapters: [...(row.recent_chapters ?? row.chapters ?? [])].sort((a, b) => Number(b.number) - Number(a.number)),
  }));
}

export async function fetchSeries(options: {
  kind?: string;
  order?: "updated_at" | "created_at" | "rating" | "views";
  limit?: number;
  search?: string;
  pinnedFirst?: boolean;
  inSlider?: boolean;
}) {
  let query = supabase.from("series").select(SERIES_SELECT).eq("published", true);
  const kidsAges = allowedAgeRatings();
  if (kidsAges) query = query.in("age_rating", kidsAges);

  if (options.kind && options.kind !== "Todos") query = query.eq("kind", options.kind);
  if (options.search) query = query.ilike("title", `%${options.search}%`);
  if (options.inSlider) query = query.eq("in_slider", true);
  if (options.pinnedFirst) query = query.order("pinned", { ascending: false });

  query = query.order(options.order ?? "updated_at", { ascending: false }).limit(options.limit ?? 24);
  query = query.eq("recent_chapters.published", true);
  query = query.eq("chapter_total.published", true)
    .order("number", { referencedTable: "recent_chapters", ascending: false })
    .limit(2, { referencedTable: "recent_chapters" });

  const { data, error } = await query;
  if (error) throw error;
  return normalize(data);
}

export async function fetchSeriesBySlug(slug: string) {
  const { data, error } = await supabase
    .from("series")
    .select(
      "id, slug, title, alt_titles, synopsis, cover_url, banner_url, kind, status, author, artist, genres, age_rating, rating, views, published, created_at, updated_at, chapters(id, number, title, created_at)",
    )
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    ...data,
    chapters: [...(data.chapters ?? [])].sort((a, b) => Number(a.number) - Number(b.number)),
  };
}

export async function fetchFavorites(userId: string) {
  const { data, error } = await supabase
    .from("favorites")
    .select(`series_id, created_at, series!inner(${SERIES_SELECT})`)
    .eq("user_id", userId)
    .eq("profile_id", activeProfileId())
    .order("created_at", { ascending: false })
    .eq("series.recent_chapters.published", true)
    .eq("series.chapter_total.published", true)
    .order("number", { referencedTable: "series.recent_chapters", ascending: false })
    .limit(2, { referencedTable: "series.recent_chapters" });
  if (error) throw error;
  const rows = normalize(((data ?? []) as unknown as { series: SeriesRow }[]).map((row) => row.series));
  const latest = (row: SeriesRow) =>
    row.chapters.reduce((max, ch) => (ch.created_at > max ? ch.created_at : max), "");
  return rows.sort((a, b) => latest(b).localeCompare(latest(a)));
}

export async function fetchHistory(userId: string) {
  const { data, error } = await supabase
    .from("reading_history")
    .select(
      `progress, updated_at, chapter_id, chapters(id, number), series!inner(id, slug, title, cover_url, chapters(count))`,
    )
    .eq("user_id", userId)
    .eq("profile_id", activeProfileId())
    .order("updated_at", { ascending: false })
    .limit(24);
  if (error) throw error;
  return (data ?? []) as unknown as Array<{
    progress: number;
    updated_at: string;
    chapter_id: string | null;
    chapters: { id: string; number: number } | null;
    series: { id: string; slug: string; title: string; cover_url: string | null; chapters: Array<{ count: number }> };
  }>;
}

export type CommentAuthorInfo = {
  username: string;
  avatar_url: string | null;
  level: number;
  avatar_frame: string | null;
  subscription_tier: string;
  is_admin: boolean;
  badges: Array<{ id: string; name: string; image_url: string }>;
};

export async function fetchCommentAuthors(ids: string[]) {
  const authors = new Map<string, CommentAuthorInfo>();
  if (ids.length === 0) return authors;
  const [profilesRes, rolesRes, badgesRes] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, username, avatar_url, level, avatar_frame, subscription_tier")
      .in("id", ids),
    supabase.from("user_roles").select("user_id, role").in("user_id", ids),
    supabase
      .from("profile_badges")
      .select("id, user_id, name, image_url")
      .in("user_id", ids)
      .order("position", { ascending: true }),
  ]);
  const adminIds = new Set(
    (rolesRes.data ?? []).filter((r) => r.role === "admin").map((r) => r.user_id),
  );
  const badgesByUser = new Map<string, Array<{ id: string; name: string; image_url: string }>>();
  for (const badge of badgesRes.data ?? []) {
    const list = badgesByUser.get(badge.user_id) ?? [];
    list.push({ id: badge.id, name: badge.name, image_url: badge.image_url });
    badgesByUser.set(badge.user_id, list);
  }
  for (const profile of profilesRes.data ?? []) {
    authors.set(profile.id, {
      username: profile.username,
      avatar_url: profile.avatar_url,
      level: profile.level,
      avatar_frame: profile.avatar_frame,
      subscription_tier: profile.subscription_tier,
      is_admin: adminIds.has(profile.id),
      badges: badgesByUser.get(profile.id) ?? [],
    });
  }
  return authors;
}

export type CommentParent = { id: string; username: string; excerpt?: string };

export async function fetchCommentParents(rows: Array<{ parent_id: string | null }>) {
  const parents = new Map<string, CommentParent>();
  const parentIds = [...new Set(rows.map((row) => row.parent_id).filter((id): id is string => Boolean(id)))];
  if (parentIds.length === 0) return parents;
  const { data } = await supabase.from("comments").select("id, user_id, body").in("id", parentIds);
  const parentRows = data ?? [];
  const userIds = [...new Set(parentRows.map((row) => row.user_id))];
  const { data: profiles } = await supabase.from("profiles").select("id, username").in("id", userIds);
  const names = new Map((profiles ?? []).map((p) => [p.id, p.username]));
  for (const row of parentRows) {
    parents.set(row.id, { id: row.id, username: names.get(row.user_id) ?? "leitor", excerpt: (row.body ?? "").slice(0, 60) });
  }
  return parents;
}

export async function fetchComments(seriesId: string) {
  const { data, error } = await supabase
    .from("comments")
    .select("id, body, created_at, user_id, is_spoiler, image_url, parent_id")
    .eq("series_id", seriesId)
    .order("created_at", { ascending: false })
    .limit(80);
  if (error) throw error;
  const rows = data ?? [];
  const ids = [...new Set(rows.map((row) => row.user_id))];
  const [authors, parents] = await Promise.all([fetchCommentAuthors(ids), fetchCommentParents(rows)]);
  return rows.map((row) => ({
    ...row,
    author: authors.get(row.user_id) ?? null,
    parent: row.parent_id ? (parents.get(row.parent_id) ?? null) : null,
  }));
}
