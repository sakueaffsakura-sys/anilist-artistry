import { useEffect } from "react";
import { useRouterState } from "@tanstack/react-router";
import { applySitePrefs } from "@/lib/site-prefs";

/** Barra fina de carregamento entre páginas do site (o painel tem a sua) e aplicação das preferências do rodapé. */
export function SiteFx() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const pending = useRouterState({ select: (s) => s.status === "pending" });
  useEffect(() => { applySitePrefs(); }, []);
  if (path.startsWith("/admin")) return null;
  return <div className="site-route-bar" data-active={pending ? "true" : "false"} aria-hidden />;
}
