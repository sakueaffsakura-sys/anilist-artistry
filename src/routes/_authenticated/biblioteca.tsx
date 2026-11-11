import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Heart, Library, Play, Search, Users } from "lucide-react";
import { toast } from "sonner";
import { SiteFooter, SiteHeader } from "@/components/SiteHeader";
import { kindLabel, sameKind } from "@/lib/work-categories";
import { CollectionCard, FORMATS, PageTitle, STATUSES, TabButton } from "@/components/LibraryBits";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/useAuth";
import { Pager } from "@/components/Pager";
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
import { Input } from "@/components/ui/input";

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
  const [kind, setKind] = useState("Todos");
  const [sort, setSort] = useState("recent");
  const [page, setPage] = useState(1);

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

  const filtered = items
    .filter((i) => i.series.title.toLocaleLowerCase().includes(search.toLocaleLowerCase()))
    .filter((i) => kind === "Todos" || sameKind(i.series.kind, kind))
    .sort((a, b) =>
      sort === "rating"
        ? Number(b.series.rating) - Number(a.series.rating)
        : sort === "title"
          ? a.series.title.localeCompare(b.series.title)
          : b.date.localeCompare(a.date),
    );

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

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="site-content collection-layout mx-auto max-w-7xl px-4 py-6 sm:px-6 md:py-8 lg:px-8">
        <PageTitle
          icon={<Library />}
          title="Biblioteca"
          subtitle={`Perfil ${profile.name} · ${(favorites.data?.length ?? 0).toLocaleString("pt-BR")} favoritos · ${continuing.length.toLocaleString("pt-BR")} em leitura`}
          right={<Button asChild variant="secondary" size="sm"><Link to="/perfis"><Users className="h-4 w-4" /> Trocar perfil</Link></Button>}
        />

        <div className="chip-row" role="tablist" aria-label="Seções da biblioteca">
          <TabButton active={tab === "favoritos"} onClick={() => { setPage(1); setTab("favoritos"); }} icon={<Heart />} label="Favoritos" count={favorites.data?.length} />
          <TabButton active={tab === "continuando"} onClick={() => { setPage(1); setTab("continuando"); }} icon={<Play />} label="Continuar lendo" count={continuing.length} />
          {STATUSES.map((s) => (
            <TabButton key={s.key} active={tab === s.key} onClick={() => { setPage(1); setTab(s.key); }} icon={<s.icon />} label={s.label} count={countFor(s.key)} />
          ))}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <div className="relative min-w-0 flex-1 basis-56">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input aria-label="Buscar na biblioteca" placeholder="Buscar na biblioteca…" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} className="h-9 pl-9" />
          </div>
          <select
            aria-label="Ordenar biblioteca"
            value={sort}
            onChange={(e) => { setSort(e.target.value); setPage(1); }}
            className="h-9 rounded-md border border-border bg-surface-2 px-3 text-[13px]"
          >
            <option value="recent">Mais recentes</option>
            <option value="rating">Melhor avaliadas</option>
            <option value="title">A–Z</option>
          </select>
        </div>

        <div className="mt-3 flex items-center justify-between gap-3">
          <div className="chip-row min-w-0 flex-1" role="group" aria-label="Formato">
            {FORMATS.map((k) => <button key={k} type="button" className="chip chip-sm" aria-pressed={kind === k} onClick={() => { setKind(k); setPage(1); }}>{k === "Todos" ? "Todos" : kindLabel(k)}</button>)}
          </div>
        </div>
        <p className="mt-3 text-[13px] text-muted-foreground">{filtered.length.toLocaleString("pt-BR")} {filtered.length === 1 ? "obra" : "obras"}</p>

        {(tab === "favoritos" ? favorites : tab === "continuando" ? history : statuses).isPending ? <p role="status" className="py-8 text-muted-foreground">Carregando coleção…</p> : null}
        {(tab === "favoritos" ? favorites : tab === "continuando" ? history : statuses).isError ? <div role="alert" className="py-8"><p className="mb-3 text-muted-foreground">Não foi possível carregar a coleção.</p><Button variant="secondary" onClick={() => void (tab === "favoritos" ? favorites : tab === "continuando" ? history : statuses).refetch()}>Tentar novamente</Button></div> : null}
        <div className="mt-3 grid grid-cols-3 gap-x-3 gap-y-5 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
          {filtered.slice((page - 1) * 24, page * 24).map((i) => (
            <CollectionCard
              key={i.series.id}
              slug={i.series.slug}
              title={i.series.title}
              cover={i.series.cover_url}
              rating={i.series.rating}
              chapters={i.series.chapter_count}
              kind={i.series.kind}
              progress={progressBySeries.get(i.series.id) ?? 0}
              resumeChapter={tab === "continuando" ? history.data?.find((r) => r.series_id === i.series.id)?.chapters?.number : undefined}
              onRemove={() => remove.mutate(i.series.id)}
            />
          ))}
        </div>
        <Pager page={page} pages={Math.max(1, Math.ceil(filtered.length / 24))} onChange={setPage} />
        {filtered.length === 0 && !(tab === "favoritos" ? favorites : tab === "continuando" ? history : statuses).isPending && !(tab === "favoritos" ? favorites : tab === "continuando" ? history : statuses).isError ? (
          <p className="mt-10 text-center text-sm text-muted-foreground">
            Nada por aqui ainda.{" "}
            <Link to="/catalogo" search={{ q: "", kind: "Todos" }} className="text-primary">
              Explorar obras
            </Link>
          </p>
        ) : null}
      </main>
      <SiteFooter />
    </div>
  );
}
