// Regra de quando oferecer o APK ao visitante (módulo seguro para o navegador).
export const APP_PROMPT_KEY = "bm-app-prompt-dismissed";
export const APP_PROMPT_SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;

export function shouldOfferApp(opts: { userAgent: string; path: string; inApp: boolean; dismissedAt: number | null; now: number }) {
  if (opts.inApp || !/android/i.test(opts.userAgent) || /; wv\)/i.test(opts.userAgent)) return false;
  if (/^\/(app|manutencao|emergencia|admin|auth)(\/|$)/.test(opts.path)) return false;
  return opts.dismissedAt === null || opts.now - opts.dismissedAt >= APP_PROMPT_SNOOZE_MS;
}

export type AppRelease = { version_name: string; apk_download_url: string; notes: string };
export async function fetchAppRelease(): Promise<AppRelease | null> {
  const res = await fetch("/api/public/version?site=1", { cache: "no-store", credentials: "omit" });
  if (!res.ok) return null;
  const d = (await res.json()) as Partial<AppRelease>;
  return d.apk_download_url ? { version_name: d.version_name ?? "", apk_download_url: d.apk_download_url, notes: d.notes ?? "" } : null;
}
