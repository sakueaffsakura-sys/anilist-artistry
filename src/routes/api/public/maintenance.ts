import { createFileRoute } from "@tanstack/react-router";
import { maintenanceStatusSchema } from "@/lib/maintenance-status";

export const Route = createFileRoute("/api/public/maintenance")({
  staticData: { sitemap: false },
  server: { handlers: { GET: async () => {
    const { readMaintenance } = await import("@/lib/maintenance.server");
    // Project only the public notice, not storage paths or roles.
    const status = maintenanceStatusSchema.parse(await readMaintenance());
    return Response.json(status, { headers: { "Cache-Control": "no-store" } });
  } } },
});