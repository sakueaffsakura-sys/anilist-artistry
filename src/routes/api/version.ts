import { createFileRoute } from "@tanstack/react-router";
import { getAppVersion } from "@/lib/maintenance.server";

export const Route = createFileRoute("/api/version")({
  server: { handlers: { GET: async () => {
    try {
      const versionInfo = await getAppVersion();
      return Response.json(versionInfo, { headers: { "Cache-Control": "no-store" } });
    } catch (error) {
      console.error("Error fetching version info:", error);
      return new Response("Internal Server Error", { status: 500 });
    }
  } } },
});
