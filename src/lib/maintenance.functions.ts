import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader, setCookie, deleteCookie } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getMaintenanceStatus = createServerFn({ method: "GET" }).handler(async () => {
  const { readMaintenance } = await import("./maintenance.server");
  return readMaintenance();
});

export const verifyMaintenanceAdmin = createServerFn({ method: "POST" }).handler(async () => {
  const { verifiedMaintenanceAdmin } = await import("./maintenance.server");
  const token = getRequestHeader("authorization")?.replace(/^Bearer /, "");
  const isAdmin = await verifiedMaintenanceAdmin(token);
  if (isAdmin && token) setCookie("bm-maintenance-session", token, { httpOnly: true, sameSite: "lax", secure: true, path: "/", maxAge: 3600 });
  else deleteCookie("bm-maintenance-session", { path: "/" });
  return { isAdmin };
});

export const saveMaintenanceSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ enabled: z.boolean(), title: z.string().trim().min(1).max(160),
    message: z.string().max(2000), media_kind: z.enum(["image", "video"]),
    media_path: z.string().max(500).refine((p) => p === "" || /^backgrounds\/[a-zA-Z0-9_.-]+$/.test(p)),
  }).parse(input))
  .handler(async ({ context, data }) => {
    const role = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (role.error || !role.data) throw new Error("Somente administradores podem alterar a manutenção.");
    const { error } = await context.supabase.from("maintenance_settings").upsert({ id: 1, ...data, updated_at: new Date().toISOString() });
    if (error) throw new Error("Não foi possível salvar a manutenção.");
    return { ok: true };
  });