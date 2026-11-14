import { useEffect, useState } from "react";
import { useRouterState } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { APP_PROMPT_KEY, fetchAppRelease, shouldOfferApp, type AppRelease } from "@/lib/app-download";

/** Aviso no celular Android oferecendo o APK publicado no painel. */
export function AppDownloadPrompt() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const [release, setRelease] = useState<AppRelease | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const raw = Number(localStorage.getItem(APP_PROMPT_KEY));
    const inApp = Boolean((window as { Capacitor?: unknown }).Capacitor);
    if (!shouldOfferApp({ userAgent: navigator.userAgent, path, inApp, dismissedAt: raw > 0 ? raw : null, now: Date.now() })) { setOpen(false); return; }
    let alive = true;
    void fetchAppRelease().then((r) => { if (alive && r) { setRelease(r); setOpen(true); } }).catch(() => undefined);
    return () => { alive = false; };
  }, [path]);

  if (!open || !release) return null;
  const close = () => { localStorage.setItem(APP_PROMPT_KEY, String(Date.now())); setOpen(false); };
  return (
    <div role="dialog" aria-label="Baixar o app" className="fixed inset-x-3 bottom-20 z-50 rounded-lg border border-border bg-surface p-3 shadow-lg">
      <p className="text-sm font-semibold">Baixe o app Better Mangá{release.version_name ? ` — versão ${release.version_name}` : ""}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">Leia mais rápido direto no celular.</p>
      <div className="mt-3 flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={close}>Agora não</Button>
        <Button size="sm" asChild><a href={release.apk_download_url} onClick={close}>Baixar</a></Button>
      </div>
    </div>
  );
}
