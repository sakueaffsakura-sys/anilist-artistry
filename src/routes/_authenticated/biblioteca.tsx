import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, Search } from "lucide-react";
import { toast } from "sonner";
import { SiteFooter, SiteHeader } from "@/components/SiteHeader";
import { STATUSES } from "@/components/LibraryBits";
import { CollectionPager, CollectionPoster } from "@/components/CollectionPoster";
import { COLLECTION_FORMATS, COLLECTION_PAGE_SIZE, collectionCaption, collectionFormatOf, type CollectionFormat } from "@/lib/collection";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/useAuth";
import { useActiveProfile } from "@/lib/active-profile";

export const Route = createFileRoute("/_authenticated/biblioteca")({
  staticData: { sitemap: false },
  head: () => ({
    meta: [
      { title: "Minha Coleção — Better Mangá" },
      { name: "description", content: "Favoritos, obras em leitura e status de leitura da sua conta." },
      { property: "og:title", content: "Minha Coleção — Better Mangá" },
      { property: "og:description", content: "Favoritos e histórico de leitura." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Colecao,
});


import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

type Tab = "favoritos" | "continuando" | (typeof STATUSES)[number]["key"];

const SERIES_FIELDS = "id, slug, title, cover_url, kind, rating, chapter_count, latest_chapter_number";
type S = {
  id: string;
  slug: string;
  title: string;
  cover_url: string | null;
  kind: string;
  rating: number;
  chapter_count: number;
  latest_chapter_number: number | null;
};

function Colecao() {
  const { user } = useSession();
  const qc = useQueryClient();
  const profile = useActiveProfile();
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<Tab>("favoritos");
  const [format, setFormat] = useState<CollectionFormat | null>(null);
  const [sort, setSort] = useState("recent");
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState(false);

  const favorites = useQuery({
    queryKey: ["col-fav", user?.id, profile.id],
    enabled: Boolean(user),
    queryFn: async () => {
      if (!user) throw new Error("Entre na sua conta.");
      const { data, error } = await supabase
        .from("favorites")
        .select(`created_at, series!inner(${SERIES_FIELDS})`)
        .eq("user_id", user.id).eq("profile_id", profile.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as { created_at: string; series: S }[];
    },
  });

  const statuses = useQuery({
    queryKey: ["col-status", user?.id],
    enabled: Boolean(user),
    queryFn: async () => {
      if (!user) throw new Error("Entre na sua conta.");
      const { data, error } = await supabase
        .from("reading_status")
        .select(`status, updated_at, series!inner(${SERIES_FIELDS})`)
        .eq("user_id", user.id)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as { status: string; updated_at: string; series: S }[];
    },
  });

  const history = useQuery({
    queryKey: ["col-hist", user?.id, profile.id],
    enabled: Boolean(user),
    queryFn: async () => {
      if (!user) throw new Error("Entre na sua conta.");
      const { data, error } = await supabase
        .from("reading_history")
        .select(`updated_at, series_id, chapters(number), series!inner(${SERIES_FIELDS})`)
        .eq("user_id", user.id).eq("profile_id", profile.id)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as {
        updated_at: string;
        series_id: string;
        chapters: { number: number } | null;
        series: S;
      }[];
    },
  });

  const progressBySeries = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of history.data ?? []) {
      // Progresso pelo número do capítulo lido sobre o último publicado (sem baixar a lista de capítulos).
      const latest = Number(row.series.latest_chapter_number ?? 0);
      const read = Number(row.chapters?.number ?? 0);
      const pct = latest > 0 ? Math.min(100, Math.round((read / latest) * 100)) : 0;
      map.set(row.series_id, Math.max(map.get(row.series_id) ?? 0, pct));
    }
    return map;
  }, [history.data]);

  const continuing = useMemo(() => {
    const seen = new Set<string>();
    return (history.data ?? []).filter((r) => {
      if (seen.has(r.series_id)) return false;
      seen.add(r.series_id);
      return true;
    }).map((r) => ({ date: r.updated_at, series: r.series }));
  }, [history.data]);

  const items: { date: string; series: S }[] =
    tab === "favoritos"
      ? (favorites.data ?? []).map((f) => ({ date: f.created_at, series: f.series }))
      : tab === "continuando"
        ? continuing
        : (statuses.data ?? []).filter((s) => s.status === tab).map((s) => ({ date: s.updated_at, series: s.series }));

  const formatCounts = useMemo(() => {
    const counts = new Map<CollectionFormat, number>();
    for (const item of items) {
      const key = collectionFormatOf(item.series.kind);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
  }, [items]);
  const formats: CollectionFormat[] = [...COLLECTION_FORMATS, ...(formatCounts.get("Outros") ? (["Outros"] as const) : [])];
  // Sem escolha do leitor, abre a primeira aba que tem obras (a lista começa em Comic, como no modelo).
  const activeFormat: CollectionFormat = format ?? formats.find((f) => (formatCounts.get(f) ?? 0) > 0) ?? "Comic";

  const filtered = items
    .filter((i) => collectionFormatOf(i.series.kind) === activeFormat)
    .filter((i) => i.series.title.toLocaleLowerCase().includes(search.toLocaleLowerCase()))
    .sort((a, b) =>
      sort === "rating"
        ? Number(b.series.rating) - Number(a.series.rating)
        : sort === "title"
          ? a.series.title.localeCompare(b.series.title)
          : b.date.localeCompare(a.date),
    );
  const pages = Math.max(1, Math.ceil(filtered.length / COLLECTION_PAGE_SIZE));
  const currentPage = Math.min(page, pages);
  const visible = filtered.slice((currentPage - 1) * COLLECTION_PAGE_SIZE, currentPage * COLLECTION_PAGE_SIZE);
  const source = tab === "favoritos" ? favorites : tab === "continuando" ? history : statuses;

  const remove = useMutation({
    mutationFn: async (seriesId: string) => {
      if (!user) throw new Error("Entre na sua conta.");
      if (tab === "favoritos") {
        { const { error: dbErr } = await supabase.from("favorites").delete().eq("user_id", user.id).eq("profile_id", profile.id).eq("series_id", seriesId); if (dbErr) throw dbErr; }
      } else if (tab === "continuando") {
        { const { error: dbErr } = await supabase.from("reading_history").delete().eq("user_id", user.id).eq("profile_id", profile.id).eq("series_id", seriesId); if (dbErr) throw dbErr; }
      } else {
        { const { error: dbErr } = await supabase.from("reading_status").delete().eq("user_id", user.id).eq("series_id", seriesId); if (dbErr) throw dbErr; }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["col-fav"] });
      qc.invalidateQueries({ queryKey: ["col-status"] });
      qc.invalidateQueries({ queryKey: ["col-hist"] });
      toast.success("Removido");
    },
  });

  const countFor = (k: string) => (statuses.data ?? []).filter((s) => s.status === k).length;
  const choose = (next: Tab) => {
    setTab(next);
    setFormat(null);
    setPage(1);
    setEditing(false);
  };
  const sectionTitle = tab === "favoritos" ? "Favoritos" : tab === "continuando" ? "Continue lendo" : (STATUSES.find((st) => st.key === tab)?.label ?? "Coleção");
  const sortLabel = sort === "rating" ? "Melhor avaliadas" : sort === "title" ? "A–Z" : "Mais recentes";

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="coll-page">
        <aside className="coll-side">
          <h1>Coleção</h1>
          <nav className="coll-nav" aria-label="Seções da coleção">
            <button type="button" className="coll-item" aria-current={tab === "continuando"} onClick={() => choose("continuando")}>Continue lendo</button>
            <button type="button" className="coll-item" aria-current={tab === "favoritos"} onClick={() => choose("favoritos")}>Favoritos</button>
            <p className="coll-label">Status</p>
            {STATUSES.map((st) => {
              const count = countFor(st.key);
              return (
                <button key={st.key} type="button" className="coll-item" aria-current={tab === st.key} onClick={() => choose(st.key)}>
                  {st.key === "planejo" ? "Planejo Ler" : st.label}
                  {count > 0 ? <small>{count.toLocaleString("pt-BR")}</small> : null}
                </button>
              );
            })}
            <p className="coll-label">Mais</p>
            <Link to="/listas" className="coll-item">Listas</Link>
            <button type="button" className="coll-item" disabled title="Em breve">Baixados</button>
          </nav>
        </aside>

        <section className="coll-main" aria-label={sectionTitle}>
          <div className="coll-head">
            <h2>{sectionTitle} <small>{items.length.toLocaleString("pt-BR")}</small></h2>
            <div className="coll-head-spacer" />
            <label className="coll-search">
              <Search aria-hidden="true" />
              <input
                type="search"
                aria-label={tab === "favoritos" ? "Buscar nos favoritos" : "Buscar nesta lista"}
                placeholder={tab === "favoritos" ? "Buscar nos favoritos" : "Buscar nesta lista"}
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                autoComplete="off"
              />
            </label>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button type="button" className="coll-pill coll-sort" aria-label={`Ordenar: ${sortLabel}`}>
                  {sortLabel}
                  <ChevronDown aria-hidden="true" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuRadioGroup value={sort} onValueChange={(value) => { setSort(value); setPage(1); }}>
                  <DropdownMenuRadioItem value="recent">Mais recentes</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="rating">Melhor avaliadas</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="title">A–Z</DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
            <button type="button" className="coll-pill" aria-pressed={editing} onClick={() => setEditing((value) => !value)}>
              {editing ? "Concluir" : "Editar"}
            </button>
          </div>

          <div className="updates-tabs coll-tabs" role="tablist" aria-label="Formato">
            {formats.map((f) => (
              <button key={f} type="button" role="tab" aria-selected={f === activeFormat} className="updates-tab" data-active={f === activeFormat} onClick={() => { setFormat(f); setPage(1); }}>
                {f}
              </button>
            ))}
          </div>

          {source.isPending ? (
            <div className="coll-grid" role="status" aria-label="Carregando coleção">
              {Array.from({ length: 10 }, (_, i) => <Skeleton key={i} className="aspect-[2/3] rounded-xl" />)}
            </div>
          ) : null}
          {source.isError ? (
            <div role="alert" className="coll-empty">
              <p>Não foi possível carregar a coleção.</p>
              <Button variant="secondary" onClick={() => void source.refetch()}>Tentar novamente</Button>
            </div>
          ) : null}

          {!source.isPending && !source.isError ? (
            visible.length > 0 ? (
              <div className="coll-grid">
                {visible.map((i) => {
                  const progress = progressBySeries.get(i.series.id) ?? 0;
                  return (
                    <CollectionPoster
                      key={i.series.id}
                      slug={i.series.slug}
                      title={i.series.title}
                      cover={i.series.cover_url}
                      caption={collectionCaption(progress, i.series.chapter_count, i.series.latest_chapter_number)}
                      progress={progress}
                      heart={tab === "favoritos"}
                      editing={editing}
                      resumeChapter={tab === "continuando" ? history.data?.find((r) => r.series_id === i.series.id)?.chapters?.number : undefined}
                      onRemove={() => remove.mutate(i.series.id)}
                    />
                  );
                })}
              </div>
            ) : (
              <p className="coll-empty">
                Nada por aqui ainda.{" "}
                <Link to="/catalogo" search={{ q: "", kind: "Todos" }} className="text-primary">Explorar obras</Link>
              </p>
            )
          ) : null}

          <CollectionPager page={currentPage} pages={pages} onChange={(next) => { setPage(next); window.scrollTo({ top: 0 }); }} />
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
