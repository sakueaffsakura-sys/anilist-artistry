import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { BookOpen, Download, Eye, Layers, Search, Users, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { AdminShell, StatCard } from "@/components/AdminShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { searchAnilist, searchAnilistSmart, type AnilistResult } from "@/lib/anilist.functions";
import { coverUrl, timeAgo } from "@/lib/media";
import { findByAnilistId, uniqueSlug } from "@/lib/series-import";
import { useRoles, useSession } from "@/hooks/useAuth";
import { KINDS } from "@/lib/queries";

export const Route = createFileRoute("/_authenticated/admin/")({
  staticData: { sitemap: false },
  head: () => ({
    meta: [
      { title: "Painel de administração — Better Mangá" },
      { name: "description", content: "Visão geral do site, importação do AniList e gestão do catálogo." },
      { property: "og:title", content: "Painel — Better Mangá" },
      { property: "og:description", content: "Visão geral e importação AniList." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminPage,
});

function AdminPage() {
  const { user } = useSession();
  const { isStaff } = useRoles(user?.id);
  const queryClient = useQueryClient();
  const anilist = useServerFn(searchAnilist);
  const [term, setTerm] = useState("");
  const [results, setResults] = useState<AnilistResult[]>([]);
  const [kind, setKind] = useState<string>("Manga");

  const stats = useQuery({
    queryKey: ["admin-stats"],
    enabled: isStaff,
    queryFn: async () => {
      const [s, c, p, recent] = await Promise.all([
        supabase.from("series").select("views"),
        supabase.from("chapters").select("id", { count: "exact", head: true }),
        supabase.from("profiles").select("id", { count: "exact", head: true }),
        supabase.from("series").select("id, title, cover_url, kind, updated_at, published").order("updated_at", { ascending: false }).limit(6),
      ]);
      return {
        series: s.data?.length ?? 0,
        views: (s.data ?? []).reduce((a, r) => a + (r.views ?? 0), 0),
        chapters: c.count ?? 0,
        users: p.count ?? 0,
        recent: recent.data ?? [],
      };
    },
  });

  const search = useMutation({
    mutationFn: async () => searchAnilistSmart(term.trim(), anilist),
    onSuccess: (data) => {
      setResults(data);
      if (data.length === 0) toast.info("Nenhum resultado no AniList.");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro na busca"),
  });

  const importSeries = useMutation({
    mutationFn: async (item: AnilistResult) => {
      const existing = await findByAnilistId(item.anilistId);
      if (existing) throw new Error("Essa obra já está no catálogo.");
      const { error } = await supabase.from("series").insert({
        anilist_id: item.anilistId,
        slug: await uniqueSlug(item.title, `obra-${item.anilistId}`),
        title: item.title,
        alt_titles: item.altTitles,
        synopsis: item.synopsis,
        cover_url: item.coverUrl,
        banner_url: item.bannerUrl,
        genres: item.genres,
        status: item.status,
        author: item.author,
        artist: item.artist,
        rating: item.averageScore,
        kind,
        published: true,
        created_by: user?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Obra importada do AniList!");
      queryClient.invalidateQueries({ queryKey: ["admin-stats"] });
      queryClient.invalidateQueries({ queryKey: ["admin-series"] });
    },
    onError: (e) =>
      toast.error(e instanceof Error ? (e.message.includes("duplicate") ? "Essa obra já está no catálogo." : e.message) : "Não foi possível importar."),
  });

  const d = stats.data;
  const fmt = (n: number) => n.toLocaleString("pt-BR");

  return (
    <AdminShell title="Visão geral" subtitle="Acompanhe o site e importe novas obras do AniList.">
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard label="Obras" value={d ? fmt(d.series) : "—"} icon={<BookOpen className="h-5 w-5" />} />
        <StatCard label="Capítulos" value={d ? fmt(d.chapters) : "—"} icon={<Layers className="h-5 w-5" />} />
        <StatCard label="Visualizações" value={d ? fmt(d.views) : "—"} icon={<Eye className="h-5 w-5" />} />
        <StatCard label="Contas" value={d ? fmt(d.users) : "—"} icon={<Users className="h-5 w-5" />} />
      </div>

      <section className="mt-6 rounded-2xl border border-border bg-surface p-5">
        <h2 className="flex items-center gap-2 font-display text-lg font-extrabold">
          <Download className="h-5 w-5 text-primary" /> Importar do AniList
        </h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (term.trim()) search.mutate();
          }}
          className="mt-4 flex flex-wrap gap-3"
        >
          <div className="relative min-w-56 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Nome da obra ou link do AniList (anilist.co/manga/...)" className="h-11 bg-background pl-9" />
          </div>
          <select value={kind} onChange={(e) => setKind(e.target.value)} className="h-11 rounded-md border border-border bg-background px-3 text-sm font-semibold">
            {KINDS.map((k) => (
              <option key={k} value={k}>{k}</option>
            ))}
          </select>
          <Button type="submit" disabled={search.isPending} className="h-11 px-6 font-semibold">
            {search.isPending ? "Buscando…" : "Buscar"}
          </Button>
        </form>
        {results.length > 0 ? (
          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {results.map((item) => (
              <div key={item.anilistId} className="flex gap-3 rounded-xl border border-border bg-background p-3">
                <img src={coverUrl(item.coverUrl)} alt={item.title} className="h-32 w-22 shrink-0 rounded-lg object-cover" />
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-sm font-bold">{item.title}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{item.status} · nota {item.averageScore || "—"}</p>
                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{item.synopsis}</p>
                  <Button size="sm" className="mt-2 font-semibold" disabled={importSeries.isPending} onClick={() => importSeries.mutate({ ...item })}>
                    Publicar como {kind}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </section>

      <section className="mt-6 rounded-2xl border border-border bg-surface p-5">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg font-extrabold">Atualizadas recentemente</h2>
          <Link to="/admin/obras" className="flex items-center gap-1 text-sm font-semibold text-primary">
            Todas as obras <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-4 sm:grid-cols-6">
          {(d?.recent ?? []).map((r) => (
            <Link key={r.id} to="/admin/$id" params={{ id: r.id }} className="group">
              <div className="relative aspect-[2/3] overflow-hidden rounded-xl border border-border">
                <img src={coverUrl(r.cover_url)} alt={r.title} className="h-full w-full object-cover transition-transform group-hover:scale-105" />
                {!r.published ? (
                  <span className="absolute left-1.5 top-1.5 rounded bg-background/90 px-1.5 text-[10px] font-bold text-muted-foreground">Rascunho</span>
                ) : null}
              </div>
              <p className="mt-2 line-clamp-1 text-xs font-bold group-hover:text-primary">{r.title}</p>
              <p className="text-[11px] text-muted-foreground">{timeAgo(r.updated_at)}</p>
            </Link>
          ))}
        </div>
      </section>
    </AdminShell>
  );
}
