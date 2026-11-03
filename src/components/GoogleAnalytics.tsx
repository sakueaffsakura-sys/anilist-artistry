import { useEffect, useState } from "react";
import { useRouterState } from "@tanstack/react-router";
import { getAnalyticsId } from "@/lib/analytics.functions";

declare global {
  interface Window { dataLayer?: unknown[]; gtag?: (...args: unknown[]) => void }
}

const tracked = (path: string) => !path.startsWith("/admin");

export function GoogleAnalytics() {
  const [id, setId] = useState<string | null>(null);
  const path = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    let alive = true;
    getAnalyticsId().then((r) => { if (alive) setId(r.id); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!id || window.gtag) return;
    const script = document.createElement("script");
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${id}`;
    document.head.appendChild(script);
    window.dataLayer = window.dataLayer || [];
    window.gtag = function gtag() {
      // eslint-disable-next-line prefer-rest-params -- gtag.js needs the Arguments object
      window.dataLayer!.push(arguments);
    };
    window.gtag("set", "developer_id.dZjgwMW", true);
    window.gtag("js", new Date());
    window.gtag("config", id, { send_page_view: false });
  }, [id]);

  useEffect(() => {
    if (!id || !window.gtag || !tracked(path)) return;
    window.gtag("event", "page_view", { page_path: path, page_location: window.location.href, page_title: document.title });
  }, [id, path]);

  return null;
}
