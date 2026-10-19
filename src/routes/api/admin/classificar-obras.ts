import { createFileRoute } from "@tanstack/react-router";
export const Route = createFileRoute("/api/admin/classificar-obras")({
 staticData: { sitemap: false },
 server: { handlers: { POST: async ({ request }) => {
  const { handleWorkClassification } = await import("@/lib/ai/work-classification.server");
  return handleWorkClassification(request);
 } } },
});
