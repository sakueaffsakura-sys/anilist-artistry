import { useMemo } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, BookOpenText, RotateCw, Trophy } from "lucide-react";
import { SiteFooter, SiteHeader } from "@/components/SiteHeader";
import { SeriesCard } from "@/components/SeriesCard";
import { HeroCarousel } from "@/components/HeroCarousel";
import { ContinueReading } from "@/components/ContinueReading";
import { FavoritesUpdated } from "@/components/FavoritesUpdated";
import { Releases } from "@/components/Releases";
import { RecentlyUpdated } from "@/components/RecentlyUpdated";
import { HScroll, SectionRow, shelfItem } from "@/components/SectionRow";
import { Button } from "@/components/ui/button";
import { fetchFavorites, fetchHistory, fetchSeries } from "@/lib/queries";
import { useSession } from "@/hooks/useAuth";
import { EventBadges } from "@/components/EventBadges";
import { HomeDiscovery } from "@/components/HomeDiscovery";
import { fetchHomeSections } from "@/lib/home-section-queries";
import { RECENT_UPDATES_LIMIT } from "@/lib/recent-updates";
import { coverUrl, formatChapter } from "@/lib/media";
import { compactNumber } from "@/lib/format";
import { kindLabel } from "@/lib/work-categories";

/** Atalhos da home para o catálogo filtrado (os gêneros mais procurados no site). */
const GENRE_SHORTCUTS = ["Ação", "Fantasia", "Romance", "Artes Marciais", "Murim", "Isekai", "Regressão", "Sistema", "Comédia", "Drama", "Sobrenatural", "Terror", "Escolar", "Aventura"];

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
  const discovery = useQuery({ queryKey: ["home-sections"], queryFn: fetchHomeSections, staleTime: 60_000 });
  const recent = useQuery({
    queryKey: ["series", "created"],
    queryFn: () => fetchSeries({ order: "created_at", limit: 14 }),
  });
  const updated = useQuery({
    queryKey: ["series", "updated"],
    queryFn: () => fetchSeries({ order: "updated_at", limit: RECENT_UPDATES_LIMIT, pinnedFirst: true }),
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
  const catalogFailed = recent.isError || updated.isError || ranking.isError || slider.isError || novels.isError || discovery.isError;

  function retryCatalog() {
    void recent.refetch();
    void updated.refetch();
    void slider.refetch();
    void ranking.refetch();
    void novels.refetch();
    void discovery.refetch();
  }

  return (
    <div className="min-h-screen">
      <SiteHeader />
      {heroLoading ? (
        <section aria-label="Carregando destaques" aria-busy="true" className="home-banner">
          <div className="mx-auto grid max-w-7xl grid-cols-[96px_minmax(0,1fr)] gap-4 px-4 py-5 sm:grid-cols-[150px_minmax(0,1fr)] sm:px-6 md:grid-cols-[190px_minmax(0,1fr)] md:gap-7 md:py-9 lg:px-8">
            <div className="aspect-[2/3] rounded-md bg-surface-2 motion-safe:animate-pulse" />
            <div className="space-y-3" aria-hidden="true">
              <div className="h-3 w-20 rounded bg-surface-2 motion-safe:animate-pulse" />
              <div className="h-7 w-4/5 rounded bg-surface-2 motion-safe:animate-pulse" />
              <div className="h-4 w-2/3 rounded bg-surface-2 motion-safe:animate-pulse" />
              <div className="hidden h-16 w-full rounded bg-surface-2 motion-safe:animate-pulse md:block" />
            </div>
          </div>
        </section>
      ) : <HeroCarousel items={heroItems} favoriteIds={favoriteIds} />}
      <main className="site-content mx-auto min-h-[60vh] max-w-7xl px-4 py-6 sm:px-6 md:py-8 lg:px-8">
        <h1 className="sr-only">Better Mangá — ler mangás, manhwas e comics online</h1>
        {catalogFailed ? (
          <div role="alert" className="mb-8 flex flex-wrap items-center justify-between gap-4 border-y border-border py-5">
            <p className="text-sm text-muted-foreground">Não foi possível carregar algumas obras. Tente novamente.</p>
            <Button variant="outline" onClick={retryCatalog}><RotateCw className="h-4 w-4" />Tentar novamente</Button>
          </div>
        ) : null}
        {empty ? (
          <div className="rounded-lg border border-border bg-surface p-10 text-center">
            <h1 className="font-display text-2xl font-bold">Nenhuma obra publicada ainda</h1>
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

        {updated.isPending ? <LoadingShelf label="Carregando atualizações" /> : null}
        {(updated.data?.length ?? 0) > 0 ? <RecentlyUpdated rows={updated.data ?? []} /> : null}

        {releases.isPending ? <LoadingShelf label="Carregando lançamentos" /> : null}
        {(releases.data?.length ?? 0) > 0 ? <Releases rows={releases.data ?? []} favoriteIds={favoriteIds} /> : null}

        <section aria-labelledby="genre-shortcuts" className="mb-8">
          <div className="mb-2.5 flex items-center justify-between gap-3">
            <h2 id="genre-shortcuts" className="text-[15px] font-bold">Explorar por gênero</h2>
            <Link to="/catalogo" search={{ q: "", kind: "Todos" }} className="see-all">Catálogo <ArrowRight className="h-3.5 w-3.5" /></Link>
          </div>
          <div className="chip-row -mx-4 px-4 sm:mx-0 sm:flex-wrap sm:px-0">
            {GENRE_SHORTCUTS.map((genre) => (
              <Link key={genre} to="/catalogo" search={{ tag: genre }} className="chip">{genre}</Link>
            ))}
          </div>
        </section>

        {discovery.isPending ? <LoadingShelf label="Carregando obras populares" /> : null}
        {discovery.data ? <HomeDiscovery sections={discovery.data} favoriteIds={favoriteIds} /> : null}

        {novels.isPending ? <LoadingShelf label="Carregando novels" /> : null}
        {novels.isSuccess ? (
          <SectionRow icon={<BookOpenText />} title="Novels" count={novels.data.length}
            subtitle="Capítulos em texto, atualizados por último"
            action={<Link to="/catalogo" search={{ kind: "Novel" }} className="see-all">Ver todas <ArrowRight className="h-3.5 w-3.5" /></Link>}>
            {novels.data.length ? <HScroll>
              {novels.data.map((item) => <div key={item.id} className={shelfItem}>
                <SeriesCard slug={item.slug} title={item.title} cover={item.cover_url} rating={item.rating}
                  chapters={item.chapter_count} favorite={favoriteIds.has(item.id)} seriesId={item.id} ageRating={item.age_rating} />
              </div>)}
            </HScroll> : <p className="py-6 text-sm text-muted-foreground">Nenhuma novel publicada ainda.</p>}
          </SectionRow>
        ) : null}

        {ranking.isPending ? <LoadingShelf label="Carregando as mais lidas" /> : null}
        {(ranking.data?.length ?? 0) > 0 ? (
          <SectionRow
            icon={<Trophy />}
            title="Mais lidas"
            subtitle="As 10 obras com mais leituras no Better Mangá"
            action={<Link to="/ranking" className="see-all">Ranking completo <ArrowRight className="h-3.5 w-3.5" /></Link>}
          >
            <ol className="rank-list">
              {(ranking.data ?? []).map((item, index) => {
                const latest = item.chapters[0];
                return (
                  <li key={item.id} className="rank-row max-md:[&:nth-child(n+6)]:hidden" data-rank={index + 1}>
                    <span className="rank-pos" aria-label={`${index + 1}º lugar`}>{index + 1}</span>
                    <Link to="/obra/$slug" params={{ slug: item.slug }} tabIndex={-1} aria-hidden="true">
                      <img src={coverUrl(item.cover_url)} alt="" loading="lazy" decoding="async" />
                    </Link>
                    <div className="min-w-0">
                      <h3 className="line-clamp-2"><Link to="/obra/$slug" params={{ slug: item.slug }}>{item.title}</Link></h3>
                      <p className="card-meta mt-0.5">
                        <span title={`${item.views.toLocaleString("pt-BR")} leituras`}>{compactNumber(item.views)} leituras</span>
                        <span>{kindLabel(item.kind)}</span>
                        {latest ? <span>Cap. {formatChapter(latest.number)}</span> : null}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ol>
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
    <section aria-label={label} aria-busy="true" className="mb-9 overflow-hidden">
      <div aria-hidden="true" className="mb-3 h-5 w-40 rounded bg-surface-2 motion-safe:animate-pulse" />
      <div aria-hidden="true" className="flex gap-3 sm:gap-4">
        {Array.from({ length: 7 }, (_, index) => (
          <div key={index} className={`${shelfItem} space-y-2`}>
            <div className="aspect-[2/3] rounded-md bg-surface-2 motion-safe:animate-pulse" />
            <div className="h-3.5 w-4/5 rounded bg-surface-2 motion-safe:animate-pulse" />
          </div>
        ))}
      </div>
    </section>
  );
}
