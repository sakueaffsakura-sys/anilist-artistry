import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { importChapter, importMediocreWork, type MediocreGetter } from "./mediocre-import.server";

type Admin = SupabaseClient<Database>;
export const INGEST_MAX_BYTES = 6_000_000;
export const INGEST_MAX_CHAPTERS = 5;

export async function hashIngestToken(token: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export type IngestBody =
  | { action: "work"; obraId: number; work: unknown }
  | { action: "chapters"; obraId: number; chapters: { capId: number; meta: unknown; content: unknown }[] };

/** Validates the helper payload shape; throws a readable message on anything unexpected. */
export function parseIngestBody(v: unknown): IngestBody {
  const o = v as Record<string, unknown> | null;
  if (!o || typeof o !== "object") throw new Error("Corpo inválido.");
  const obraId = o.obraId;
  if (typeof obraId !== "number" || !Number.isSafeInteger(obraId) || obraId <= 0) throw new Error("ID da obra inválido.");
  if (o.action === "work") {
    if (!o.work || typeof o.work !== "object") throw new Error("Dados da obra ausentes.");
    return { action: "work", obraId, work: o.work };
  }
  if (o.action === "chapters") {
    if (!Array.isArray(o.chapters) || !o.chapters.length || o.chapters.length > INGEST_MAX_CHAPTERS) throw new Error(`Envie de 1 a ${INGEST_MAX_CHAPTERS} capítulos por vez.`);
    const chapters = o.chapters.map((c) => {
      const r = c as Record<string, unknown>;
      if (!r || typeof r.capId !== "number" || !Number.isSafeInteger(r.capId) || r.capId <= 0) throw new Error("Capítulo inválido.");
      if (!r.meta || typeof r.meta !== "object") throw new Error("Dados do capítulo ausentes.");
      return { capId: r.capId, meta: r.meta, content: r.content ?? null };
    });
    return { action: "chapters", obraId, chapters };
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

export async function runIngest(admin: Admin, body: IngestBody, createdBy: string) {
  if (body.action === "work") {
    const r = await importMediocreWork(admin, body.obraId, { createdBy, chapterLimit: 0, draft: true, get: suppliedGetter({ [`/obras/${body.obraId}`]: body.work }, null) });
    return { slug: r.slug, created: r.created, pendingCapIds: r.pendingCapIds, added: 0, skipped: 0 };
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
