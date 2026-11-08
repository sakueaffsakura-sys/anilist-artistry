import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { importChapter, importMediocreWork, type MediocreGetter } from "./mediocre-import.server";
import { enqueueWorks } from "./mediocre-queue.server";
import { titleKey } from "./mediocre-api";

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
  | { action: "finish"; obraId: number; added: number; remaining: number }
  | { action: "chapter_status"; obraId: number }
  | { action: "queue_remove"; obraIds: number[] }
  | { action: "queue_clear" }
  | { action: "site_list"; filter: SiteFilter; q: string; page: number; obraId: number | null }
  | { action: "site_work"; seriesId: string }
  | { action: "site_update"; seriesId: string; patch: SitePatch }
  | { action: "chapter_update"; chapterId: string; published: boolean }
  | { action: "chapter_delete"; chapterId: string }
  | { action: "site_delete"; seriesId: string; confirm: string }
  | { action: "requests" }
  | { action: "request_link"; ids: string[]; obraId: number; title: string | null }
  | { action: "request_reject"; ids: string[]; note: string };

/** Pedidos por chamada de ligar/recusar (um grupo = os leitores que pediram a mesma obra). */
export const INGEST_MAX_REQUESTS = 50;

/** Gerenciamento das obras do site pelo app Estúdio (somente administradores, como todo o endpoint). */
export type SiteFilter = "todas" | "publicadas" | "rascunhos" | "mediocre";
export type SitePatch = { published?: boolean; pinned?: boolean; in_slider?: boolean; status?: string };
export const SITE_PAGE_SIZE = 30;
const SITE_STATUSES = ["Em andamento", "Completo", "Pausado", "Cancelado", "Hiato"];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function uuid(v: unknown, label: string): string {
  if (typeof v !== "string" || !UUID_RE.test(v)) throw new Error(`${label} inválido.`);
  return v;
}

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
  const o = v as { obraId?: unknown; action?: unknown; work?: unknown; chapters?: unknown; publish?: unknown; syncLimit?: unknown; added?: unknown; remaining?: unknown; ids?: unknown; items?: unknown; filter?: unknown; q?: unknown; page?: unknown; seriesId?: unknown; chapterId?: unknown; patch?: unknown; published?: unknown; confirm?: unknown; note?: unknown; title?: unknown } | null;
  if (!o || typeof o !== "object") throw new Error("Corpo inválido.");
  if (o.action === "site_list") {
    const filter = (["todas", "publicadas", "rascunhos", "mediocre"] as const).find((f) => f === o.filter) ?? "todas";
    const q = typeof o.q === "string" ? o.q.replace(/[%_,()]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80) : "";
    const page = o.page === undefined ? 1 : Math.min(Math.max(count(o.page, "Página"), 1), 1000);
    const obraId = o.obraId === undefined || o.obraId === null ? null : workId(o.obraId);
    return { action: "site_list", filter, q, page, obraId };
  }
  if (o.action === "site_work") return { action: "site_work", seriesId: uuid(o.seriesId, "Obra") };
  if (o.action === "chapter_status") return { action: "chapter_status", obraId: workId(o.obraId) };
  if (o.action === "queue_remove") {
    const raw = (o as { obraIds?: unknown }).obraIds;
    if (!Array.isArray(raw) || !raw.length || raw.length > INGEST_MAX_CHECK) throw new Error(`Envie de 1 a ${INGEST_MAX_CHECK} obras para tirar da fila.`);
    return { action: "queue_remove", obraIds: [...new Set(raw.map(workId))] };
  }
  if (o.action === "queue_clear") return { action: "queue_clear" };
  if (o.action === "site_update") {
    const p = (o.patch && typeof o.patch === "object" ? o.patch : {}) as Record<string, unknown>;
    const patch: SitePatch = {};
    for (const k of ["published", "pinned", "in_slider"] as const) if (typeof p[k] === "boolean") patch[k] = p[k] as boolean;
    if (typeof p["status"] === "string" && SITE_STATUSES.includes(p["status"])) patch.status = p["status"];
    if (!Object.keys(patch).length) throw new Error("Nada para alterar.");
    return { action: "site_update", seriesId: uuid(o.seriesId, "Obra"), patch };
  }
  if (o.action === "chapter_update") {
    if (typeof o.published !== "boolean") throw new Error("Informe se o capítulo fica visível.");
    return { action: "chapter_update", chapterId: uuid(o.chapterId, "Capítulo"), published: o.published };
  }
  if (o.action === "chapter_delete") return { action: "chapter_delete", chapterId: uuid(o.chapterId, "Capítulo") };
  if (o.action === "site_delete") {
    if (o.confirm !== "EXCLUIR") throw new Error('Para excluir, confirme digitando EXCLUIR.');
    return { action: "site_delete", seriesId: uuid(o.seriesId, "Obra"), confirm: "EXCLUIR" };
  }
  if (o.action === "requests") return { action: "requests" };
  if (o.action === "request_link" || o.action === "request_reject") {
    if (!Array.isArray(o.ids) || !o.ids.length || o.ids.length > INGEST_MAX_REQUESTS) throw new Error(`Envie de 1 a ${INGEST_MAX_REQUESTS} pedidos por vez.`);
    const ids = [...new Set(o.ids.map((id) => uuid(id, "Pedido")))];
    if (o.action === "request_reject") return { action: "request_reject", ids, note: typeof o.note === "string" ? o.note.trim().slice(0, 500) : "" };
    return { action: "request_link", ids, obraId: workId(o.obraId), title: typeof o.title === "string" ? o.title.slice(0, 300) : null };
  }
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
type PlanItem = { id: number; title: string | null; status: string; cover: string | null; slug: string | null; chapters_on_site: number; chapters_added: number; updated_at: string; priority: number };
/** Ordem da fila: a obra em andamento, depois as pedidas por leitores (mais pedidos primeiro), depois a ordem de chegada. */
export function queueOrder<T extends { status: string; priority?: number | null; created_at: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => (a.status === "running" ? 0 : 1) - (b.status === "running" ? 0 : 1) || (b.priority ?? 0) - (a.priority ?? 0) || a.created_at.localeCompare(b.created_at));
}
export async function ingestPlan(admin: Admin, syncLimit: number): Promise<{ queue: number[]; items: PlanItem[]; sync: number[]; requestsWaiting: number }> {
  const { data: q } = await admin.from("mediocre_queue").select("obra_id, status, title, chapters_added, updated_at, created_at, priority").in("status", ["running", "waiting"]).order("priority", { ascending: false }).order("created_at").limit(50);
  const rows = queueOrder(q ?? []);
  // Pedidos de leitores ainda sem obra escolhida: o app mostra o número para o admin atender.
  const { count: requestsWaiting } = await admin.from("work_requests").select("id", { count: "exact", head: true }).eq("status", "pending").is("mediocre_id", null);
  const queue = rows.map((r) => Number(r.obra_id)).filter((n) => Number.isSafeInteger(n) && n > 0);
  // Capa e capítulos que a obra já tem no site, para a fila do app mostrar e ajudar a limpar.
  const { data: ss } = queue.length
    ? await admin.from("series").select("source_mediocre_id, cover_url, slug, title, chapters(count)").in("source_mediocre_id", queue)
    : { data: [] as never[] };
  const bySource = new Map((ss ?? []).map((r) => [Number(r.source_mediocre_id), r as { cover_url: string | null; slug: string; title: string; chapters?: { count: number }[] | null }]));
  const items: PlanItem[] = rows.filter((r) => queue.includes(Number(r.obra_id))).map((r) => {
    const sr = bySource.get(Number(r.obra_id));
    return { id: Number(r.obra_id), title: r.title ?? sr?.title ?? null, status: r.status, cover: sr?.cover_url ?? null, slug: sr?.slug ?? null, chapters_on_site: sr?.chapters?.[0]?.count ?? 0, chapters_added: r.chapters_added, updated_at: r.updated_at, priority: r.priority ?? 0 };
  });
  if (queue.length) await admin.from("mediocre_queue").update({ next_run_at: reserveUntil() }).in("obra_id", queue).in("status", ["running", "waiting"]);
  if (!syncLimit) return { queue, items, sync: [], requestsWaiting: requestsWaiting ?? 0 };
  const { data: s } = await admin.from("series").select("source_mediocre_id")
    .not("source_mediocre_id", "is", null).order("mediocre_synced_at", { ascending: true, nullsFirst: true }).limit(syncLimit);
  const sync = (s ?? []).map((r) => Number(r.source_mediocre_id)).filter((n) => Number.isSafeInteger(n) && n > 0 && !queue.includes(n));
  return { queue, items, sync, requestsWaiting: requestsWaiting ?? 0 };
}

/**
 * Which of these MediocreScan IDs are already on the site, which are actively queued (waiting/running)
 * and which failed in the queue. Finished queue rows no longer count as "queued".
 */
async function ingestCheck(admin: Admin, ids: number[]): Promise<{ imported: number[]; queued: number[]; failed: number[] }> {
  if (!ids.length) return { imported: [], queued: [], failed: [] };
  const [{ data: s }, { data: q }] = await Promise.all([
    admin.from("series").select("source_mediocre_id").in("source_mediocre_id", ids),
    admin.from("mediocre_queue").select("obra_id, status").in("obra_id", ids),
  ]);
  return {
    imported: (s ?? []).map((r) => Number(r.source_mediocre_id)),
    queued: (q ?? []).filter((r) => r.status === "running" || r.status === "waiting").map((r) => Number(r.obra_id)),
    failed: (q ?? []).filter((r) => r.status === "error").map((r) => Number(r.obra_id)),
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

const SITE_COLUMNS = "id, slug, title, cover_url, banner_url, published, pinned, in_slider, kind, status, updated_at, created_at, source_mediocre_id, views, rating, chapters(count)";
type SiteRow = { chapters?: { count: number }[] | null } & Record<string, unknown>;
const withCount = (r: SiteRow) => { const { chapters, ...rest } = r; return { ...rest, chapter_count: chapters?.[0]?.count ?? 0 }; };

async function siteList(admin: Admin, b: { filter: SiteFilter; q: string; page: number; obraId: number | null }) {
  let q = admin.from("series").select(SITE_COLUMNS, { count: "exact" });
  if (b.obraId) q = q.eq("source_mediocre_id", b.obraId);
  if (b.filter === "publicadas") q = q.eq("published", true);
  if (b.filter === "rascunhos") q = q.eq("published", false);
  if (b.filter === "mediocre") q = q.not("source_mediocre_id", "is", null);
  if (b.q) q = q.ilike("title", `%${b.q}%`);
  const from = (b.page - 1) * SITE_PAGE_SIZE;
  const { data, count: total, error } = await q.order("updated_at", { ascending: false }).range(from, from + SITE_PAGE_SIZE - 1);
  if (error) throw new Error("Não foi possível listar as obras do site.");
  return { items: (data ?? []).map((r) => withCount(r as SiteRow)), total: total ?? 0, page: b.page, pageSize: SITE_PAGE_SIZE };
}
async function siteWork(admin: Admin, seriesId: string) {
  const { data: s, error } = await admin.from("series").select(SITE_COLUMNS).eq("id", seriesId).maybeSingle();
  if (error || !s) throw new Error("Obra não encontrada no site.");
  const { data: ch } = await admin.from("chapters").select("id, number, title, published, created_at").eq("series_id", seriesId).order("number", { ascending: false }).limit(5000);
  return { work: withCount(s as SiteRow), chapters: ch ?? [] };
}

/** Números dos capítulos que a obra da MediocreScan já tem no site (para o app marcar e não reenviar). */
async function chapterStatus(admin: Admin, obraId: number) {
  const { data: s } = await admin.from("series").select("id, slug, published").eq("source_mediocre_id", obraId).maybeSingle();
  if (!s) return { seriesId: null, slug: null, published: false, numbers: [] as number[] };
  const { data: ch } = await admin.from("chapters").select("number").eq("series_id", s.id).limit(5000);
  return { seriesId: s.id, slug: s.slug, published: s.published, numbers: (ch ?? []).map((c) => Number(c.number)) };
}

/** The device is still sending this work: keep the site's own queue tick off it while it does. */
async function keepReserved(admin: Admin, obraId: number) {
  await admin.from("mediocre_queue").update({ next_run_at: reserveUntil() }).eq("obra_id", obraId).in("status", ["running", "waiting"]);
}

export async function runIngest(admin: Admin, body: IngestBody, createdBy: string) {
  if (body.action === "chapter_status") return { ...(await chapterStatus(admin, body.obraId)), added: 0, skipped: 0 };
  if (body.action === "queue_remove") {
    // Tira da fila (a obra e os capítulos já publicados continuam no site).
    const { data, error } = await admin.from("mediocre_queue").delete().in("obra_id", body.obraIds).select("obra_id");
    if (error) throw new Error("Não foi possível tirar da fila.");
    return { removed: (data ?? []).length, added: 0, skipped: 0 };
  }
  if (body.action === "queue_clear") {
    const { data, error } = await admin.from("mediocre_queue").delete().in("status", ["running", "waiting", "done", "error"]).select("obra_id");
    if (error) throw new Error("Não foi possível esvaziar a fila.");
    return { removed: (data ?? []).length, added: 0, skipped: 0 };
  }
  if (body.action === "site_list") return { ...(await siteList(admin, body)), added: 0, skipped: 0 };
  if (body.action === "site_work") return { ...(await siteWork(admin, body.seriesId)), added: 0, skipped: 0 };
  if (body.action === "site_update") {
    const { data, error } = await admin.from("series").update({ ...body.patch, updated_at: new Date().toISOString() }).eq("id", body.seriesId).select(SITE_COLUMNS).maybeSingle();
    if (error || !data) throw new Error("Não foi possível salvar a obra.");
    return { work: withCount(data as SiteRow), added: 0, skipped: 0 };
  }
  if (body.action === "chapter_update") {
    const { data, error } = await admin.from("chapters").update({ published: body.published }).eq("id", body.chapterId).select("id, published").maybeSingle();
    if (error || !data) throw new Error("Não foi possível alterar o capítulo.");
    return { chapter: data, added: 0, skipped: 0 };
  }
  if (body.action === "chapter_delete") {
    const { data, error } = await admin.from("chapters").delete().eq("id", body.chapterId).select("id").maybeSingle();
    if (error || !data) throw new Error("Não foi possível excluir o capítulo.");
    return { deleted: data.id, added: 0, skipped: 0 };
  }
  if (body.action === "site_delete") {
    const { data: s } = await admin.from("series").select("id, source_mediocre_id").eq("id", body.seriesId).maybeSingle();
    if (!s) throw new Error("Obra não encontrada no site.");
    await admin.from("chapters").delete().eq("series_id", s.id);
    const { error } = await admin.from("series").delete().eq("id", s.id);
    if (error) throw new Error("Não foi possível excluir a obra.");
    if (s.source_mediocre_id) await admin.from("mediocre_queue").delete().eq("obra_id", s.source_mediocre_id);
    return { deleted: s.id, added: 0, skipped: 0 };
  }
  if (body.action === "plan") return { ...(await ingestPlan(admin, body.syncLimit)), added: 0, skipped: 0 };
  if (body.action === "requests") return { groups: await requestGroups(admin), added: 0, skipped: 0 };
  if (body.action === "request_link") return { ...(await linkRequests(admin, body, createdBy)), added: 0, skipped: 0 };
  if (body.action === "request_reject") {
    const { data, error } = await admin.from("work_requests").update({ status: "rejected", admin_note: body.note || "Não encontramos esta obra para adicionar.", mediocre_id: null })
      .in("id", body.ids).eq("status", "pending").select("id");
    if (error) throw new Error("Não foi possível recusar os pedidos.");
    return { rejected: (data ?? []).length, added: 0, skipped: 0 };
  }
  if (body.action === "check") return { ...(await ingestCheck(admin, body.ids)), added: 0, skipped: 0 };
  if (body.action === "enqueue") {
    const r = await enqueueWorks(admin, body.items, createdBy);
    // The runner publishes these right away; keep the site's own queue tick off them meanwhile.
    await admin.from("mediocre_queue").update({ next_run_at: reserveUntil() }).in("obra_id", body.items.map((i) => i.obraId)).in("status", ["running", "waiting"]);
    return { queued: r.added, added: 0, skipped: 0 };
  }
  if (body.action === "finish") { await finishIngest(admin, body, createdBy); return { ok: true, added: 0, skipped: 0 }; }
  if (body.action === "work") {
    await keepReserved(admin, body.obraId);
    // Obra pedida por leitores entra como rascunho e é publicada com os primeiros capítulos (o aviso não chega com a obra vazia).
    const requested = await hasLinkedRequests(admin, body.obraId);
    const r = await importMediocreWork(admin, body.obraId, { createdBy, chapterLimit: 0, draft: !body.publish || requested, get: suppliedGetter({ [`/obras/${body.obraId}`]: body.work }, null) });
    return { slug: r.slug, created: r.created, pendingCapIds: r.pendingCapIds, remaining: r.remaining, added: 0, skipped: 0 };
  }
  const { data: s } = await admin.from("series").select("id, slug, kind").eq("source_mediocre_id", body.obraId).maybeSingle();
  if (!s) throw new Error("Envie primeiro os dados da obra.");
  await keepReserved(admin, body.obraId);
  let added = 0, skipped = 0;
  for (const c of body.chapters) {
    const ok = await importChapter(admin, s.id, c.capId, s.kind === "Novel", suppliedGetter({ [`/capitulos/${c.capId}`]: c.meta }, c.content));
    ok ? added++ : skipped++;
  }
  if (added) await publishRequested(admin, body.obraId);
  return { slug: s.slug, created: false, pendingCapIds: [] as number[], added, skipped };
}

/* ---------- pedidos dos leitores ---------- */

export type RequestGroup = {
  key: string; title: string; kinds: string[]; count: number; first: string; last: string;
  notes: string[]; ids: string[]; mediocreId: number | null; queue: "waiting" | "running" | null;
};

/** Mesma obra pedida por vários leitores = um grupo (título sem acentos/pontuação; novel separada). */
export function requestGroupKey(title: string, kind: string): string {
  return `${titleKey(title)}${kind === "Novel" ? "|novel" : ""}`;
}

/** Agrupa pedidos pendentes: mais leitores primeiro, depois o pedido mais antigo. */
export function groupRequests(rows: { id: string; title: string; kind: string; notes: string | null; created_at: string; mediocre_id: number | null }[]): RequestGroup[] {
  const groups = new Map<string, RequestGroup>();
  for (const r of rows) {
    const key = requestGroupKey(r.title, r.kind);
    if (!key.replace("|novel", "")) continue;
    const g = groups.get(key) ?? { key, title: r.title.trim(), kinds: [], count: 0, first: r.created_at, last: r.created_at, notes: [], ids: [], mediocreId: null, queue: null };
    g.count++; g.ids.push(r.id);
    if (!g.kinds.includes(r.kind)) g.kinds.push(r.kind);
    if (r.created_at < g.first) g.first = r.created_at;
    if (r.created_at > g.last) g.last = r.created_at;
    const note = (r.notes ?? "").trim();
    if (note && g.notes.length < 3 && !g.notes.includes(note)) g.notes.push(note.slice(0, 300));
    if (r.mediocre_id && !g.mediocreId) g.mediocreId = r.mediocre_id;
    groups.set(key, g);
  }
  return [...groups.values()].sort((a, b) => b.count - a.count || a.first.localeCompare(b.first));
}

async function requestGroups(admin: Admin): Promise<RequestGroup[]> {
  const { data, error } = await admin.from("work_requests").select("id, title, kind, notes, created_at, mediocre_id").eq("status", "pending").order("created_at").limit(500);
  if (error) throw new Error("Não foi possível carregar os pedidos.");
  const groups = groupRequests(data ?? []);
  const linked = [...new Set(groups.map((g) => g.mediocreId).filter((n): n is number => n !== null))];
  if (linked.length) {
    const { data: q } = await admin.from("mediocre_queue").select("obra_id, status").in("obra_id", linked).in("status", ["waiting", "running"]);
    const st = new Map((q ?? []).map((r) => [Number(r.obra_id), r.status as "waiting" | "running"]));
    for (const g of groups) g.queue = g.mediocreId ? st.get(g.mediocreId) ?? null : null;
  }
  return groups;
}

async function hasLinkedRequests(admin: Admin, obraId: number): Promise<boolean> {
  const { count } = await admin.from("work_requests").select("id", { count: "exact", head: true }).eq("status", "pending").eq("mediocre_id", obraId);
  return (count ?? 0) > 0;
}

/** Obra pedida que já tem capítulo no site: publica (o banco atende os pedidos e avisa os leitores). */
async function publishRequested(admin: Admin, obraId: number): Promise<boolean> {
  if (!(await hasLinkedRequests(admin, obraId))) return false;
  const { data: s } = await admin.from("series").select("id, published, chapters(count)").eq("source_mediocre_id", obraId).maybeSingle();
  const chapters = (s as { chapters?: { count: number }[] } | null)?.chapters?.[0]?.count ?? 0;
  if (!s || s.published || !chapters) return false;
  const { error } = await admin.from("series").update({ published: true }).eq("id", s.id);
  return !error;
}

/**
 * O admin escolheu no app a obra da MediocreScan que atende estes pedidos. Se ela já está no site,
 * os pedidos são atendidos agora; senão entra na fila na frente das outras (prioridade = leitores).
 */
async function linkRequests(admin: Admin, body: { ids: string[]; obraId: number; title: string | null }, createdBy: string) {
  const now = new Date().toISOString();
  const { data: reqs, error } = await admin.from("work_requests").update({ mediocre_id: body.obraId, queued_at: now })
    .in("id", body.ids).eq("status", "pending").select("id");
  if (error) throw new Error("Não foi possível ligar os pedidos.");
  const ids = (reqs ?? []).map((r) => r.id);
  if (!ids.length) throw new Error("Esses pedidos já foram atendidos.");
  const { data: s } = await admin.from("series").select("id, slug, published, chapters(count)").eq("source_mediocre_id", body.obraId).maybeSingle();
  if (s) {
    if (!s.published) await publishRequested(admin, body.obraId);
    const { data: fresh } = await admin.from("series").select("id, slug, published").eq("id", s.id).maybeSingle();
    if (fresh?.published) {
      // Pedidos ligados depois da publicação: o gatilho da obra não roda de novo, então atende aqui.
      await admin.from("work_requests").update({ status: "fulfilled", series_id: fresh.id }).in("id", ids).eq("status", "pending");
      return { linked: ids.length, fulfilled: ids.length, queued: false, slug: fresh.slug };
    }
  }
  // Volta para a fila mesmo que já tenha passado por ela (terminada ou com erro).
  await admin.from("mediocre_queue").delete().eq("obra_id", body.obraId).in("status", ["done", "error"]);
  const { data: q } = await admin.from("mediocre_queue").select("id").eq("obra_id", body.obraId).in("status", ["waiting", "running"]).limit(1).maybeSingle();
  if (!q) await admin.from("mediocre_queue").insert({ obra_id: body.obraId, title: body.title, created_by: createdBy });
  const { data: pos } = await admin.from("mediocre_queue").select("obra_id, status, priority, created_at").in("status", ["waiting", "running"]).limit(200);
  const position = queueOrder(pos ?? []).findIndex((r) => Number(r.obra_id) === body.obraId) + 1;
  return { linked: ids.length, fulfilled: 0, queued: true, position, slug: s?.slug ?? null };
}
