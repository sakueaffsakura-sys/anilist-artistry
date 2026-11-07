import { useRouterState } from "@tanstack/react-router";

/** Route progress bar for public pages. No background layers or pointer listeners. */
export function SiteFx() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const pending = useRouterState({ select: (s) => s.status === "pending" });
  if (path.startsWith("/admin")) return null;
  return <div className="site-route-bar" data-active={pending ? "true" : "false"} aria-hidden />;
}
