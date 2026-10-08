import { useMemo } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { BookOpenText, RotateCw, Trophy } from "lucide-react";
import { SiteFooter, SiteHeader } from "@/components/SiteHeader";
import { SeriesCard } from "@/components/SeriesCard";
import { HeroCarousel } from "@/components/HeroCarousel";
import { ContinueReading } from "@/components/ContinueReading";
import { FavoritesUpdated } from "@/components/FavoritesUpdated";
import { Releases } from "@/components/Releases";
import { RecentlyUpdated } from "@/components/RecentlyUpdated";
import { HScroll, SectionRow } from "@/components/SectionRow";
import { Button } from "@/components/ui/button";
import { fetchFavorites, fetchHistory, fetchSeries } from "@/lib/queries";
import { useSession } from "@/hooks/useAuth";
import { EventBadges } from "@/components/EventBadges";

export const Route = createFileRoute("/")({
  staticData: { sitemap: true },
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
  const recent = useQuery({
    queryKey: ["series", "created"],
    queryFn: () => fetchSeries({ order: "created_at", limit: 14 }),
  });
  const updated = useQuery({
    queryKey: ["series", "updated"],
    queryFn: () => fetchSeries({ order: "updated_at", limit: 10, pinnedFirst: true }),
  });
  const releases = recent;
  const slider = useQuery({
    queryKey: ["series", "slider"],
    queryFn: () => fetchSeries({ order: "updated_at", limit: 100, inSlider: true }),
    staleTime: 30_000,
  });
  const novels = useQuery({
    queryKey: ["series", "novels", "updated"],
    queryFn: () => fetchSeries({ kind: "Novel", order: "updated_at", limit: 12 }),
    staleTime: 30_000,
  });
  const ranking = useQuery({
    queryKey: ["series", "views"],
    queryFn: () => fetchSeries({ order: "views", limit: 10 }),
  });
  const favorites = useQuery({
    queryKey: ["favorites", user?.id],
    enabled: Boolean(user),
    queryFn: () => user ? fetchFavorites(user.id) : Promise.resolve([]),
  });
  const favoriteIds = useMemo(() => new Set((favorites.data ?? []).map((item) => item.id)), [favorites.data]);
  const history = useQuery({
    queryKey: ["history", user?.id],
    enabled: Boolean(user),
    queryFn: () => user ? fetchHistory(user.id) : Promise.resolve([]),
  });

  const empty =
    recent.isSuccess && updated.isSuccess &&
    (recent.data?.length ?? 0) === 0 &&
    (updated.data?.length ?? 0) === 0;

  const heroItems = slider.data ?? [];
  const heroLoading = slider.isPending;
  const catalogFailed = recent.isError || updated.isError || ranking.isError || slider.isError || novels.isError;

  function retryCatalog() {
    void recent.refetch();
    void updated.refetch();
    void slider.refetch();
    void ranking.refetch();
    void novels.refetch();
  }

  return (
    <div className="min-h-screen">
      <SiteHeader />
      {heroLoading ? (
        <section aria-label="Carregando destaques" aria-busy="true" className="pb-6 md:pb-8">
          <div className="hero-model-layout mx-auto grid max-w-[1400px] grid-cols-[110px_minmax(0,1fr)] items-start gap-5 px-4 py-7 md:grid-cols-[220px_minmax(0,1fr)] md:items-center md:gap-10 md:px-10 md:py-12 lg:grid-cols-[250px_minmax(0,1fr)] lg:gap-12">
            <div className="aspect-[2/3] rounded-lg bg-muted motion-safe:animate-pulse" />
            <div className="space-y-5" aria-hidden="true">
              <div className="h-4 w-24 rounded bg-muted motion-safe:animate-pulse" />
              <div className="h-9 w-4/5 rounded bg-muted motion-safe:animate-pulse" />
              <div className="h-6 w-2/3 rounded bg-muted motion-safe:animate-pulse" />
              <div className="hidden h-20 w-full rounded bg-muted motion-safe:animate-pulse md:block" />
              <div className="h-12 w-3/4 rounded-full bg-muted motion-safe:animate-pulse" />
            </div>
          </div>
        </section>
      ) : <HeroCarousel items={heroItems} favoriteIds={favoriteIds} />}
      <main className="mx-auto min-h-[60vh] max-w-7xl px-4 py-8">
        <h1 className="sr-only">Better Mangá — ler mangás, manhwas e comics online</h1>
        {catalogFailed ? (
          <div role="alert" className="mb-8 flex flex-wrap items-center justify-between gap-4 border-y border-border py-5">
            <p className="text-sm text-muted-foreground">Não foi possível carregar algumas obras. Tente novamente.</p>
            <Button variant="outline" onClick={retryCatalog}><RotateCw className="h-4 w-4" />Tentar novamente</Button>
          </div>
        ) : null}
        {empty ? (
          <div className="rounded-2xl border border-border bg-surface p-10 text-center">
            <h1 className="font-display text-2xl font-extrabold">Nenhuma obra publicada ainda</h1>
            <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
              Entre com sua conta, abra o painel e publique a primeira obra buscando os dados
              automaticamente no AniList.
            </p>
            <Button asChild className="mt-6 rounded-full font-semibold">
              <Link to="/admin">Abrir o painel</Link>
            </Button>
          </div>
        ) : null}

        {user && (history.data?.length ?? 0) > 0 ? (
          <ContinueReading rows={history.data ?? []} userId={user.id} />
        ) : null}

        {user && (favorites.data?.length ?? 0) > 0 ? (
          <FavoritesUpdated rows={favorites.data ?? []} />
        ) : null}

        {releases.isPending ? <LoadingShelf label="Carregando lançamentos" /> : null}
        {(releases.data?.length ?? 0) > 0 ? <Releases rows={releases.data ?? []} /> : null}

        {updated.isPending ? <LoadingShelf label="Carregando atualizações" /> : null}
        {(updated.data?.length ?? 0) > 0 ? <RecentlyUpdated rows={updated.data ?? []} /> : null}

        {novels.isPending ? <LoadingShelf label="Carregando novels" /> : null}
        {novels.isSuccess ? (
          <SectionRow icon={<BookOpenText className="h-5 w-5" />} title="Novels"
            subtitle="Últimos capítulos em texto"
            action={<Button asChild variant="ghost" size="sm" className="text-primary"><Link to="/catalogo" search={{ kind: "Novel" }}>Ver todas</Link></Button>}>
            {novels.data.length ? <HScroll>
              {novels.data.map((item) => <div key={item.id} className="w-[160px] shrink-0">
                <SeriesCard slug={item.slug} title={item.title} cover={item.cover_url} rating={item.rating}
                  favorite={favoriteIds.has(item.id)} seriesId={item.id} />
              </div>)}
            </HScroll> : <p className="py-6 text-sm text-muted-foreground">Nenhuma novel publicada ainda.</p>}
          </SectionRow>
        ) : null}

        {ranking.isPending ? <LoadingShelf label="Carregando ranking" /> : null}
        {(ranking.data?.length ?? 0) > 0 ? (
          <SectionRow
            icon={<Trophy className="h-5 w-5" />}
            title="Rankings"
            subtitle="Mais lidas do site"
            action={
              <Button asChild variant="ghost" size="sm" className="text-primary">
                <Link to="/ranking">Ver todos</Link>
              </Button>
            }
          >
            <HScroll>
              {(ranking.data ?? []).map((item, index) => (
                <div key={item.id} className="w-[150px] shrink-0">
                  <div className="flex items-start gap-1">
                    <span className="font-display text-2xl font-black text-primary">
                      {index + 1}
                    </span>
                    <div className="flex-1">
                      <SeriesCard
                        slug={item.slug}
                        title={item.title}
                        cover={item.cover_url}
                        rating={item.rating}
                        favorite={favoriteIds.has(item.id)}
                        seriesId={item.id}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </HScroll>
          </SectionRow>
        ) : null}
        <EventBadges />

      </main>
      <SiteFooter />
    </div>
  );
}

function LoadingShelf({ label }: { label: string }) {
  return (
    <section aria-label={label} aria-busy="true" className="overflow-hidden pb-8">
      <div aria-hidden="true" className="mb-5 h-7 w-48 rounded bg-muted motion-safe:animate-pulse" />
      <div aria-hidden="true" className="flex gap-4 sm:gap-6">
        {Array.from({ length: 7 }, (_, index) => (
          <div key={index} className="w-[160px] shrink-0 space-y-3">
            <div className="aspect-[2/3] rounded-lg bg-muted motion-safe:animate-pulse" />
            <div className="h-4 w-4/5 rounded bg-muted motion-safe:animate-pulse" />
          </div>
        ))}
      </div>
    </section>
  );
}
