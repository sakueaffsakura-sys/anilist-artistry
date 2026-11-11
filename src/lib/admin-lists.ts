import { supabase } from "@/integrations/supabase/client";

export const ADMIN_PAGE_SIZE = 30;
export type AdminWorkFilter = "all" | "pub" | "draft" | "slide";

export function adminPageRange(page: number): [number, number] {
  const start = (Math.max(1, Math.floor(page)) - 1) * ADMIN_PAGE_SIZE;
  return [start, start + ADMIN_PAGE_SIZE - 1];
}

export function literalSearch(term: string): string {
  return `%${term.trim().replace(/[\\%_]/g, "\\$&")}%`;
}

export async function fetchAdminWorks(page: number, term: string, filter: AdminWorkFilter, signal?: AbortSignal) {
  let query = supabase.from("series")
    .select("id, slug, title, cover_url, kind, status, published, in_slider, views, updated_at, age_rating, chapter_count_total", { count: "exact" })
    .neq("kind", "Novel");
  if (term.trim()) query = query.ilike("title", literalSearch(term));
  if (filter === "slide") query = query.eq("in_slider", true);
  if (filter === "pub" || filter === "draft") query = query.eq("published", filter === "pub");
  query = query.order("updated_at", { ascending: false }).order("id").range(...adminPageRange(page));
  if (signal) query = query.abortSignal(signal);
  const { data, count, error } = await query;
  if (error) throw error;
  return { rows: data ?? [], total: count ?? 0 };
}

export async function fetchAdminAccounts(page: number, term: string, signal?: AbortSignal) {
  let query = supabase.from("profiles")
    .select("id, username, display_name, avatar_url, bio, level, xp, banned, created_at, subscription_tier", { count: "exact" });
  if (term.trim()) {
    // Quoted PostgREST values keep punctuation from becoming filter syntax.
    const pattern = literalSearch(term).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    query = query.or(`username.ilike."${pattern}",display_name.ilike."${pattern}"`);
  }
  query = query.order("created_at", { ascending: false }).order("id").range(...adminPageRange(page));
  if (signal) query = query.abortSignal(signal);
  const { data, count, error } = await query;
  if (error) throw error;
  if (!data?.length) return { rows: [], total: count ?? 0 };
  let roleQuery = supabase.from("user_roles").select("user_id, role").in("user_id", data.map(row => row.id));
  if (signal) roleQuery = roleQuery.abortSignal(signal);
  const roles = await roleQuery;
  if (roles.error) throw roles.error;
  const byUser = new Map<string, string[]>();
  for (const row of roles.data ?? []) {
    const list = byUser.get(row.user_id) ?? [];
    list.push(row.role);
    byUser.set(row.user_id, list);
  }
  return { rows: data.map(row => ({ ...row, roles: byUser.get(row.id) ?? [] })), total: count ?? 0 };
}