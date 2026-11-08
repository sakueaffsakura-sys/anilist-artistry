import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { importMediocreWork } from "./mediocre-import.server";

type Admin = SupabaseClient<Database>;

/** Wait between two chapters (and between the last chapter of a work and the next work). */
export const QUEUE_CHAPTER_DELAY_MS = 60_000;
/** Non-block errors tolerated on one work before it is marked as failed and the queue moves on. */
export const QUEUE_MAX_ATTEMPTS = 3;

export type QueueTick =
  | { state: "idle" | "blocked" | "waiting" }
  | { state: "chapter"; obraId: number; added: number; remaining: number; done: boolean }
  | { state: "error"; obraId: number; message: string };

/**
 * Processes the publish queue one chapter per call: exactly one work is "running" at a time,
 * and the next call only proceeds once next_run_at (now + 60 s) has passed.
 */
export async function processQueueTick(admin: Admin, now = Date.now()): Promise<QueueTick> {
  const { data: cfg } = await admin.from("mediocre_settings").select("blocked_until").eq("id", 1).maybeSingle();
  if (cfg?.blocked_until && new Date(cfg.blocked_until).getTime() > now) return { state: "blocked" };

  let { data: item } = await admin.from("mediocre_queue").select("*").eq("status", "running").order("created_at").limit(1).maybeSingle();
  if (!item) {
    const { data: next } = await admin.from("mediocre_queue").select("*").eq("status", "waiting").order("priority", { ascending: false }).order("created_at").limit(1).maybeSingle();
    if (!next) return { state: "idle" };
    // Conditional update: two overlapping runs cannot both start a work.
    const { data: claimed } = await admin.from("mediocre_queue").update({ status: "running", updated_at: new Date(now).toISOString() })
      .eq("id", next.id).eq("status", "waiting").select("*").maybeSingle();
    if (!claimed) return { state: "waiting" };
    item = claimed;
  }
  if (new Date(item.next_run_at).getTime() > now) return { state: "waiting" };

  // Reserve the slot before calling the API so an overlapping run waits.
  const nextAt = new Date(now + QUEUE_CHAPTER_DELAY_MS).toISOString();
  const { data: reserved } = await admin.from("mediocre_queue").update({ next_run_at: nextAt, updated_at: new Date(now).toISOString() })
    .eq("id", item.id).eq("next_run_at", item.next_run_at).select("id").maybeSingle();
  if (!reserved) return { state: "waiting" };

  try {
    const out = await importMediocreWork(admin, item.obra_id, { createdBy: item.created_by, chapterLimit: 1 });
    // A skipped chapter is still missing: count the failure instead of retrying forever.
    if (out.skipped > 0) throw new Error("Não foi possível copiar o capítulo pendente (conteúdo indisponível, numeração inválida ou falha ao salvar).");
    const done = out.remaining === 0;
    await admin.from("mediocre_queue").update({
      status: done ? "done" : "running",
      chapters_added: item.chapters_added + out.added,
      chapters_remaining: out.remaining,
      slug: out.slug,
      attempts: 0,
      last_error: null,
      finished_at: done ? new Date(now).toISOString() : null,
    }).eq("id", item.id);
    if (done) {
      // The next work in line also waits the full interval.
      const { data: following } = await admin.from("mediocre_queue").select("id").eq("status", "waiting").order("priority", { ascending: false }).order("created_at").limit(1).maybeSingle();
      if (following) await admin.from("mediocre_queue").update({ next_run_at: nextAt }).eq("id", following.id);
    }
    return { state: "chapter", obraId: item.obra_id, added: out.added, remaining: out.remaining, done };
  } catch (e) {
    const message = e instanceof Error ? e.message : "erro";
    // IP block: keep the work running and simply wait; the API helper already set blocked_until.
    if (/bloque/i.test(message)) {
      await admin.from("mediocre_queue").update({ last_error: message }).eq("id", item.id);
      return { state: "blocked" };
    }
    const attempts = item.attempts + 1;
    const failed = attempts >= QUEUE_MAX_ATTEMPTS;
    await admin.from("mediocre_queue").update({ attempts, last_error: message, status: failed ? "error" : "running", finished_at: failed ? new Date(now).toISOString() : null }).eq("id", item.id);
    return { state: "error", obraId: item.obra_id, message };
  }
}

/** Adds works to the end of the queue; works already queued (any status but error) are kept as they are. */
export async function enqueueWorks(admin: Admin, items: { obraId: number; title?: string | null }[], createdBy: string): Promise<{ added: number }> {
  if (!items.length) return { added: 0 };
  const ids = items.map((i) => i.obraId);
  const { data: existing } = await admin.from("mediocre_queue").select("obra_id, status").in("obra_id", ids);
  const known = new Map((existing ?? []).map((r) => [r.obra_id, r.status]));
  // Failed works go back to the end of the line.
  const retry = ids.filter((id) => known.get(id) === "error");
  if (retry.length) await admin.from("mediocre_queue").delete().in("obra_id", retry).eq("status", "error");
  const fresh = items.filter((i) => !known.has(i.obraId) || known.get(i.obraId) === "error");
  let added = 0;
  // Sequential inserts keep created_at in the order the admin chose.
  for (const i of fresh) {
    const { error } = await admin.from("mediocre_queue").insert({ obra_id: i.obraId, title: i.title?.slice(0, 300) ?? null, created_by: createdBy });
    if (!error) added++;
  }
  return { added };
}
