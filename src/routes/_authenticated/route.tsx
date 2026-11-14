import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated")({
  staticData: { sitemap: "exclude-subtree" },
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    // Auth not answering at all (status 0 / 5xx) means the system is down: read from the emergency copy.
    const status = (error as { status?: number } | null)?.status ?? 401;
    if (error && (status === 0 || status >= 500)) throw redirect({ to: "/emergencia" });
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: () => <Outlet />,
});
