import { createStart, createCsrfMiddleware, createMiddleware } from "@tanstack/react-start";

import { renderErrorPage } from "./lib/error-page";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";
import { MAINTENANCE_PUBLIC_FUNCTIONS, maintenanceExemptPath, canEnterMaintenance, databaseDownTarget } from "@/lib/maintenance-policy";
import { getCookie } from "@tanstack/react-start/server";

// Function metadata is available here, not in request middleware.
const maintenanceFunctionMiddleware = createMiddleware({ type: "function" }).server(async ({ next, serverFnMeta }) => {
  if (MAINTENANCE_PUBLIC_FUNCTIONS.includes(serverFnMeta.name)) return next();
  const { getRequestHeader } = await import("@tanstack/react-start/server");
  const { readMaintenance, verifiedMaintenanceAdmin } = await import("./lib/maintenance.server");
  const settings = await readMaintenance(false).catch(() => null);
  if (!settings) throw new Error("O sistema está fora do ar no momento. Tente de novo em alguns minutos.");
  if (!settings.enabled) return next();
  const token = getRequestHeader("authorization")?.replace(/^Bearer /, "") || getCookie("bm-maintenance-session");
  if (await verifiedMaintenanceAdmin(token)) return next();
  throw new Error("Site em manutenção.");
});

const maintenanceMiddleware = createMiddleware().server(async ({ next, request, pathname, handlerType }) => {
  if (handlerType === "serverFn") return next();
  if (handlerType === "router" && maintenanceExemptPath(pathname)) return next();
  const { readMaintenance, verifiedMaintenanceAdmin } = await import("./lib/maintenance.server");
  const settings = await readMaintenance(false).catch(() => null);
  if (!settings) {
    // Database down: pages fall back to the emergency copy saved on GitHub; APIs answer 503.
    if (databaseDownTarget(pathname) === "unavailable") return new Response("Sistema fora do ar.", { status: 503, headers: { "Retry-After": "120", "Cache-Control": "no-store" } });
    return new Response(null, { status: 302, headers: { Location: "/emergencia", "Cache-Control": "no-store" } });
  }
  if (!settings.enabled) return next();
  const token = request.headers.get("authorization")?.replace(/^Bearer /, "") || getCookie("bm-maintenance-session");
  if (canEnterMaintenance(settings.enabled, await verifiedMaintenanceAdmin(token))) return next();
  if (pathname.startsWith("/api/")) return new Response("Site em manutenção.", { status: 503, headers: { "Retry-After": "300", "Cache-Control": "no-store" } });
  return new Response(null, { status: 302, headers: { Location: "/manutencao", "Cache-Control": "no-store" } });
});

const errorMiddleware = createMiddleware().server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    console.error(error);
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

// Start installs this automatically when src/start.ts is absent; defining the
// file opts out, so re-add it explicitly to keep server functions protected
// from cross-site requests.
const csrfMiddleware = createCsrfMiddleware({
  filter: (ctx) => ctx.handlerType === "serverFn",
});

export const startInstance = createStart(() => ({
  functionMiddleware: [attachSupabaseAuth, maintenanceFunctionMiddleware],
  requestMiddleware: [errorMiddleware, csrfMiddleware, maintenanceMiddleware],
}));
