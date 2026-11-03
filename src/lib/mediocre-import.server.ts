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
export const IMPORT_CHAPTER_LIMIT = 40;

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
export async function importMediocreWork(admin: Admin, obraId: number, opts: { kind?: string; createdBy: string }): Promise<ImportOutcome> {
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
    if (insert.error) throw new Error(insert.error.message.includes("título") || insert.error.code === "23505" ? "Já existe uma obra com este título no Better Mangá." : "Não foi possível criar a obra.");
    series = insert.data;
    created = true;
  }

  const chapters = (extractList({ capitulos: work["capitulos"] }) ?? []).filter((c) => typeof c["cap_id"] === "number");
  const { data: existing } = await admin.from("chapters").select("number").eq("series_id", series.id).limit(5000);
  const have = new Set((existing ?? []).map((c) => Number(c.number)));
  const todo = chapters.filter((c) => !have.has(Number(c["cap_num"]))).sort((a, b) => Number(a["cap_num"]) - Number(b["cap_num"]));
  const batch = todo.slice(0, IMPORT_CHAPTER_LIMIT);
  const isNovel = series.kind === "Novel";
  let added = 0, skipped = 0;
  for (let i = 0; i < batch.length; i += 4) {
    const results = await Promise.all(batch.slice(i, i + 4).map((c) => importChapter(admin, series!.id, c["cap_id"] as number, isNovel)));
    for (const ok of results) ok ? added++ : skipped++;
  }
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
