import { useSyncExternalStore } from "react";

/** Preferências do visitante guardadas só neste aparelho (rodapé do site). */
export type SitePref = "lite" | "tint";

const KEYS: Record<SitePref, string> = { lite: "bm:modo-leve", tint: "bm:tema-azulado" };
const ATTRS: Record<SitePref, string> = { lite: "data-lite", tint: "data-tint" };
const listeners = new Set<() => void>();

function read(pref: SitePref): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(KEYS[pref]) === "1";
  } catch {
    return false;
  }
}

function apply(pref: SitePref, on: boolean) {
  if (typeof document === "undefined") return;
  if (on) document.documentElement.setAttribute(ATTRS[pref], pref === "tint" ? "blue" : "on");
  else document.documentElement.removeAttribute(ATTRS[pref]);
}

/** Aplica as preferências já salvas na página (chamado uma vez ao abrir o site). */
export function applySitePrefs() {
  (Object.keys(KEYS) as SitePref[]).forEach((pref) => apply(pref, read(pref)));
}

export function setSitePref(pref: SitePref, on: boolean) {
  try {
    if (on) window.localStorage.setItem(KEYS[pref], "1");
    else window.localStorage.removeItem(KEYS[pref]);
  } catch {
    /* sem armazenamento: vale só até recarregar */
  }
  apply(pref, on);
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function useSitePref(pref: SitePref): [boolean, (on: boolean) => void] {
  const value = useSyncExternalStore(subscribe, () => read(pref), () => false);
  return [value, (on) => setSitePref(pref, on)];
}
