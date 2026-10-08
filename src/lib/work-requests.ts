import { supabase } from "@/integrations/supabase/client";

export const REQUEST_STATUS = { pending: "Aguardando", fulfilled: "Adicionada", rejected: "Não atendida" } as const;

export async function fetchWorkRequests(userId?: string) {
  let query = supabase.from("work_requests").select("*, series(slug, title), profiles(username)").order("created_at", { ascending: false }).limit(100);
  if (userId) query = query.eq("user_id", userId);
  const { data, error } = await query;
  if (error) throw error;
  return data;
}

export async function fetchWorkNotifications(userId: string) {
  const { data, error } = await supabase.from("work_notifications").select("id, title, read_at, created_at, series(slug, title)").eq("user_id", userId).order("created_at", { ascending: false }).limit(30);
  if (error) throw error;
  return data;
}