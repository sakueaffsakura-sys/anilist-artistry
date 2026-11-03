import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

/** Called every minute by the scheduler: publishes at most one chapter of the work at the head of the queue. */
export const Route = createFileRoute("/api/public/jobs/mediocre-queue")({
  staticData: { sitemap: false },
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authFailure = await authenticateCronRequest(request);
        if (authFailure) return authFailure;
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { processQueueTick } = await import("@/lib/mediocre-queue.server");
        const out = await processQueueTick(supabaseAdmin);
        return Response.json({ success: true, ...out });
      },
    },
  },
});
