import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

const STALE_CHUNK = /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|reading 'component'|is not a valid JavaScript MIME type/i;

/** Reloads at most once every 10 s when an old page asks for files a newer deploy removed. */
function reloadForStaleChunk(err: unknown): void {
  if (typeof window === "undefined") return;
  const msg = String((err as Error)?.message ?? err ?? "");
  if (!STALE_CHUNK.test(msg)) return;
  const KEY = "bm-chunk-reload";
  const last = Number(sessionStorage.getItem(KEY) || 0);
  if (Date.now() - last < 10_000) return;
  sessionStorage.setItem(KEY, String(Date.now()));
  window.location.reload();
}

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
    reloadForStaleChunk(e.reason);
  });
}

export const getRouter = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 5 * 60_000,
        gcTime: 15 * 60_000,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        retry: 1,
      },
    },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreload: "intent",
    defaultPreloadDelay: 80,
    defaultPreloadStaleTime: 30_000,
    defaultStaleTime: 30_000,
    // Route chunk from an older deploy failed to load: fetch the fresh build instead of a blank page.
    defaultOnCatch: (err) => reloadForStaleChunk(err),
  });

  return router;
};
