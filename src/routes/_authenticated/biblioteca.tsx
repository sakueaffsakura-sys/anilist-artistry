import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Heart, Library, Play } from "lucide-react";
import { toast } from "sonner";
import { SiteFooter, SiteHeader } from "@/components/SiteHeader";
import { Chips, CollectionCard, PageTitle, STATUSES, TabButton } from "@/components/LibraryBits";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/useAuth";
import { Pager } from "@/components/Pager";
import { activeProfileId } from "@/lib/active-profile";

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
  const [tab, setTab] = useState<Tab>("favoritos");
  const [kind, setKind] = useState("Todos");
  const [sort, setSort] = useState("recent");
  const [page, setPage] = useState(1);

  const favorites = useQuery({
    queryKey: ["col-fav", user?.id],
    enabled: Boolean(user),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("favorites")
        .select(`created_at, series!inner(${SERIES_FIELDS})`)
        .eq("user_id", user!.id).eq("profile_id", activeProfileId())
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as { created_at: string; series: S }[];
    },
  });

  const statuses = useQuery({
    queryKey: ["col-status", user?.id],
    enabled: Boolean(user),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reading_status")
        .select(`status, updated_at, series!inner(${SERIES_FIELDS})`)
        .eq("user_id", user!.id)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as { status: string; updated_at: string; series: S }[];
    },
  });

  const history = useQuery({
    queryKey: ["col-hist", user?.id],
    enabled: Boolean(user),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reading_history")
        .select(`updated_at, series_id, chapters(number), series!inner(${SERIES_FIELDS})`)
        .eq("user_id", user!.id).eq("profile_id", activeProfileId())
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
      if (tab === "favoritos") {
        { const { error: dbErr } = await supabase.from("favorites").delete().eq("user_id", user!.id).eq("profile_id", activeProfileId()).eq("series_id", seriesId); if (dbErr) throw dbErr; }
      } else if (tab === "continuando") {
        { const { error: dbErr } = await supabase.from("reading_history").delete().eq("user_id", user!.id).eq("profile_id", activeProfileId()).eq("series_id", seriesId); if (dbErr) throw dbErr; }
      } else {
        { const { error: dbErr } = await supabase.from("reading_status").delete().eq("user_id", user!.id).eq("series_id", seriesId); if (dbErr) throw dbErr; }
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
      <main className="mx-auto max-w-7xl px-4 py-10">
        <PageTitle icon={<Library className="h-7 w-7" />} title="Minha Coleção" subtitle="Favoritos e histórico de leitura" />

        <div className="flex flex-wrap gap-2">
          <TabButton active={tab === "favoritos"} onClick={() => { setPage(1); setTab("favoritos"); }} icon={<Heart className="h-4 w-4" />} label="Favoritos" count={favorites.data?.length} />
          <TabButton active={tab === "continuando"} onClick={() => { setPage(1); setTab("continuando"); }} icon={<Play className="h-4 w-4" />} label="Cont. lendo" />
          {STATUSES.map((s) => (
            <TabButton key={s.key} active={tab === s.key} onClick={() => { setPage(1); setTab(s.key); }} icon={<s.icon className="h-4 w-4" />} label={s.label} count={countFor(s.key)} />
          ))}
        </div>

        <div className="mt-6 flex items-center justify-between">
          <p className="text-sm text-muted-foreground">{filtered.length} obras</p>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            className="rounded-lg border border-border bg-surface px-3 py-2 text-sm"
          >
            <option value="recent">Mais recentes</option>
            <option value="rating">Melhor avaliadas</option>
            <option value="title">Título (A-Z)</option>
          </select>
        </div>

        <div className="mt-4 rounded-xl border border-border bg-surface p-4">
          <Chips value={kind} onChange={setKind} />
        </div>

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
              onRemove={() => remove.mutate(i.series.id)}
            />
          ))}
        </div>
        <Pager page={page} pages={Math.max(1, Math.ceil(filtered.length / 24))} onChange={setPage} />
        {filtered.length === 0 ? (
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
