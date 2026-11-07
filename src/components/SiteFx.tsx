import { useRouterState } from "@tanstack/react-router";

/** Barra fina de carregamento entre páginas do site (o painel tem a sua). */
export function SiteFx() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const pending = useRouterState({ select: (s) => s.status === "pending" });
  if (path.startsWith("/admin")) return null;
  return <div className="site-route-bar" data-active={pending ? "true" : "false"} aria-hidden />;
}
