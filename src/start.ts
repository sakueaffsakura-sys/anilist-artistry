import { createStart, createCsrfMiddleware, createMiddleware } from "@tanstack/react-start";

import { renderErrorPage } from "./lib/error-page";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";
import { MAINTENANCE_PUBLIC_FUNCTIONS, maintenanceExemptPath } from "@/lib/maintenance-policy";
import { getCookie } from "@tanstack/react-start/server";

const maintenanceMiddleware = createMiddleware().server(async ({ next, request, pathname, handlerType, serverFnMeta }) => {
  if (handlerType === "serverFn" && MAINTENANCE_PUBLIC_FUNCTIONS.includes(serverFnMeta?.name ?? "")) return next();
  if (handlerType === "router" && maintenanceExemptPath(pathname)) return next();
  const { readMaintenance, verifiedMaintenanceAdmin } = await import("./lib/maintenance.server");
  const settings = await readMaintenance();
  if (!settings.enabled) return next();
  const token = request.headers.get("authorization")?.replace(/^Bearer /, "") || getCookie("bm-maintenance-session");
  if (await verifiedMaintenanceAdmin(token)) return next();
  if (handlerType === "serverFn" || pathname.startsWith("/api/")) return new Response("Site em manutenção.", { status: 503, headers: { "Retry-After": "300", "Cache-Control": "no-store" } });
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
  functionMiddleware: [attachSupabaseAuth],
  requestMiddleware: [errorMiddleware, csrfMiddleware, maintenanceMiddleware],
}));
