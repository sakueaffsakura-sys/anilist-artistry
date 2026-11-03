import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { parseMediocreRequest, PUBLIC_OPERATIONS, type MediocreResult } from "./mediocre-api";

/** Admin-only proxy: every allowlisted operation, including the personal reading endpoint. */
export const queryMediocreApi = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => parseMediocreRequest(input))
  .handler(async ({ data, context }): Promise<MediocreResult> => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!isAdmin) return { ok: false, status: 403, error: { code: "FORBIDDEN", message: "Somente administradores podem usar esta consulta." } };
    const { runMediocre } = await import("./mediocre-api.server");
    return runMediocre(data);
  });

/** Public read-only proxy for the showcase. Personal endpoints are rejected. */
export const queryMediocrePublic = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => {
    const req = parseMediocreRequest(input);
    if (!PUBLIC_OPERATIONS.includes(req.operation)) throw new Error("Operação não permitida.");
    return req;
  })
  .handler(async ({ data }): Promise<MediocreResult> => {
    const { runMediocre } = await import("./mediocre-api.server");
    return runMediocre(data);
  });
