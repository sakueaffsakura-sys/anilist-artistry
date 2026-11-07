import { useEffect, useState } from "react";
import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useGenres } from "@/hooks/use-genres";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import { BookOpen, Clock, Compass, Eye, LayoutGrid, List as ListIcon, Search, SlidersHorizontal, Sparkle, Star, User2, X } from "lucide-react";
import { SiteFooter, SiteHeader } from "@/components/SiteHeader";
import { Chips, FORMATS } from "@/components/LibraryBits";
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

const compact = new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 });
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
  { key: "recent", label: "Mais recentes" },
  { key: "popular", label: "Mais populares" },
  { key: "alpha", label: "Ordem alfabética" },
];
const STATUS = ["Em lançamento", "Finalizado", "Hiato", "Cancelado"];
const STATUS_DB: Record<string, string[]> = {
  "Em lançamento": ["Em lançamento", "RELEASING", "Lançando", "Em andamento"],
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
      if (s.kind !== "Todos") q = q.eq("kind", s.kind);
      if (s.status) q = q.in("status", STATUS_DB[s.status] ?? [s.status]);
      if (s.tag) q = q.overlaps("genres", genreAliases(s.tag));
      q =
        s.sort === "popular"
          ? q.order("views", { ascending: false })
          : s.sort === "alpha"
            ? q.order("title")
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

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="site-content catalog-layout mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="catalog-hero flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <p className="mb-2 text-xs font-bold uppercase text-primary">Better Mangá / Descoberta</p>
            <h1 className="flex items-center gap-3 font-display text-2xl font-extrabold sm:text-3xl"><Compass className="h-7 w-7 text-primary" /> Explorar obras</h1>
            <p className="mt-2 max-w-xl text-sm text-muted-foreground">Busque pelo nome, filtre por gênero, formato e status, ou encontre leitores pelo @nick.</p>
            {!isUser && results.isSuccess ? <p className="mt-3 inline-flex items-center gap-2 rounded-full border border-border bg-surface/70 px-3 py-1 text-xs font-bold"><span className="live-dot" />{total.toLocaleString("pt-BR")} {total === 1 ? "obra encontrada" : "obras encontradas"}</p> : null}
          </div>
          <Button asChild variant="outline"><Link to="/biblioteca"><BookOpen className="h-4 w-4" /> Minha coleção</Link></Button>
        </div>

        <div className="mt-6 border-b border-border pb-6">
          <div className="catalog-search">
            <Search className="h-5 w-5" />
            <input
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              aria-label="Buscar obras ou leitores"
              placeholder="Buscar obras ou @leitor..."
              enterKeyHint="search"
            />
            {term ? <button type="button" aria-label="Limpar busca" onClick={() => setTerm("")}><X className="h-4 w-4" /></button> : null}
          </div>
          {!term && !s.tag ? (
            <div className="search-suggest mt-3" aria-label="Sugestões de busca">
              <span className="self-center text-xs font-semibold text-muted-foreground">Sugestões:</span>
              {SUGGESTIONS.map((genre) => <button key={genre} type="button" onClick={() => set({ tag: genre })}><Sparkle className="h-3 w-3 text-primary" />{genre}</button>)}
            </div>
          ) : null}
        </div>

        {isUser ? (
          <div className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {(users.data ?? []).map((u) => (
              <Link
                key={u.id}
                to="/u/$username"
                params={{ username: u.username }}
                className="flex items-center gap-3 rounded-xl border border-border bg-surface p-4 hover:border-primary/60"
              >
                <span className="grid h-12 w-12 place-items-center overflow-hidden rounded-full bg-surface-2">
                  {u.avatar_url ? <img loading="lazy" decoding="async" src={u.avatar_url} alt="" className="h-full w-full object-cover" /> : <User2 className="h-5 w-5" />}
                </span>
                <span>
                  <span className="block font-bold">@{u.username}</span>
                  <span className="text-xs text-muted-foreground">{u.display_name ?? ""} · Nv. {u.level}</span>
                </span>
              </Link>
            ))}
            {users.data?.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum utilizador encontrado.</p> : null}
          </div>
        ) : (
          <div className="mt-8 grid min-w-0 grid-cols-1 gap-6 lg:grid-cols-[240px_minmax(0,1fr)]">
            <aside className="catalog-filters min-w-0 h-fit border-b border-border pb-6 lg:sticky lg:top-20 lg:border-b-0 lg:border-r lg:pr-6">
              <Button variant="outline" className="mb-3 w-full lg:hidden" aria-expanded={filtersOpen} onClick={() => setFiltersOpen((v) => !v)}><SlidersHorizontal className="h-4 w-4" /> {filtersOpen ? "Fechar filtros" : "Abrir filtros"}</Button>
              <div className={filtersOpen ? "block" : "hidden lg:block"}>
              <div className="flex items-center justify-between"><h2 className="flex items-center gap-2 font-display text-lg font-bold"><SlidersHorizontal className="h-4 w-4 text-primary" /> Filtros</h2><Button variant="ghost" size="sm" onClick={() => { setTerm(""); set({ q: "", kind: "Todos", sort: "recent", status: "", tag: "" }); }}>Limpar</Button></div>
              <p className="mb-2 mt-4 text-sm font-semibold text-muted-foreground">Ordenar</p>
              <div className="space-y-2">
                {SORTS.map((o) => (
                  <Button type="button" variant="ghost"
                    key={o.key}
                    onClick={() => set({ sort: o.key })}
                    className={`block w-full rounded-lg px-3 py-2.5 text-left text-sm font-semibold ${
                      s.sort === o.key ? "bg-primary text-primary-foreground" : "bg-surface-2 hover:bg-surface-2/70"
                    }`}
                  >
                    {o.label}
                  </Button>
                ))}
              </div>
              <p className="mb-2 mt-5 text-sm font-semibold text-muted-foreground">Status</p>
              <div className="flex flex-wrap gap-2">
                {STATUS.map((st) => (
                  <Button type="button" variant="ghost"
                    key={st}
                    onClick={() => set({ status: s.status === st ? "" : st })}
                    className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${
                      s.status === st ? "bg-primary text-primary-foreground" : "bg-surface-2"
                    }`}
                  >
                    {st}
                  </Button>
                ))}
              </div>
              <p className="mb-2 mt-5 text-sm font-semibold text-muted-foreground">Gêneros</p>
              <input aria-label="Buscar gênero" placeholder="Buscar gênero…" value={genreSearch} onChange={(e) => setGenreSearch(e.target.value)} className="mb-3 h-9 w-full rounded-md border border-border bg-surface px-3 text-sm focus-visible:outline-primary" />
              <div className="flex max-h-64 flex-wrap gap-2 overflow-y-auto pr-1">
                {(tags.data ?? GENRES).filter((t) => t.toLocaleLowerCase().includes(genreSearch.toLocaleLowerCase())).map((t) => (
                  <Button type="button" variant="ghost"
                    key={t}
                    onClick={() => set({ tag: s.tag === t ? "" : t })}
                    className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${
                      s.tag === t ? "bg-primary text-primary-foreground" : "bg-surface-2"
                    }`}
                  >
                    {t}
                  </Button>
                ))}
              </div>
              </div>
            </aside>

            <section className="min-w-0">
              <div className="border-b border-border pb-5">
                <p className="mb-2 text-xs font-bold uppercase text-muted-foreground">Formato</p>
                <Chips value={s.kind} onChange={(v) => set({ kind: v })} options={FORMATS} />
              </div>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
                <span><b className="text-foreground">{total.toLocaleString("pt-BR")}</b> resultados{total ? ` · mostrando ${shownFrom}–${shownTo}` : ""}<span className="hidden text-xs sm:inline"> · ordenado por {SORTS.find((o) => o.key === s.sort)?.label.toLowerCase()}</span></span>
                <div className="view-toggle" role="group" aria-label="Modo de exibição">
                  <button type="button" aria-pressed={!listView} onClick={() => set({ view: "grade" })}><LayoutGrid className="h-3.5 w-3.5" />Grade</button>
                  <button type="button" aria-pressed={listView} onClick={() => set({ view: "lista" })}><ListIcon className="h-3.5 w-3.5" />Lista</button>
                </div>
              </div>
              {(s.tag || s.status || s.kind !== "Todos" || s.q) ? <div className="mt-4 flex flex-wrap gap-2">{([{ value: s.q, patch: { q: "" } }, { value: s.kind === "Todos" ? "" : s.kind, patch: { kind: "Todos" } }, { value: s.status, patch: { status: "" } }, { value: s.tag, patch: { tag: "" } }]).filter((f) => f.value).map((f, i) => <Button key={i} variant="secondary" size="sm" onClick={() => { if ("q" in f.patch) setTerm(""); set(f.patch); }} aria-label={`Remover filtro ${f.value}`}>{f.value}<X className="h-3 w-3" /></Button>)}</div> : null}
              {listView ? (
                <div className="mt-4 grid grid-cols-1 gap-3 xl:grid-cols-2">
                  {(results.data?.rows ?? []).map((r) => (
                    <Link key={r.id} to="/obra/$slug" params={{ slug: r.slug }} className="catalog-list-item group">
                      <div className="series-cover relative aspect-[2/3] overflow-hidden rounded-[1rem] border border-border">
                        <img src={coverUrl(r.cover_url)} alt={r.title} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" loading="lazy" decoding="async" />
                      </div>
                      <div className="min-w-0 py-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="kind-badge">{r.kind}</span>
                          {r.status ? <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-300">{r.status}</span> : null}
                          <AgeRatingBadge value={r.age_rating} size="sm" />
                        </div>
                        <p className="mt-2 line-clamp-2 font-display text-base font-bold leading-snug group-hover:text-primary"><Highlight text={r.title} term={s.q} /></p>
                        {r.genres?.length ? <p className="mt-1 truncate text-xs text-muted-foreground">{normalizeGenres(r.genres).slice(0, 4).join(" · ")}</p> : null}
                        {r.synopsis ? <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-foreground/70">{r.synopsis.replace(/<[^>]*>/g, "")}</p> : null}
                        <div className="catalog-meta mt-2">
                          <span className="inline-flex items-center gap-1"><BookOpen />{r.chapters[0]?.count ?? 0} cap.</span>
                          <span className="inline-flex items-center gap-1 text-gold"><Star className="fill-gold" />{Number(r.rating).toFixed(1).replace(".", ",")}</span>
                          {r.views ? <span className="inline-flex items-center gap-1"><Eye />{compact.format(r.views)}</span> : null}
                          <span className="inline-flex items-center gap-1"><Clock />{timeAgo(r.updated_at)}</span>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
                  {(results.data?.rows ?? []).map((r) => (
                    <Link key={r.id} to="/obra/$slug" params={{ slug: r.slug }} className="catalog-card group">
                      <div className="series-cover catalog-cover relative overflow-hidden border border-border">
                        <img src={coverUrl(r.cover_url)} alt={r.title} className="aspect-[2/3] w-full object-cover transition-transform duration-500 group-hover:scale-105" loading="lazy" decoding="async" />
                        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/10" />
                        <div className="absolute left-2 top-2 flex flex-col items-start gap-1">
                          <span className="flex items-center gap-1 rounded-md bg-background/85 px-2 py-0.5 text-[11px] font-bold">
                            <BookOpen className="h-3 w-3" /> {r.chapters[0]?.count ?? 0} Capítulos
                          </span>
                          <span className="rounded-md border border-primary/60 bg-background/85 px-1.5 py-0.5 text-[11px] font-bold text-primary">
                            {r.kind}
                          </span>
                          <AgeRatingBadge value={r.age_rating} size="sm" />
                        </div>
                        <span className="absolute bottom-2 left-2 flex items-center gap-1 rounded-md bg-background/85 px-1.5 py-0.5 text-[11px] font-bold text-gold">
                          <Star className="h-3 w-3 fill-gold" /> {Number(r.rating).toFixed(1).replace(".", ",")}
                        </span>
                        {r.views ? <span className="absolute bottom-2 right-2 flex items-center gap-1 rounded-md bg-background/85 px-1.5 py-0.5 text-[11px] font-bold"><Eye className="h-3 w-3 text-primary" />{compact.format(r.views)}</span> : null}
                      </div>
                      <p className="mt-2 line-clamp-2 font-bold group-hover:text-primary"><Highlight text={r.title} term={s.q} /></p>
                      <p className="catalog-meta"><span className="truncate">{r.status}</span><span className="inline-flex items-center gap-1"><Clock />{timeAgo(r.updated_at)}</span></p>
                    </Link>
                  ))}
                </div>
              )}
              {results.isLoading ? <div role="status" className={`mt-4 grid gap-4 ${listView ? "grid-cols-1 xl:grid-cols-2" : "grid-cols-2 sm:grid-cols-3 xl:grid-cols-4"}`}>{Array.from({ length: 8 }, (_, i) => <div key={i} className={`${listView ? "h-40" : "aspect-[2/3]"} animate-pulse rounded-[1.1rem] bg-surface-2`} />)}<span className="sr-only">Carregando obras</span></div> : null}
              {results.isError ? <div role="alert" className="py-10 text-center"><p className="mb-3 text-muted-foreground">Não foi possível carregar o catálogo.</p><Button variant="outline" onClick={() => void results.refetch()}>Tentar novamente</Button></div> : null}
              {!results.isLoading && !results.isError && total === 0 ? (
                <div className="py-12 text-center"><Compass className="mx-auto mb-4 h-9 w-9 text-primary" /><p className="font-display font-bold">Nenhuma obra encontrada</p><Button className="mt-4" variant="outline" onClick={() => { setTerm(""); set({ q: "", kind: "Todos", status: "", tag: "" }); }}>Limpar filtros</Button></div>
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

