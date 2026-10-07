import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

// After a new deploy, old chunk files disappear. Reload once to fetch the fresh build.
if (typeof window !== "undefined" && !(window as { __chunkReloadHooked?: boolean }).__chunkReloadHooked) {
  (window as { __chunkReloadHooked?: boolean }).__chunkReloadHooked = true;
  const KEY = "bm-chunk-reload";
  const reloadOnce = () => {
    const last = Number(sessionStorage.getItem(KEY) || 0);
    if (Date.now() - last < 10_000) return;
    sessionStorage.setItem(KEY, String(Date.now()));
    window.location.reload();
  };
  window.addEventListener("vite:preloadError", (e) => {
    e.preventDefault();
    reloadOnce();
  });
  window.addEventListener("unhandledrejection", (e) => {
    const msg = String((e.reason as Error)?.message ?? e.reason ?? "");
    if (/Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i.test(msg)) {
      reloadOnce();
    }
  });
}

export const getRouter = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60_000,
        gcTime: 10 * 60_000,
        refetchOnWindowFocus: false,
        retry: 1,
      },
    },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreload: "intent",
    defaultPreloadStaleTime: 0,
  });

  return router;
};
