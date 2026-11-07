import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Creates a 24h upload code for the device helper; the raw code is returned only once. */
export const createIngestToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!isAdmin) throw new Error("Somente administradores.");
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    const token = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
    const { hashIngestToken } = await import("./mediocre-ingest.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("mediocre_ingest_tokens").insert({ token_hash: await hashIngestToken(token), created_by: context.userId, expires_at: new Date(Date.now() + 86_400_000).toISOString() });
    if (error) throw new Error("Não foi possível criar o código.");
    return { token };
  });
