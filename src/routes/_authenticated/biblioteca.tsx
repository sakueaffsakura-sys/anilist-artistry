import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Heart, Library, Play, Search, ArrowUpRight, Users } from "lucide-react";
import { toast } from "sonner";
import { SiteFooter, SiteHeader } from "@/components/SiteHeader";
import { Chips, CollectionCard, PageTitle, STATUSES, TabButton } from "@/components/LibraryBits";
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

const SERIES_FIELDS = "id, slug, title, cover_url, kind, rating, chapters(number)";
type S = {
  id: string;
  slug: string;
  title: string;
  cover_url: string | null;
  kind: string;
  rating: number;
  chapters: { number: number }[];
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
      const total = row.series.chapters.length || 1;
      const read = row.chapters?.number ?? 0;
      const idx = [...row.series.chapters].sort((a, b) => a.number - b.number).findIndex((c) => c.number === read);
      const pct = Math.round(((idx + 1) / total) * 100);
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
    .filter((i) => kind === "Todos" || i.series.kind === kind)
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
      <main className="site-content collection-layout mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="border-b border-border pb-6 mb-6"><PageTitle icon={<Library className="h-7 w-7" />} title="Minha Coleção" subtitle={profile.name} right={<Button asChild variant="outline" size="sm"><Link to="/perfis"><Users className="h-4 w-4" /> Perfis</Link></Button>} />
          <div className="grid grid-cols-2 gap-6 sm:grid-cols-3"><div><p className="font-display text-2xl font-bold">{favorites.data?.length ?? "—"}</p><p className="mt-1 flex items-center gap-2 text-xs text-muted-foreground"><Heart className="h-3.5 w-3.5 text-favorite" /> Favoritos</p></div><div><p className="font-display text-2xl font-bold">{continuing.length}</p><p className="mt-1 flex items-center gap-2 text-xs text-muted-foreground"><Play className="h-3.5 w-3.5 text-primary" /> Continuar lendo</p></div><div className="hidden sm:flex sm:items-center sm:justify-end"><Button asChild variant="ghost"><Link to="/catalogo">Explorar obras <ArrowUpRight className="h-4 w-4" /></Link></Button></div></div>
        </div>

        <div className="flex flex-wrap gap-2">
          <TabButton active={tab === "favoritos"} onClick={() => { setPage(1); setTab("favoritos"); }} icon={<Heart className="h-4 w-4" />} label="Favoritos" count={favorites.data?.length} />
          <TabButton active={tab === "continuando"} onClick={() => { setPage(1); setTab("continuando"); }} icon={<Play className="h-4 w-4" />} label="Continuar lendo" count={continuing.length} />
          {STATUSES.map((s) => (
            <TabButton key={s.key} active={tab === s.key} onClick={() => { setPage(1); setTab(s.key); }} icon={<s.icon className="h-4 w-4" />} label={s.label} count={countFor(s.key)} />
          ))}
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <div className="relative min-w-0 basis-full sm:basis-auto sm:flex-1"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input aria-label="Buscar na coleção" placeholder="Buscar na coleção…" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} className="bg-surface pl-9" /></div>
          <p className="text-sm text-muted-foreground">{filtered.length} obras</p>
          <select
            aria-label="Ordenar coleção"
            value={sort}
            onChange={(e) => { setSort(e.target.value); setPage(1); }}
            className="rounded-lg border border-border bg-surface px-3 py-2 text-sm"
          >
            <option value="recent">Mais recentes</option>
            <option value="rating">Melhor avaliadas</option>
            <option value="title">Título (A-Z)</option>
          </select>
        </div>

        <div className="mt-4 border-b border-border pb-5">
          <Chips value={kind} onChange={(v) => { setKind(v); setPage(1); }} />
        </div>

        {(tab === "favoritos" ? favorites : tab === "continuando" ? history : statuses).isPending ? <p role="status" className="py-8 text-muted-foreground">Carregando coleção…</p> : null}
        {(tab === "favoritos" ? favorites : tab === "continuando" ? history : statuses).isError ? <div role="alert" className="py-8"><p className="mb-3 text-muted-foreground">Não foi possível carregar a coleção.</p><Button variant="outline" onClick={() => void (tab === "favoritos" ? favorites : tab === "continuando" ? history : statuses).refetch()}>Tentar novamente</Button></div> : null}
        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {filtered.slice((page - 1) * 24, page * 24).map((i) => (
            <CollectionCard
              key={i.series.id}
              slug={i.series.slug}
              title={i.series.title}
              cover={i.series.cover_url}
              rating={i.series.rating}
              chapters={i.series.chapters.length}
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
