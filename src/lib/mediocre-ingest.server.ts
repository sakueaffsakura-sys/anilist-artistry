import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { importChapter, importMediocreWork, type MediocreGetter } from "./mediocre-import.server";
import { enqueueWorks } from "./mediocre-queue.server";

type Admin = SupabaseClient<Database>;
export const INGEST_MAX_BYTES = 6_000_000;
export const INGEST_MAX_CHAPTERS = 5;
/** Published works handed to the GitHub Actions runner per "plan" request. */
export const INGEST_MAX_SYNC = 30;
/** IDs per "check" request and works per "enqueue" request. */
export const INGEST_MAX_CHECK = 100;
export const INGEST_MAX_ENQUEUE = 50;
/** While the runner works on a queued work, the site's own queue tick leaves it alone this long. */
const RUNNER_RESERVE_MS = 30 * 60_000;
const reserveUntil = () => new Date(Date.now() + RUNNER_RESERVE_MS).toISOString();

export async function hashIngestToken(token: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export type IngestBody =
  | { action: "plan"; syncLimit: number }
  | { action: "check"; ids: number[] }
  | { action: "enqueue"; items: { obraId: number; title: string | null }[] }
  | { action: "work"; obraId: number; work: unknown; publish: boolean }
  | { action: "chapters"; obraId: number; chapters: { capId: number; meta: unknown; content: unknown }[] }
  | { action: "finish"; obraId: number; added: number; remaining: number };

function count(v: unknown, label: string): number {
  if (typeof v !== "number" || !Number.isSafeInteger(v) || v < 0 || v > 100_000) throw new Error(`${label} inválido.`);
  return v;
}
function workId(v: unknown): number {
  if (typeof v !== "number" || !Number.isSafeInteger(v) || v <= 0) throw new Error("ID da obra inválido.");
  return v;
}

/** Validates the helper payload shape; throws a readable message on anything unexpected. */
export function parseIngestBody(v: unknown): IngestBody {
  const o = v as { obraId?: unknown; action?: unknown; work?: unknown; chapters?: unknown; publish?: unknown; syncLimit?: unknown; added?: unknown; remaining?: unknown; ids?: unknown; items?: unknown } | null;
  if (!o || typeof o !== "object") throw new Error("Corpo inválido.");
  if (o.action === "plan") {
    const n = o.syncLimit === undefined ? 10 : count(o.syncLimit, "Limite");
    return { action: "plan", syncLimit: Math.min(n, INGEST_MAX_SYNC) };
  }
  if (o.action === "check") {
    if (!Array.isArray(o.ids) || o.ids.length > INGEST_MAX_CHECK) throw new Error(`Envie até ${INGEST_MAX_CHECK} IDs por vez.`);
    return { action: "check", ids: [...new Set(o.ids.map(workId))] };
  }
  if (o.action === "enqueue") {
    if (!Array.isArray(o.items) || !o.items.length || o.items.length > INGEST_MAX_ENQUEUE) throw new Error(`Envie de 1 a ${INGEST_MAX_ENQUEUE} obras por vez.`);
    const items = o.items.map((i) => {
      const r = i as { obraId?: unknown; title?: unknown } | null;
      return { obraId: workId(r?.obraId), title: typeof r?.title === "string" ? r.title.slice(0, 300) : null };
    });
    return { action: "enqueue", items };
  }
  const obraId = workId(o.obraId);
  if (o.action === "work") {
    if (!o.work || typeof o.work !== "object") throw new Error("Dados da obra ausentes.");
    // Only an explicit `true` publishes; the device helper keeps creating drafts.
    return { action: "work", obraId, work: o.work, publish: o.publish === true };
  }
  if (o.action === "chapters") {
    if (!Array.isArray(o.chapters) || !o.chapters.length || o.chapters.length > INGEST_MAX_CHAPTERS) throw new Error(`Envie de 1 a ${INGEST_MAX_CHAPTERS} capítulos por vez.`);
    const chapters = o.chapters.map((c) => {
      const r = c as { capId?: unknown; meta?: unknown; content?: unknown } | null;
      if (!r || typeof r.capId !== "number" || !Number.isSafeInteger(r.capId) || r.capId <= 0) throw new Error("Capítulo inválido.");
      if (!r.meta || typeof r.meta !== "object") throw new Error("Dados do capítulo ausentes.");
      return { capId: r.capId, meta: r.meta, content: r.content ?? null };
    });
    return { action: "chapters", obraId, chapters };
  }
  if (o.action === "finish") {
    return { action: "finish", obraId, added: count(o.added, "Total adicionado"), remaining: count(o.remaining, "Total restante") };
  }
  throw new Error("Ação desconhecida.");
}

/** Getter that only answers from data the admin's device already fetched; never calls MediocreScan. */
export function suppliedGetter(api: Record<string, unknown>, cdn: unknown): MediocreGetter {
  return async (host, path) => {
    const data = host === "api" ? api[path] : cdn;
    if (data === undefined || data === null) return { ok: false, status: 404, error: { code: "NOT_SUPPLIED", message: "Dado não enviado pelo aparelho." } };
    return { ok: true, status: 200, data, raw: "" };
  };
}

/**
 * What the GitHub Actions runner should fetch: the publish queue (the unfinished "running" work
 * first, then the rest in order) and the published works checked least recently. Queued works are
 * reserved so the site's own queue tick does not copy the same chapters at the same time.
 */
export async function ingestPlan(admin: Admin, syncLimit: number): Promise<{ queue: number[]; sync: number[] }> {
  const { data: q } = await admin.from("mediocre_queue").select("obra_id, status").in("status", ["running", "waiting"]).order("created_at").limit(50);
  const rows = [...(q ?? [])].sort((a, b) => (a.status === "running" ? 0 : 1) - (b.status === "running" ? 0 : 1));
  const queue = rows.map((r) => Number(r.obra_id)).filter((n) => Number.isSafeInteger(n) && n > 0);
  if (queue.length) await admin.from("mediocre_queue").update({ next_run_at: reserveUntil() }).in("obra_id", queue).in("status", ["running", "waiting"]);
  if (!syncLimit) return { queue, sync: [] };
  const { data: s } = await admin.from("series").select("source_mediocre_id")
    .not("source_mediocre_id", "is", null).order("mediocre_synced_at", { ascending: true, nullsFirst: true }).limit(syncLimit);
  const sync = (s ?? []).map((r) => Number(r.source_mediocre_id)).filter((n) => Number.isSafeInteger(n) && n > 0 && !queue.includes(n));
  return { queue, sync };
}

/** Which of these MediocreScan IDs are already on the site, and which are already in the queue (any status). */
async function ingestCheck(admin: Admin, ids: number[]): Promise<{ imported: number[]; queued: number[] }> {
  if (!ids.length) return { imported: [], queued: [] };
  const [{ data: s }, { data: q }] = await Promise.all([
    admin.from("series").select("source_mediocre_id").in("source_mediocre_id", ids),
    admin.from("mediocre_queue").select("obra_id").in("obra_id", ids),
  ]);
  return {
    imported: (s ?? []).map((r) => Number(r.source_mediocre_id)),
    queued: (q ?? []).map((r) => Number(r.obra_id)),
  };
}

/**
 * Records the runner's result: marks the work as checked and moves its queue item forward.
 * An unfinished work (time ran out mid-way) stays "running" so the next run resumes it before any other.
 */
async function finishIngest(admin: Admin, body: { obraId: number; added: number; remaining: number }, createdBy: string) {
  const now = new Date().toISOString();
  const done = body.remaining === 0;
  await admin.from("series").update({ mediocre_synced_at: now }).eq("source_mediocre_id", body.obraId);
  const { data: item } = await admin.from("mediocre_queue").select("id, chapters_added")
    .eq("obra_id", body.obraId).in("status", ["running", "waiting"]).order("created_at").limit(1).maybeSingle();
  if (!item) {
    if (done) return;
    await admin.from("mediocre_queue").delete().eq("obra_id", body.obraId).in("status", ["done", "error"]);
    await admin.from("mediocre_queue").insert({ obra_id: body.obraId, created_by: createdBy, status: "running", chapters_added: body.added, chapters_remaining: body.remaining, next_run_at: reserveUntil() });
    return;
  }
  await admin.from("mediocre_queue").update({
    status: done ? "done" : "running",
    chapters_added: item.chapters_added + body.added,
    chapters_remaining: body.remaining,
    attempts: 0,
    last_error: null,
    updated_at: now,
    finished_at: done ? now : null,
    ...(done ? {} : { next_run_at: reserveUntil() }),
  }).eq("id", item.id);
}

export async function runIngest(admin: Admin, body: IngestBody, createdBy: string) {
  if (body.action === "plan") return { ...(await ingestPlan(admin, body.syncLimit)), added: 0, skipped: 0 };
  if (body.action === "check") return { ...(await ingestCheck(admin, body.ids)), added: 0, skipped: 0 };
  if (body.action === "enqueue") {
    const r = await enqueueWorks(admin, body.items, createdBy);
    // The runner publishes these right away; keep the site's own queue tick off them meanwhile.
    await admin.from("mediocre_queue").update({ next_run_at: reserveUntil() }).in("obra_id", body.items.map((i) => i.obraId)).in("status", ["running", "waiting"]);
    return { queued: r.added, added: 0, skipped: 0 };
  }
  if (body.action === "finish") { await finishIngest(admin, body, createdBy); return { ok: true, added: 0, skipped: 0 }; }
  if (body.action === "work") {
    const r = await importMediocreWork(admin, body.obraId, { createdBy, chapterLimit: 0, draft: !body.publish, get: suppliedGetter({ [`/obras/${body.obraId}`]: body.work }, null) });
    return { slug: r.slug, created: r.created, pendingCapIds: r.pendingCapIds, remaining: r.remaining, added: 0, skipped: 0 };
  }
  const { data: s } = await admin.from("series").select("id, slug, kind").eq("source_mediocre_id", body.obraId).maybeSingle();
  if (!s) throw new Error("Envie primeiro os dados da obra.");
  let added = 0, skipped = 0;
  for (const c of body.chapters) {
    const ok = await importChapter(admin, s.id, c.capId, s.kind === "Novel", suppliedGetter({ [`/capitulos/${c.capId}`]: c.meta }, c.content));
    ok ? added++ : skipped++;
  }
  return { slug: s.slug, created: false, pendingCapIds: [] as number[], added, skipped };
}
