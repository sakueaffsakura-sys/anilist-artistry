import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Admin button: import or continue importing a MediocreScan work. */
export const importMediocreWorkFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { obraId: number }) => {
    if (!Number.isSafeInteger(input?.obraId) || input.obraId <= 0) throw new Error("ID da obra inválido.");
    return { obraId: input.obraId };
  })
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!isAdmin) throw new Error("Somente administradores podem importar obras.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { importMediocreWork } = await import("./mediocre-import.server");
    return importMediocreWork(supabaseAdmin, data.obraId, { createdBy: context.userId });
  });

/**
 * Called right after a reader submits a request. Reads the request as the reader (RLS),
 * and only when it is theirs and pending, searches the API and imports an exact single match.
 */
export const autoFulfillRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { requestId: string }) => {
    if (typeof input?.requestId !== "string" || !/^[0-9a-f-]{36}$/i.test(input.requestId)) throw new Error("Pedido inválido.");
    return { requestId: input.requestId };
  })
  .handler(async ({ data, context }): Promise<{ added: boolean; slug?: string }> => {
    const { data: req } = await context.supabase.from("work_requests").select("id, user_id, title, kind, status").eq("id", data.requestId).maybeSingle();
    if (!req || req.user_id !== context.userId || req.status !== "pending") return { added: false };
    const { findMediocreByTitle, importMediocreWork } = await import("./mediocre-import.server");
    const obraId = await findMediocreByTitle(req.title);
    if (!obraId) return { added: false };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    try {
      const out = await importMediocreWork(supabaseAdmin, obraId, { kind: req.kind, createdBy: null } // never grant the reader authorship rights);
      // Fulfil explicitly; the notification trigger fires on this status change.
      await supabaseAdmin.from("work_requests").update({ status: "fulfilled", series_id: out.seriesId, admin_note: "Adicionada automaticamente." }).eq("id", req.id).eq("status", "pending");
      return { added: true, slug: out.slug };
    } catch (e) {
      console.log("[mediocre] auto-import falhou", e instanceof Error ? e.message : "erro");
      return { added: false };
    }
  });
