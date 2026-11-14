import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Smartphone } from "lucide-react";
import { SiteFooter, SiteHeader } from "@/components/SiteHeader";
import { Button } from "@/components/ui/button";
import { fetchAppRelease, type AppRelease } from "@/lib/app-download";

export const Route = createFileRoute("/app")({
  staticData: { sitemap: true },
  head: () => ({ meta: [
    { title: "App Android — Better Mangá" },
    { name: "description", content: "Baixe o app Better Mangá para Android e leia mangás, manhwas e comics no celular." },
    { property: "og:title", content: "App Android — Better Mangá" },
    { property: "og:description", content: "Baixe o APK oficial do Better Mangá para Android." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: AppPage,
});

function AppPage() {
  const [release, setRelease] = useState<AppRelease | null | undefined>(undefined);
  useEffect(() => { void fetchAppRelease().then(setRelease).catch(() => setRelease(null)); }, []);
  return (
    <>
      <SiteHeader />
      <main className="site-content mx-auto max-w-2xl px-4 py-8">
        <h1 className="flex items-center gap-2 text-2xl font-bold"><Smartphone className="h-6 w-6 text-primary" /> App Android</h1>
        <div className="mt-4 min-h-24 rounded-lg border border-border bg-surface p-4">
          {release === undefined ? <p className="text-sm text-muted-foreground">Carregando…</p>
            : !release ? <p className="text-sm text-muted-foreground">O app chega em breve.</p>
            : <>
                <p className="font-semibold">Versão {release.version_name}</p>
                {release.notes ? <p className="mt-2 whitespace-pre-line text-sm text-muted-foreground">{release.notes}</p> : null}
                <Button asChild className="mt-4"><a href={release.apk_download_url}>Baixar APK</a></Button>
              </>}
        </div>
        <h2 className="mt-6 text-lg font-semibold">Como instalar</h2>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
          <li>Toque em "Baixar APK" e espere o download terminar.</li>
          <li>Abra o arquivo baixado.</li>
          <li>Se o celular pedir, permita instalar apps desta fonte ("fontes desconhecidas").</li>
          <li>Toque em Instalar e abra o Better Mangá.</li>
        </ol>
      </main>
      <SiteFooter />
    </>
  );
}
