import { useEffect, useState } from "react";
import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useGenres } from "@/hooks/use-genres";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import { BookOpen, Compass, LayoutGrid, List as ListIcon, Search, SlidersHorizontal, Star, User2, X } from "lucide-react";
import { SiteFooter, SiteHeader } from "@/components/SiteHeader";
import { FORMATS, PageTitle } from "@/components/LibraryBits";
import { SeriesCard } from "@/components/SeriesCard";
import { compactNumber, formatRating } from "@/lib/format";
import { kindLabel, kindValues } from "@/lib/work-categories";
import { supabase } from "@/integrations/supabase/client";
import { coverUrl, timeAgo } from "@/lib/media";
import { Pager } from "@/components/Pager";
import { Button } from "@/components/ui/button";
import { GENRES, genreAliases, normalizeGenres } from "@/lib/work-genres";
import { allowedAgeRatings, hasProfileChosen, useActiveProfile } from "@/lib/active-profile";
import { AgeRatingBadge } from "@/components/AgeRatingBadge";

const searchSchema = z.object({
  q: fallback(z.string(), "").default(""),
  kind: fallback(z.string(), "Todos").default("Todos"),
  sort: fallback(z.string(), "recent").default("recent"),
  status: fallback(z.string(), "").default(""),
  tag: fallback(z.string(), "").default(""),
  view: fallback(z.string(), "grade").default("grade"),
  page: fallback(z.number(), 1).default(1),
});

const SUGGESTIONS = ["Ação", "Fantasia", "Romance", "Artes Marciais", "Isekai", "Regressão", "Comédia", "Terror"];

/** Destaca no título o trecho buscado. */
function Highlight({ text, term }: { text: string; term: string }) {
  const t = term.trim();
  if (!t || t.startsWith("@")) return <>{text}</>;
  const i = text.toLocaleLowerCase("pt-BR").indexOf(t.toLocaleLowerCase("pt-BR"));
  if (i < 0) return <>{text}</>;
  return <>{text.slice(0, i)}<mark className="search-hit">{text.slice(i, i + t.length)}</mark>{text.slice(i + t.length)}</>;
}

export const Route = createFileRoute("/_authenticated/catalogo")({
  staticData: { sitemap: false },
  beforeLoad: ({ context }) => {
    if (!context.user || !hasProfileChosen(context.user.id)) throw redirect({ to: "/perfis" });
  },
  validateSearch: zodValidator(searchSchema),
  head: () => ({
    meta: [
      { title: "Pesquisar — Better Mangá" },
      { name: "description", content: "Descubra obras por nome, gênero e filtros, ou encontre leitores pelo @nick." },
      { property: "og:title", content: "Pesquisar — Better Mangá" },
      { property: "og:description", content: "Busque mangás, manhwas e comics com filtros." },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://bettermanga.net/catalogo" },
      { name: "twitter:card", content: "summary" },
    ],
    links: [{ rel: "canonical", href: "https://bettermanga.net/catalogo" }],
  }),
  component: Pesquisar,
});

const PER_PAGE = 24;
const SORTS = [
  { key: "recent", label: "Atualizadas" },
  { key: "novas", label: "Recém-chegadas" },
  { key: "popular", label: "Mais lidas" },
  { key: "alpha", label: "A–Z" },
];
const STATUS = ["Em andamento", "Finalizado", "Hiato", "Cancelado"];
const STATUS_DB: Record<string, string[]> = {
  "Em andamento": ["Em andamento", "Em lançamento", "RELEASING", "Lançando"],
  "Em lançamento": ["Em andamento", "Em lançamento", "RELEASING", "Lançando"],
  Finalizado: ["Finalizado", "Completo", "FINISHED"],
  Hiato: ["Hiato", "HIATUS"],
  Cancelado: ["Cancelado", "CANCELLED"],
};

function Pesquisar() {
  const s = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const [term, setTerm] = useState(s.q);
  const [genreSearch, setGenreSearch] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const profile = useActiveProfile();
  useEffect(() => setTerm(s.q), [s.q]);
  useEffect(() => {
    const t = setTimeout(() => {
      if (term !== s.q) navigate({ to: ".", search: (p) => ({ ...p, q: term, page: 1 }) });
    }, 350);
    return () => clearTimeout(t);
  }, [term]);

  const set = (patch: Partial<typeof s>) =>
    navigate({ to: ".", search: (p) => ({ ...p, page: 1, ...patch }) });

  const isUser = s.q.startsWith("@");

  const tags = useGenres();

  const results = useQuery({
    queryKey: ["search", profile.id, profile.kidsMaxAge, s],
    enabled: !isUser,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      let q = supabase
        .from("series")
        .select("id, slug, title, cover_url, kind, status, rating, views, updated_at, synopsis, genres, age_rating, chapters(count)", { count: "exact" })
        .eq("published", true);
      const kidsAges = allowedAgeRatings();
      if (kidsAges) q = q.in("age_rating", kidsAges);
      if (s.q) q = q.ilike("title", `%${s.q}%`);
      if (s.kind !== "Todos") q = q.in("kind", kindValues(s.kind));
      if (s.status) q = q.in("status", STATUS_DB[s.status] ?? [s.status]);
      if (s.tag) q = q.overlaps("genres", genreAliases(s.tag));
      q =
        s.sort === "popular"
          ? q.order("views", { ascending: false })
          : s.sort === "alpha"
            ? q.order("title")
            : s.sort === "novas"
              ? q.order("created_at", { ascending: false })
              : q.order("updated_at", { ascending: false });
      const from = (s.page - 1) * PER_PAGE;
      const { data, count, error } = await q.range(from, from + PER_PAGE - 1);
      if (error) throw error;
      return { rows: data ?? [], count: count ?? 0 };
    },
  });

  const users = useQuery({
    queryKey: ["user-search", s.q],
    enabled: isUser && s.q.length > 1,
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, username, display_name, avatar_url, level")
        .ilike("username", `%${s.q.slice(1)}%`)
        .limit(30);
      return data ?? [];
    },
  });

  const total = results.data?.count ?? 0;
  const pages = Math.max(1, Math.ceil(total / PER_PAGE));
  const shownFrom = total ? (s.page - 1) * PER_PAGE + 1 : 0;
  const shownTo = Math.min(total, s.page * PER_PAGE);
  const listView = s.view === "lista";

  const rows = results.data?.rows ?? [];
  const activeFilters = [
    { value: s.q, label: s.q, patch: { q: "" } },
    { value: s.kind === "Todos" ? "" : s.kind, label: kindLabel(s.kind), patch: { kind: "Todos" } },
    { value: s.status, label: s.status, patch: { status: "" } },
    { value: s.tag, label: s.tag, patch: { tag: "" } },
  ].filter((f) => f.value);
  const clearAll = () => { setTerm(""); set({ q: "", kind: "Todos", sort: "recent", status: "", tag: "" }); };
  const filterLabel = "mb-2 mt-5 text-[13px] font-semibold text-muted-foreground";

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="site-content catalog-layout mx-auto max-w-7xl px-4 py-6 sm:px-6 md:py-8 lg:px-8">
        <PageTitle
          icon={<Compass />}
          title="Catálogo"
          subtitle="Busque pelo nome, filtre por gênero, formato e status, ou encontre leitores pelo @nick."
          right={<Button asChild variant="secondary"><Link to="/biblioteca"><BookOpen className="h-4 w-4" /> Biblioteca</Link></Button>}
        />

        <div className="catalog-search">
          <Search className="h-[18px] w-[18px]" />
          <input
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            aria-label="Buscar obras ou leitores"
            placeholder="Buscar obras ou @leitor…"
            enterKeyHint="search"
          />
          {term ? <button type="button" aria-label="Limpar busca" onClick={() => setTerm("")}><X className="h-4 w-4" /></button> : null}
        </div>
        {!term && !s.tag ? (
          <div className="chip-row mt-3" aria-label="Sugestões de gênero">
            {SUGGESTIONS.map((genre) => <button key={genre} type="button" className="chip chip-sm" onClick={() => set({ tag: genre })}>{genre}</button>)}
          </div>
        ) : null}

        {isUser ? (
          <div className="mt-6 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {(users.data ?? []).map((u) => (
              <Link
                key={u.id}
                to="/u/$username"
                params={{ username: u.username }}
                className="flex items-center gap-3 rounded-lg border border-border bg-surface p-3 hover:border-primary/50"
              >
                <span className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-full bg-surface-2">
                  {u.avatar_url ? <img loading="lazy" decoding="async" src={u.avatar_url} alt="" className="h-full w-full object-cover" /> : <User2 className="h-5 w-5" />}
                </span>
                <span className="min-w-0">
                  <span className="block truncate font-semibold">@{u.username}</span>
                  <span className="text-xs text-muted-foreground">{u.display_name ? `${u.display_name} · ` : ""}nível {u.level}</span>
                </span>
              </Link>
            ))}
            {users.data?.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum leitor encontrado.</p> : null}
          </div>
        ) : (
          <div className="mt-6 grid min-w-0 grid-cols-1 gap-6 lg:grid-cols-[232px_minmax(0,1fr)]">
            <aside className="catalog-filters h-fit min-w-0 lg:sticky lg:top-20 lg:border-r lg:border-border lg:pr-6">
              <Button variant="secondary" className="w-full lg:hidden" aria-expanded={filtersOpen} onClick={() => setFiltersOpen((v) => !v)}>
                <SlidersHorizontal className="h-4 w-4" /> {filtersOpen ? "Fechar filtros" : `Filtros e ordem${activeFilters.length ? ` (${activeFilters.length})` : ""}`}
              </Button>
              <div className={filtersOpen ? "mt-3 block rounded-lg border border-border bg-surface p-3 lg:mt-0 lg:border-0 lg:bg-transparent lg:p-0" : "hidden lg:block"}>
                <div className="flex items-center justify-between">
                  <h2 className="text-[15px] font-bold">Filtros</h2>
                  <Button variant="ghost" size="sm" onClick={clearAll}>Limpar</Button>
                </div>
                <p className={filterLabel}>Ordenar por</p>
                <div className="flex flex-wrap gap-1.5">
                  {SORTS.map((o) => <button key={o.key} type="button" className="chip chip-sm" aria-pressed={s.sort === o.key} onClick={() => set({ sort: o.key })}>{o.label}</button>)}
                </div>
                <p className={filterLabel}>Status</p>
                <div className="flex flex-wrap gap-1.5">
                  {STATUS.map((st) => <button key={st} type="button" className="chip chip-sm" aria-pressed={s.status === st} onClick={() => set({ status: s.status === st ? "" : st })}>{st}</button>)}
                </div>
                <p className={filterLabel}>Gêneros</p>
                <input aria-label="Buscar gênero" placeholder="Buscar gênero…" value={genreSearch} onChange={(e) => setGenreSearch(e.target.value)} className="mb-2 h-9 w-full rounded-md border border-border bg-surface-2 px-3 text-[13px] outline-none focus:border-primary" />
                <div className="flex max-h-64 flex-wrap gap-1.5 overflow-y-auto pr-1">
                  {(tags.data ?? GENRES).filter((t) => t.toLocaleLowerCase().includes(genreSearch.toLocaleLowerCase())).map((t) => (
                    <button key={t} type="button" className="chip chip-sm" aria-pressed={s.tag === t} onClick={() => set({ tag: s.tag === t ? "" : t })}>{t}</button>
                  ))}
                </div>
              </div>
            </aside>

            <section className="min-w-0">
              <div className="chip-row" role="group" aria-label="Formato">
                {FORMATS.map((kind) => <button key={kind} type="button" className="chip chip-sm" aria-pressed={s.kind === kind} onClick={() => set({ kind })}>{kind === "Todos" ? "Todos" : kindLabel(kind)}</button>)}
              </div>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-[13px] text-muted-foreground">
                <span>
                  <b className="text-foreground">{total.toLocaleString("pt-BR")}</b> {total === 1 ? "obra" : "obras"}
                  {total > PER_PAGE ? ` · ${shownFrom}–${shownTo}` : ""}
                  <span className="hidden sm:inline"> · {SORTS.find((o) => o.key === s.sort)?.label.toLowerCase()}</span>
                </span>
                <div className="view-toggle" role="group" aria-label="Modo de exibição">
                  <button type="button" aria-pressed={!listView} onClick={() => set({ view: "grade" })}><LayoutGrid className="h-3.5 w-3.5" />Grade</button>
                  <button type="button" aria-pressed={listView} onClick={() => set({ view: "lista" })}><ListIcon className="h-3.5 w-3.5" />Lista</button>
                </div>
              </div>
              {activeFilters.length ? (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {activeFilters.map((f, i) => (
                    <button key={i} type="button" className="chip chip-sm" data-active="true" onClick={() => { if ("q" in f.patch) setTerm(""); set(f.patch); }} aria-label={`Remover filtro ${f.label}`}>{f.label}<X className="h-3 w-3" /></button>
                  ))}
                </div>
              ) : null}

              {listView ? (
                <div className="mt-2 grid grid-cols-1 gap-x-6 xl:grid-cols-2">
                  {rows.map((r) => {
                    const chapters = r.chapters[0]?.count ?? 0;
                    return (
                      <div key={r.id} className="catalog-list-item">
                        <Link to="/obra/$slug" params={{ slug: r.slug }} className="series-cover relative block aspect-[2/3] overflow-hidden rounded-md">
                          <img src={coverUrl(r.cover_url)} alt={r.title} className="h-full w-full object-cover" loading="lazy" decoding="async" />
                        </Link>
                        <div className="min-w-0">
                          <h3 className="line-clamp-2 text-[15px] font-semibold leading-snug">
                            <Link to="/obra/$slug" params={{ slug: r.slug }} className="hover:text-primary"><Highlight text={r.title} term={s.q} /></Link>
                          </h3>
                          <p className="card-meta mt-1">
                            {Number(r.rating) > 0 ? <span className="inline-flex items-center gap-1 font-semibold text-foreground"><Star className="fill-gold text-gold" />{formatRating(r.rating)}</span> : null}
                            <span>{chapters.toLocaleString("pt-BR")} cap.</span>
                            <span>{kindLabel(r.kind)}</span>
                            {r.status ? <span>{r.status}</span> : null}
                            {r.views ? <span>{compactNumber(r.views)} leituras</span> : null}
                            <span>{timeAgo(r.updated_at)}</span>
                            <AgeRatingBadge value={r.age_rating} size="sm" />
                          </p>
                          {r.genres?.length ? <p className="mt-1 truncate text-xs text-muted-foreground">{normalizeGenres(r.genres).slice(0, 4).join(" · ")}</p> : null}
                          {r.synopsis ? <p className="mt-1.5 line-clamp-2 text-[13px] leading-relaxed text-foreground/75">{r.synopsis.replace(/<[^>]*>/g, "")}</p> : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="mt-4 grid grid-cols-3 gap-x-3 gap-y-5 sm:grid-cols-4 xl:grid-cols-5">
                  {rows.map((r) => (
                    <SeriesCard
                      key={r.id}
                      slug={r.slug}
                      title={r.title}
                      titleNode={<Highlight text={r.title} term={s.q} />}
                      cover={r.cover_url}
                      rating={r.rating}
                      chapters={r.chapters[0]?.count ?? 0}
                      kind={r.kind}
                      ageRating={r.age_rating}
                      seriesId={r.id}
                    />
                  ))}
                </div>
              )}
              {results.isLoading ? (
                <div role="status" className={`mt-4 grid ${listView ? "grid-cols-1 gap-3 xl:grid-cols-2" : "grid-cols-3 gap-x-3 gap-y-5 sm:grid-cols-4 xl:grid-cols-5"}`}>
                  {Array.from({ length: 10 }, (_, i) => <div key={i} className={`${listView ? "h-28" : "aspect-[2/3]"} rounded-md bg-surface-2 motion-safe:animate-pulse`} />)}
                  <span className="sr-only">Carregando obras</span>
                </div>
              ) : null}
              {results.isError ? <div role="alert" className="py-10 text-center"><p className="mb-3 text-muted-foreground">Não foi possível carregar o catálogo.</p><Button variant="secondary" onClick={() => void results.refetch()}>Tentar novamente</Button></div> : null}
              {!results.isLoading && !results.isError && total === 0 ? (
                <div className="py-12 text-center"><Compass className="mx-auto mb-3 h-8 w-8 text-muted-foreground" /><p className="font-semibold">Nenhuma obra encontrada</p><Button className="mt-4" variant="secondary" onClick={clearAll}>Limpar filtros</Button></div>
              ) : null}
              <Pager page={s.page} pages={pages} onChange={(p) => navigate({ to: ".", search: (prev) => ({ ...prev, page: p }) })} />
            </section>
          </div>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}

