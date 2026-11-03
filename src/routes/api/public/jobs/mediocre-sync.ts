import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

export const Route = createFileRoute("/api/public/jobs/mediocre-sync")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authFailure = await authenticateCronRequest(request);
        if (authFailure) return authFailure;
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { syncMediocreChapters } = await import("@/lib/mediocre-import.server");
        const out = await syncMediocreChapters(supabaseAdmin, 3);
        return Response.json({ success: true, ...out });
      },
    },
  },
});
