import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

const WORK_COLUMNS = "id, slug, title, alt_titles, cover_url, banner_url, synopsis, genres, age_rating, kind, status, rating, views, author, artist, chapter_count, latest_chapter_number, latest_chapter_at, updated_at";
const WORKS_PAGE = 500;
const INDEX_PAGE = 1000;
const MAX_CHAPTERS = 40;

/**
 * Emergency backup export for the GitHub workflow (scripts/copia-obras.mjs). Requires an admin's upload code
 * (same codes as /api/public/mediocre-ingest) and only returns published works and their published chapters —
 * never drafts, users or settings.
 */
export const Route = createFileRoute("/api/public/backup-export")({
  staticData: { sitemap: false },
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = request.headers.get("x-ingest-token") ?? "";
        if (!/^[A-Za-z0-9_-]{32,128}$/.test(token)) return json({ error: "Código de envio ausente ou inválido." }, 401);
        const { hashIngestToken } = await import("@/lib/mediocre-ingest.server");
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: code } = await supabaseAdmin.from("mediocre_ingest_tokens").select("created_by, revoked_at, expires_at").eq("token_hash", await hashIngestToken(token)).maybeSingle();
        if (!code || code.revoked_at || new Date(code.expires_at).getTime() < Date.now()) return json({ error: "Código de envio expirado ou revogado." }, 401);
        const { data: isAdmin } = await supabaseAdmin.rpc("has_role", { _user_id: code.created_by, _role: "admin" });
        if (!isAdmin) return json({ error: "Este código não pertence a um administrador." }, 403);

        const parsed = z.discriminatedUnion("part", [
          z.object({ part: z.literal("works"), offset: z.number().int().min(0).max(1_000_000) }),
          z.object({ part: z.literal("chapter-index"), offset: z.number().int().min(0).max(10_000_000) }),
          z.object({ part: z.literal("chapters"), ids: z.array(z.string().uuid()).min(1).max(MAX_CHAPTERS) }),
        ]).safeParse(await request.json().catch(() => null));
        if (!parsed.success) return json({ error: "Pedido inválido." }, 400);
        const body = parsed.data;

        if (body.part === "works") {
          const { data, error } = await supabaseAdmin.from("series").select(WORK_COLUMNS).eq("published", true).order("id").range(body.offset, body.offset + WORKS_PAGE - 1);
          if (error) return json({ error: "Falha ao ler as obras." }, 500);
          return json({ rows: data ?? [], pageSize: WORKS_PAGE });
        }
        if (body.part === "chapter-index") {
          const { data, error } = await supabaseAdmin.from("chapters").select("id, series_id, number, title, created_at, series!inner(published)").eq("published", true).eq("series.published", true).order("id").range(body.offset, body.offset + INDEX_PAGE - 1);
          if (error) return json({ error: "Falha ao ler os capítulos." }, 500);
          return json({ rows: (data ?? []).map(({ series: _s, ...c }) => c), pageSize: INDEX_PAGE });
        }
        const { data, error } = await supabaseAdmin.from("chapters").select("id, series_id, number, title, created_at, pages, content, series!inner(published)").in("id", body.ids).eq("published", true).eq("series.published", true);
        if (error) return json({ error: "Falha ao ler os capítulos." }, 500);
        return json({ rows: (data ?? []).map(({ series: _s, ...c }) => c) });
      },
    },
  },
});
