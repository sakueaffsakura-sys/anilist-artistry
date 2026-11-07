import { useEffect } from "react";
import { useRouterState } from "@tanstack/react-router";

const GLOW = ".series-cover, .site-card-glow";

/** Decorative layers + route progress bar for public pages. One delegated listener, no re-renders. */
export function SiteFx() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const pending = useRouterState({ select: (s) => s.status === "pending" });
  const admin = path.startsWith("/admin");

  useEffect(() => {
    if (admin) return;
    const onMove = (e: PointerEvent) => {
      const el = (e.target as Element | null)?.closest?.<HTMLElement>(GLOW);
      if (!el) return;
      const r = el.getBoundingClientRect();
      el.style.setProperty("--mx", `${e.clientX - r.left}px`);
      el.style.setProperty("--my", `${e.clientY - r.top}px`);
    };
    document.addEventListener("pointermove", onMove, { passive: true });
    return () => document.removeEventListener("pointermove", onMove);
  }, [admin]);

  if (admin) return null;
  return (
    <>
      <div className="site-route-bar" data-active={pending ? "true" : "false"} aria-hidden />
      <div className="site-ambient" aria-hidden><span /><span /></div>
    </>
  );
}
