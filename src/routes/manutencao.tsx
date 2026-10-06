import { createFileRoute } from "@tanstack/react-router";
import { MaintenanceScreen } from "@/components/MaintenanceScreen";
import { getMaintenanceStatus, verifyMaintenanceAdmin } from "@/lib/maintenance.functions";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/manutencao")({
  staticData: { sitemap: false },
  loader: () => getMaintenanceStatus(),
  head: () => ({ meta: [
    { title: "Em manutenção — Better Mangá" }, { name: "description", content: "O Better Mangá está recebendo melhorias. Voltamos em breve." },
    { property: "og:title", content: "Em manutenção — Better Mangá" }, { property: "og:description", content: "O próximo capítulo do Better Mangá está chegando." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }, { name: "robots", content: "noindex" },
  ] }),
  component: MaintenancePage,
});
function MaintenancePage() {
  const initial = Route.useLoaderData();
  const [settings, setSettings] = useState(initial);
  const verify = useServerFn(verifyMaintenanceAdmin);
  useEffect(() => {
    let cancelled = false;
    void supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) return;
      const result = await verify();
      if (result.isAdmin && !cancelled && settings.enabled) window.location.replace("/");
    }).catch(() => undefined);
    const interval = setInterval(() => { void getMaintenanceStatus().then((s) => { if (!s.enabled && initial.enabled) window.location.replace("/"); else setSettings(s); }).catch(() => undefined); }, 30000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [verify, initial.enabled]);
  return <MaintenanceScreen settings={settings} />;
}