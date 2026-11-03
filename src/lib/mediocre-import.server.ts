import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { chapterContentPath, extractWork, normalizeChapterContent, titleKey, workImage, extractList } from "./mediocre-api";
import { mediocreGet } from "./mediocre-api.server";
import { KINDS } from "./work-categories";
import { normalizeGenres } from "./work-genres";
import { slugify } from "./media";

type Admin = SupabaseClient<Database>;
type Row = Record<string, unknown>;

/** Chapters copied per call, to stay inside the worker time budget; the admin can run again to continue. */
export const IMPORT_CHAPTER_LIMIT = 20;

/** Existing catalog work whose main or alternative title matches one of the given names. */
async function findExistingByTitle(admin: Admin, names: string[]): Promise<{ id: string; slug: string; kind: string } | null> {
  const keys = new Set(names.map(titleKey).filter(Boolean));
  for (const n of names.slice(0, 5)) {
    const pattern = `%${n.replace(/[%_,()]/g, " ").trim().slice(0, 60)}%`;
    const { data } = await admin.from("series").select("id, slug, kind, title, alt_titles").or(`title.ilike.${pattern},alt_titles.ilike.${pattern}`).limit(10);
    const hit = (data ?? []).find((s) => [s.title, ...(s.alt_titles ?? "").split(",")].some((t) => keys.has(titleKey(t))));
    if (hit) return { id: hit.id, slug: hit.slug, kind: hit.kind };
  }
  return null;
}

export interface ImportOutcome { seriesId: string; slug: string; created: boolean; added: number; skipped: number; remaining: number }

function kindFor(work: Row, fallback?: string): string {
  const f = work["formato"];
  const name = typeof f === "string" ? f : f && typeof f === "object" ? (f as Row)["formt_nome"] : null;
  if (work["obr_novel_id"]) return "Novel";
  const hit = typeof name === "string" ? KINDS.find((k) => k.toLowerCase() === name.toLowerCase()) : undefined;
  return hit ?? (fallback && (KINDS as readonly string[]).includes(fallback) ? fallback : "Comic");
}

function statusFor(v: unknown): string {
  return typeof v === "string" && /conclu|complet|finaliz/i.test(v) ? "Completo" : "Em andamento";
}

/** Copies one chapter's pages (or text) into chapters; returns false when content is unavailable. */
async function importChapter(admin: Admin, seriesId: string, capId: number, isNovel: boolean): Promise<boolean> {
  const meta = await mediocreGet("api", `/capitulos/${capId}`);
  if (!meta.ok && meta.error.code === "IP_BLOCKED") throw new Error(meta.error.message);
  if (!meta.ok) return false;
  const m = meta.data as Row;
  const num = Number(m["cap_num"]);
  if (!Number.isFinite(num) || num < 0) return false;
  const title = typeof m["cap_nome"] === "string" && m["cap_nome"] !== String(num) ? m["cap_nome"] : null;
  const text = typeof m["cap_conteudo_texto"] === "string" && m["cap_conteudo_texto"].trim() ? m["cap_conteudo_texto"] : null;
  let pages: string[] = [];
  let content: string | null = text;
  const path = chapterContentPath(m);
  if (path) {
    const c = await mediocreGet("cdn", path);
    if (c.ok) {
      const blocks = normalizeChapterContent(c.data);
      pages = blocks.flatMap((b) => (b.type === "image" ? [b.url] : []));
      const texts = blocks.flatMap((b) => (b.type === "text" ? [b.text] : []));
      if (!content && texts.length) content = texts.join("\n\n");
    }
  }
  if (!pages.length && !content) return false;
  const { error } = await admin.from("chapters").insert({
    series_id: seriesId, number: num, title, published: true,
    pages: isNovel && content ? [] : pages,
    content: isNovel || !pages.length ? content : null,
  });
  return !error;
}

/** Imports (or continues importing) a MediocreScan work into the catalog. */
export async function importMediocreWork(admin: Admin, obraId: number, opts: { kind?: string; createdBy: string | null; chapterLimit?: number }): Promise<ImportOutcome> {
  const res = await mediocreGet("api", `/obras/${obraId}`);
  if (!res.ok) throw new Error(res.error.message);
  const work = extractWork(res.data);
  const name = work && typeof work["obr_nome"] === "string" ? work["obr_nome"].trim() : "";
  if (!work || !name) throw new Error("O formato retornado não foi reconhecido.");

  let created = false;
  let { data: series } = await admin.from("series").select("id, slug, kind").eq("source_mediocre_id", obraId).maybeSingle();
  if (!series) {
    const alts = Array.isArray(work["obr_titulos_alternativos"]) ? (work["obr_titulos_alternativos"] as unknown[]).filter((t): t is string => typeof t === "string" && Boolean(t.trim())) : [];
    const tags = Array.isArray(work["tags"]) ? (work["tags"] as unknown[]).map((t) => (t && typeof t === "object" ? (t as Row)["tag_nome"] : t)).filter((t): t is string => typeof t === "string" && t !== "+18") : [];
    const base = slugify(name) || `obra-${obraId}`;
    const { data: taken } = await admin.from("series").select("id").eq("slug", base).maybeSingle();
    const insert = await admin.from("series").insert({
      slug: taken ? `${base}-${obraId}` : base,
      title: name,
      alt_titles: alts.join(", ") || null,
      synopsis: typeof work["obr_descricao"] === "string" ? work["obr_descricao"] : null,
      cover_url: workImage(work),
      banner_url: workImage(work, "banner"),
      kind: kindFor(work, opts.kind),
      status: statusFor(work["obr_status"]),
      genres: normalizeGenres(tags),
      published: true,
      created_by: opts.createdBy,
      source_mediocre_id: obraId,
    }).select("id, slug, kind").single();
    if (insert.error) {
      // Same title already on the site: link that work instead of failing, so it counts as published.
      const clash = insert.error.message.includes("título") || insert.error.code === "23505";
      const existingWork = clash ? await findExistingByTitle(admin, [name, ...alts]) : null;
      if (!existingWork) throw new Error(clash ? `"${name}" já existe no Better Mangá com outro vínculo.` : `Não foi possível criar "${name}": ${insert.error.message}`);
      await admin.from("series").update({ source_mediocre_id: obraId }).eq("id", existingWork.id).is("source_mediocre_id", null);
      series = existingWork;
    } else {
      series = insert.data;
      created = true;
    }
  }

  const chapters = (extractList({ capitulos: work["capitulos"] }) ?? []).filter((c) => typeof c["cap_id"] === "number");
  const { data: existing } = await admin.from("chapters").select("number").eq("series_id", series.id).limit(5000);
  const have = new Set((existing ?? []).map((c) => Number(c.number)));
  const todo = chapters.filter((c) => !have.has(Number(c["cap_num"]))).sort((a, b) => Number(a["cap_num"]) - Number(b["cap_num"]));
  const batch = todo.slice(0, opts.chapterLimit ?? IMPORT_CHAPTER_LIMIT);
  const isNovel = series.kind === "Novel";
  let added = 0, skipped = 0;
  // One chapter at a time: bursts made the API block the server IP.
  for (const c of batch) (await importChapter(admin, series!.id, c["cap_id"] as number, isNovel)) ? added++ : skipped++;
  return { seriesId: series.id, slug: series.slug, created, added, skipped, remaining: todo.length - batch.length };
}

/** Finds a single exact-title match in the API's public lists (no search endpoint exists). */
export async function findMediocreByTitle(title: string): Promise<number | null> {
  const key = titleKey(title);
  if (!key) return null;
  const ids = new Set<number>();
  for (const path of ["/obras/home?formato=1", "/obras/atualizadas-recentes", "/obras/atualizadas-recentes-ia"]) {
    const r = await mediocreGet("api", path);
    if (!r.ok) continue;
    for (const row of extractList(r.data) ?? []) {
      const n = row["nome"] ?? row["obr_nome"];
      const id = row["id"] ?? row["obr_id"];
      if (typeof n === "string" && typeof id === "number" && titleKey(n) === key) ids.add(id);
    }
  }
  return ids.size === 1 ? [...ids][0]! : null;
}

/** Which MediocreScan work IDs already exist in the catalog (used to skip republishing). */
export async function importedMediocreIds(admin: Admin, ids: number[]): Promise<number[]> {
  if (!ids.length) return [];
  const { data } = await admin.from("series").select("source_mediocre_id").in("source_mediocre_id", ids.slice(0, 500));
  return (data ?? []).map((r) => Number(r.source_mediocre_id)).filter((n) => Number.isSafeInteger(n));
}

/**
 * Copies new chapters for the imported works least recently checked; each run handles a few
 * works so it fits the scheduler's time budget, and rotation reaches every work over time.
 */
export async function syncMediocreChapters(admin: Admin, maxWorks = 2): Promise<{ checked: number; added: number; blocked?: boolean }> {
  // A fila de publicação tem prioridade: só um trabalho conversa com a API por vez.
  const { count: queued } = await admin.from("mediocre_queue").select("id", { count: "exact", head: true }).in("status", ["waiting", "running"]);
  if ((queued ?? 0) > 0) return { checked: 0, added: 0 };
  const { data: cfg } = await admin.from("mediocre_settings").select("blocked_until").eq("id", 1).maybeSingle();
  if (cfg?.blocked_until && new Date(cfg.blocked_until).getTime() > Date.now()) return { checked: 0, added: 0, blocked: true };
  // Teste rápido: bloqueio Cloudflare pausa 1 hora; recusa/limite da API pausa 20 minutos para não piorar o bloqueio.
  const probe = await mediocreGet("api", "/obras/atualizadas-recentes");
  if (!probe.ok && probe.error.code === "IP_BLOCKED") return { checked: 0, added: 0, blocked: true };
  if (!probe.ok && (probe.error.code === "BLOCKED" || probe.status === 403 || probe.status === 429)) {
    const ms = probe.error.code === "BLOCKED" ? 3_600_000 : 1_200_000;
    await admin.from("mediocre_settings").update({ blocked_until: new Date(Date.now() + ms).toISOString() }).eq("id", 1);
    return { checked: 0, added: 0, blocked: true };
  }
  // Obras sem capítulos (importação interrompida) vêm primeiro.
  const { data: empty } = await admin.from("series").select("id, source_mediocre_id, chapters(count)")
    .not("source_mediocre_id", "is", null).limit(200);
  const missing = (empty ?? []).filter((r) => ((r as { chapters?: { count: number }[] }).chapters?.[0]?.count ?? 0) === 0).slice(0, maxWorks);
  const { data: rotated } = await admin.from("series").select("id, source_mediocre_id")
    .not("source_mediocre_id", "is", null).order("mediocre_synced_at", { ascending: true, nullsFirst: true }).limit(maxWorks);
  const data = missing.length ? missing : rotated;
  let added = 0;
  for (const s of data ?? []) {
    await admin.from("series").update({ mediocre_synced_at: new Date().toISOString() }).eq("id", s.id);
    try { added += (await importMediocreWork(admin, Number(s.source_mediocre_id), { createdBy: null })).added; }
    catch (e) { console.log("[mediocre] sync falhou", s.source_mediocre_id, e instanceof Error ? e.message : "erro"); }
  }
  return { checked: data?.length ?? 0, added };
}
