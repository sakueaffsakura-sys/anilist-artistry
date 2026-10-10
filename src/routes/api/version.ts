import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/version")({
  server: { handlers: { GET: async ({ request }) => {
    const { appVersionResponse } = await import("@/lib/app-version.server");
    return appVersionResponse(request);
  } } },
});
