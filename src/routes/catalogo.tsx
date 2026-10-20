import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useGenres } from "@/hooks/use-genres";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import { BookOpen, Search, Star, User2 } from "lucide-react";
import { SiteFooter, SiteHeader } from "@/components/SiteHeader";
import { Chips, FORMATS } from "@/components/LibraryBits";
import { supabase } from "@/integrations/supabase/client";
import { coverUrl } from "@/lib/media";
import { Pager } from "@/components/Pager";
import { Button } from "@/components/ui/button";
import { GENRES, genreAliases, normalizeGenres } from "@/lib/work-genres";

const searchSchema = z.object({
  q: fallback(z.string(), "").default(""),
  kind: fallback(z.string(), "Todos").default("Todos"),
  sort: fallback(z.string(), "recent").default("recent"),
  status: fallback(z.string(), "").default(""),
  tag: fallback(z.string(), "").default(""),
  page: fallback(z.number(), 1).default(1),
});

export const Route = createFileRoute("/catalogo")({
  staticData: { sitemap: true },
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
    queryKey: ["search", s],
    enabled: !isUser,
    queryFn: async () => {
      let q = supabase
        .from("series")
        .select("id, slug, title, cover_url, kind, rating, chapters(count)", { count: "exact" })
        .eq("published", true);
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

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-7xl px-4 py-10">
        <h1 className="flex items-center gap-3 font-display text-3xl font-extrabold">
          <Search className="h-7 w-7 text-primary" /> Pesquisar
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Descobre obras por nome, gênero e filtros — ou encontra utilizadores com{" "}
          <span className="font-bold text-primary">@nick</span>.
        </p>

        <div className="mt-6 max-w-3xl rounded-xl border border-border bg-surface p-5">
          <div className="relative">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              placeholder="Buscar obras ou @utilizador..."
              className="h-14 w-full rounded-lg border border-border bg-background pl-11 pr-4 text-sm outline-none focus:border-primary"
            />
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Dica: começa com <span className="text-primary">@</span> para pesquisar perfis.
          </p>
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
          <div className="mt-8 grid gap-6 lg:grid-cols-[280px_1fr]">
            <aside className="h-fit rounded-xl border border-border bg-surface p-5">
              <h2 className="font-display text-lg font-bold">Filtros</h2>
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
              <p className="mb-2 mt-5 text-sm font-semibold text-muted-foreground">Tags</p>
              <div className="flex max-h-64 flex-wrap gap-2 overflow-y-auto pr-1">
                {(tags.data ?? GENRES).map((t) => (
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
            </aside>

            <section>
              <div className="rounded-xl border border-border bg-surface p-5">
                <p className="mb-2 text-xs font-bold uppercase text-muted-foreground">Formato</p>
                <Chips value={s.kind} onChange={(v) => set({ kind: v })} options={FORMATS} />
              </div>
              <div className="mt-4 flex justify-between text-sm text-muted-foreground">
                <span>{total} resultados</span>
                <span className="text-xs">Ordenado por {SORTS.find((o) => o.key === s.sort)?.label.toLowerCase()}</span>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
                {(results.data?.rows ?? []).map((r) => (
                  <Link key={r.id} to="/obra/$slug" params={{ slug: r.slug }} className="group">
                    <div className="relative overflow-hidden rounded-xl border border-border">
                      <img src={coverUrl(r.cover_url)} alt={r.title} className="aspect-[2/3] w-full object-cover transition-transform group-hover:scale-105" loading="lazy" />
                      <div className="absolute left-2 top-2 flex flex-col items-start gap-1">
                        <span className="flex items-center gap-1 rounded-md bg-background/85 px-2 py-0.5 text-[11px] font-bold">
                          <BookOpen className="h-3 w-3" /> {r.chapters[0]?.count ?? 0} Capítulos
                        </span>
                        <span className="rounded-md border border-primary/60 bg-background/85 px-1.5 py-0.5 text-[11px] font-bold text-primary">
                          {r.kind}
                        </span>
                      </div>
                      <span className="absolute bottom-2 left-2 flex items-center gap-1 rounded-md bg-background/85 px-1.5 py-0.5 text-[11px] font-bold text-gold">
                        <Star className="h-3 w-3 fill-gold" /> {Number(r.rating).toFixed(1).replace(".", ",")}
                      </span>
                    </div>
                    <p className="mt-2 line-clamp-2 font-bold group-hover:text-primary">{r.title}</p>
                  </Link>
                ))}
              </div>
              {results.isLoading ? <p className="mt-6 text-sm text-muted-foreground">Carregando…</p> : null}
              {!results.isLoading && total === 0 ? (
                <p className="mt-6 text-sm text-muted-foreground">Nenhuma obra encontrada.</p>
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

