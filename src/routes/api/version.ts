import { json } from "@tanstack/react-start";
import { createAPIFileRoute } from "@tanstack/react-start/api";
import { getAppVersion } from "@/lib/maintenance.server";

export const Route = createAPIFileRoute("/api/version")({
  GET: async ({ request }) => {
    try {
      const versionInfo = await getAppVersion();
      return json(versionInfo);
    } catch (error) {
      console.error("Error fetching version info:", error);
      return new Response("Internal Server Error", { status: 500 });
    }
  },
});
