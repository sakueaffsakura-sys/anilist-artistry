import { createFileRoute } from "@tanstack/react-router";

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "content-type, x-ingest-token" };
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: CORS });

/** Receives MediocreScan data fetched by an admin's own device (the API blocks this server's IP). */
export const Route = createFileRoute("/api/public/mediocre-ingest")({
  staticData: { sitemap: false },
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      POST: async ({ request }) => {
        const { hashIngestToken, parseIngestBody, runIngest, INGEST_MAX_BYTES } = await import("@/lib/mediocre-ingest.server");
        const token = request.headers.get("x-ingest-token") ?? "";
        if (!/^[A-Za-z0-9_-]{32,128}$/.test(token)) return json({ error: "Código de envio ausente ou inválido." }, 401);
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: row } = await supabaseAdmin.from("mediocre_ingest_tokens").select("*").eq("token_hash", await hashIngestToken(token)).maybeSingle();
        if (!row || row.revoked_at || new Date(row.expires_at).getTime() < Date.now()) return json({ error: "Código de envio expirado ou revogado." }, 401);
        const { data: isAdmin } = await supabaseAdmin.rpc("has_role", { _user_id: row.created_by, _role: "admin" });
        if (!isAdmin) return json({ error: "Sem permissão." }, 403);
        const text = await request.text();
        if (text.length > INGEST_MAX_BYTES) return json({ error: "Envio grande demais." }, 413);
        try {
          const body = parseIngestBody(JSON.parse(text));
          const r = await runIngest(supabaseAdmin, body, row.created_by);
          await supabaseAdmin.from("mediocre_ingest_tokens").update({
            last_used_at: new Date().toISOString(),
            works_received: row.works_received + (body.action === "work" ? 1 : 0),
            chapters_added: row.chapters_added + r.added,
            errors: row.errors + r.skipped,
          }).eq("id", row.id);
          return json(r);
        } catch (e) {
          await supabaseAdmin.from("mediocre_ingest_tokens").update({ errors: row.errors + 1, last_used_at: new Date().toISOString() }).eq("id", row.id);
          return json({ error: e instanceof Error ? e.message : "Falha ao processar." }, 400);
        }
      },
    },
  },
});
