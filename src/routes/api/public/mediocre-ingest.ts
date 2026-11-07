import { createFileRoute } from "@tanstack/react-router";

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "content-type, x-ingest-token, authorization" };
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: CORS });

/**
 * Receives MediocreScan data fetched outside this server (the API blocks its IP): by an admin's device,
 * the GitHub automation (both with an upload code) or the admin app (signed in with the site account).
 */
export const Route = createFileRoute("/api/public/mediocre-ingest")({
  staticData: { sitemap: false },
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      POST: async ({ request }) => {
        const { hashIngestToken, parseIngestBody, runIngest, INGEST_MAX_BYTES } = await import("@/lib/mediocre-ingest.server");
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const bearer = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
        const token = request.headers.get("x-ingest-token") ?? "";
        let createdBy: string;
        let row: { id: string; works_received: number; chapters_added: number; errors: number } | null = null;
        if (token) {
          if (!/^[A-Za-z0-9_-]{32,128}$/.test(token)) return json({ error: "Código de envio ausente ou inválido." }, 401);
          const { data } = await supabaseAdmin.from("mediocre_ingest_tokens").select("*").eq("token_hash", await hashIngestToken(token)).maybeSingle();
          if (!data || data.revoked_at || new Date(data.expires_at).getTime() < Date.now()) return json({ error: "Código de envio expirado ou revogado." }, 401);
          row = data;
          createdBy = data.created_by;
        } else if (bearer) {
          // Admin app: the site's own session token, checked with Supabase on every request.
          const { data, error } = await supabaseAdmin.auth.getUser(bearer);
          if (error || !data.user) return json({ error: "Sessão expirada. Entre novamente." }, 401);
          createdBy = data.user.id;
        } else {
          return json({ error: "Entre com sua conta ou informe um código de envio." }, 401);
        }
        const { data: isAdmin } = await supabaseAdmin.rpc("has_role", { _user_id: createdBy, _role: "admin" });
        if (!isAdmin) return json({ error: "Esta conta não é administradora do site." }, 403);
        const text = await request.text();
        if (text.length > INGEST_MAX_BYTES) return json({ error: "Envio grande demais." }, 413);
        try {
          const body = parseIngestBody(JSON.parse(text));
          const r = await runIngest(supabaseAdmin, body, createdBy);
          if (row) {
            await supabaseAdmin.from("mediocre_ingest_tokens").update({
              last_used_at: new Date().toISOString(),
              works_received: row.works_received + (body.action === "work" ? 1 : 0),
              chapters_added: row.chapters_added + r.added,
              errors: row.errors + r.skipped,
            }).eq("id", row.id);
          }
          return json(r);
        } catch (e) {
          if (row) await supabaseAdmin.from("mediocre_ingest_tokens").update({ errors: row.errors + 1, last_used_at: new Date().toISOString() }).eq("id", row.id);
          return json({ error: e instanceof Error ? e.message : "Falha ao processar." }, 400);
        }
      },
    },
  },
});
