import { useMemo } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { fallback, zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";
import { RotateCw } from "lucide-react";
import { SiteFooter, SiteHeader } from "@/components/SiteHeader";
import { FormatTabs, HOME_FORMATS } from "@/components/FormatTabs";
import { HeroCarousel } from "@/components/HeroCarousel";
import { ContinueReading } from "@/components/ContinueReading";
import { FavoritesUpdated } from "@/components/FavoritesUpdated";
import { Releases } from "@/components/Releases";
import { RecentlyUpdated } from "@/components/RecentlyUpdated";
import { HotThisWeek } from "@/components/HotThisWeek";
import { Button } from "@/components/ui/button";
import { EventBadges } from "@/components/EventBadges";
import { fetchFavorites, fetchHistory, fetchSeries } from "@/lib/queries";
import { useSession } from "@/hooks/useAuth";
import { RECENT_UPDATES_LIMIT } from "@/lib/recent-updates";

/** Quantas obras entram no carrossel de destaques (a fila lateral mostra 5 por vez). */
const HERO_LIMIT = 15;

const searchSchema = z.object({
  formato: fallback(z.enum(HOME_FORMATS), "Comic").default("Comic"),
});

export const Route = createFileRoute("/")({
  staticData: { sitemap: true },
  validateSearch: zodValidator(searchSchema),
  head: () => ({
    meta: [
      { title: "Better Mangá — mangás, manhwas e comics atualizados" },
      {
        name: "description",
        content:
          "Leia mangás, manhwas, manhuas e comics em português. Capítulos novos todos os dias, favoritos e histórico de leitura.",
      },
      { property: "og:title", content: "Better Mangá — leitura online" },
      {
        property: "og:description",
        content: "Catálogo de mangás, manhwas e comics com capítulos atualizados.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://bettermanga.net/" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: "https://bettermanga.net/" }],
  }),
  component: Home,
});

function Home() {
  const { user } = useSession();
  const { formato: kind } = Route.useSearch();
  const updated = useQuery({
    queryKey: ["series", "updated", kind],
    queryFn: () => fetchSeries({ kind, order: "updated_at", limit: RECENT_UPDATES_LIMIT, pinnedFirst: true }),
  });
  const releases = useQuery({
    queryKey: ["series", "created", kind],
    queryFn: () => fetchSeries({ kind, order: "created_at", limit: 8 }),
  });
  const slider = useQuery({
    queryKey: ["series", "slider", kind],
    queryFn: () => fetchSeries({ kind, order: "updated_at", limit: HERO_LIMIT, inSlider: true }),
    staleTime: 30_000,
  });
  const favorites = useQuery({
    queryKey: ["favorites", user?.id],
    enabled: Boolean(user),
    queryFn: () => user ? fetchFavorites(user.id) : Promise.resolve([]),
  });
  const history = useQuery({
    queryKey: ["history", user?.id],
    enabled: Boolean(user),
    queryFn: () => user ? fetchHistory(user.id) : Promise.resolve([]),
  });

  const empty = updated.isSuccess && releases.isSuccess && (updated.data?.length ?? 0) === 0 && (releases.data?.length ?? 0) === 0;
  // As prateleiras entram juntas quando o primeiro lote chega, para o conteúdo não pular durante o carregamento.
  const shelvesPending = updated.isPending || releases.isPending;
  // Na conta logada, "Continue lendo" e favoritas entram junto com as prateleiras (antes surgiam depois e empurravam a página).
  const personalPending = Boolean(user) && (history.isPending || favorites.isPending);
  const heroItems = useMemo(() => slider.data ?? [], [slider.data]);
  const catalogFailed = updated.isError || releases.isError || slider.isError;

  function retryCatalog() {
    void updated.refetch();
    void releases.refetch();
    void slider.refetch();
  }

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <FormatTabs active={kind} />
      {slider.isPending ? (
        <section aria-label="Carregando destaques" aria-busy="true" className="home-hero">
          <div className="home-hero-inner" style={{ minHeight: 445 }}>
            <div className="home-hero-main" aria-hidden="true">
              <div className="home-hero-cover motion-safe:animate-pulse" />
              <div className="home-hero-info space-y-3">
                <div className="h-3 w-24 rounded bg-surface-2 motion-safe:animate-pulse" />
                <div className="h-9 w-3/4 rounded bg-surface-2 motion-safe:animate-pulse" />
                <div className="h-4 w-2/3 rounded bg-surface-2 motion-safe:animate-pulse" />
              </div>
            </div>
          </div>
        </section>
      ) : <HeroCarousel items={heroItems} />}
      <main className="home-main">
        <h1 className="sr-only">Better Mangá — ler mangás, manhwas e comics online</h1>
        {catalogFailed ? (
          <div role="alert" className="mb-8 flex flex-wrap items-center justify-between gap-4 border-y border-border py-5">
            <p className="text-sm text-muted-foreground">Não foi possível carregar algumas obras. Tente novamente.</p>
            <Button variant="outline" onClick={retryCatalog}><RotateCw className="h-4 w-4" />Tentar novamente</Button>
          </div>
        ) : null}
        {empty ? (
          <div className="home-section rounded-lg border border-border bg-surface p-10 text-center">
            <h2 className="text-xl font-bold">Nenhuma obra em {kind} por enquanto</h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
              Escolha outro formato nas abas acima ou procure no catálogo.
            </p>
            <Button asChild className="mt-6 rounded-full font-semibold">
              <Link to="/catalogo" search={{ q: "", kind: "Todos" }}>Abrir o catálogo</Link>
            </Button>
          </div>
        ) : null}

        {shelvesPending || personalPending ? <HomeLoading /> : <>
          {user && (history.data?.length ?? 0) > 0 ? <ContinueReading rows={history.data ?? []} userId={user.id} /> : null}
          {user && (favorites.data?.length ?? 0) > 0 ? <FavoritesUpdated rows={favorites.data ?? []} /> : null}
          {(releases.data?.length ?? 0) > 0 ? <Releases rows={releases.data ?? []} kind={kind} /> : null}
          {(updated.data?.length ?? 0) > 0 ? <RecentlyUpdated rows={updated.data ?? []} kind={kind} /> : null}
          <HotThisWeek />
        </>}
        <EventBadges />
      </main>
      <SiteFooter />
    </div>
  );
}

function HomeLoading() {
  return (
    <div aria-busy="true" aria-label="Carregando obras" className="min-h-[160vh]">
      <LoadingShelf />
      <LoadingShelf />
      <LoadingShelf />
    </div>
  );
}

function LoadingShelf() {
  return (
    <section aria-hidden="true" className="home-section overflow-hidden">
      <div aria-hidden="true" className="mb-4 h-6 w-40 rounded bg-surface-2 motion-safe:animate-pulse" />
      <div aria-hidden="true" className="flex gap-4">
        {Array.from({ length: 7 }, (_, index) => (
          <div key={index} className="w-[148px] shrink-0 space-y-2">
            <div className="aspect-[2/3] rounded-xl bg-surface-2 motion-safe:animate-pulse" />
            <div className="h-3.5 w-4/5 rounded bg-surface-2 motion-safe:animate-pulse" />
          </div>
        ))}
      </div>
    </section>
  );
}
