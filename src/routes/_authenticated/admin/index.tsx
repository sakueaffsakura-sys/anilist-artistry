import { workSaveError } from "@/lib/work-save-error";
import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { BookOpen, Download, Eye, Layers, Search, Users, ArrowRight, Plus, BookText, ArrowUpRight, CircleDot } from "lucide-react";
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
import { normalizeGenres } from "@/lib/work-genres";
import { anilistMetrics } from "@/lib/home-sections";

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
  const [kind, setKind] = useState<string>("automatic");

  const stats = useQuery({
    queryKey: ["admin-stats"],
    enabled: isStaff,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const [s, c, p, recent] = await Promise.all([
        supabase.from("series").select("views"),
        supabase.from("chapters").select("id", { count: "exact", head: true }),
        supabase.from("profiles").select("id", { count: "exact", head: true }),
        supabase.from("series").select("id, title, cover_url, kind, updated_at, published").order("updated_at", { ascending: false }).limit(6),
      ]);
      const failure = [s, c, p, recent].find((result) => result.error);
      if (failure?.error) throw failure.error;
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
        genres: normalizeGenres(item.genres),
        status: item.status,
        author: item.author,
        artist: item.artist,
        rating: item.averageScore,
        ...anilistMetrics(item),
        kind: kind === "automatic" ? item.suggestedKind : kind,
        published: true,
        created_by: user?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Obra importada do AniList!");
      queryClient.invalidateQueries({ queryKey: ["admin-stats"] });
      queryClient.invalidateQueries({ queryKey: ["admin-series"] });
      queryClient.invalidateQueries({ queryKey: ["home-sections"] });
      queryClient.invalidateQueries({ queryKey: ["section-admin-works"] });
    },
    onError: (e) =>
      toast.error(workSaveError(e, "Não foi possível importar.")),
  });

  const d = stats.data;
  const fmt = (n: number) => n.toLocaleString("pt-BR");

  return (
    <AdminShell title="Visão geral" subtitle="Seu catálogo, em um só lugar." actions={<Button asChild><Link to="/admin/nova"><Plus className="h-4 w-4" /> Nova obra</Link></Button>}>
      <div className="admin-metrics grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard label="Obras" value={d ? fmt(d.series) : "—"} icon={<BookOpen className="h-5 w-5" />} />
        <StatCard label="Capítulos" value={d ? fmt(d.chapters) : "—"} icon={<Layers className="h-5 w-5" />} />
        <StatCard label="Visualizações" value={d ? fmt(d.views) : "—"} icon={<Eye className="h-5 w-5" />} />
        <StatCard label="Contas" value={d ? fmt(d.users) : "—"} icon={<Users className="h-5 w-5" />} />
      </div>

      {stats.isError ? <div role="alert" className="mt-5 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">Não foi possível carregar os totais.<Button variant="outline" size="sm" onClick={() => void stats.refetch()}>Tentar novamente</Button></div> : null}
      <div className="mt-9 grid min-w-0 grid-cols-1 gap-8 xl:grid-cols-[minmax(0,1fr)_260px]">
      <section className="min-w-0">
        <h2 className="flex items-center gap-2 font-display text-lg font-bold">
          <Download className="h-5 w-5 text-primary" /> Importação AniList
        </h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (term.trim()) search.mutate();
          }}
          className="mt-5 flex flex-wrap gap-3 border-y border-border py-5"
        >
          <div className="relative min-w-0 basis-full sm:basis-auto sm:flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={term} onChange={(e) => setTerm(e.target.value)} aria-label="Buscar no AniList" placeholder="Nome ou link do AniList…" className="h-11 bg-background pl-9" />
          </div>
          <select aria-label="Tipo da importação" value={kind} onChange={(e) => setKind(e.target.value)} className="h-11 rounded-md border border-border bg-background px-3 text-sm font-semibold">
            <option value="automatic">Tipo automático (AniList)</option>
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
              <div key={item.anilistId} className="flex gap-3 rounded-lg border border-border bg-surface p-3">
                <img src={coverUrl(item.coverUrl)} alt={item.title} loading="lazy" decoding="async" className="h-32 w-22 shrink-0 rounded-lg object-cover" />
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-sm font-bold">{item.title}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{item.status} · nota {item.averageScore || "—"}</p>
                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{item.synopsis}</p>
                  <Button size="sm" className="mt-2 font-semibold" disabled={importSeries.isPending} onClick={() => importSeries.mutate({ ...item })}>
                    Publicar como {kind === "automatic" ? item.suggestedKind : kind}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </section>

      <aside className="border-l-0 border-border xl:border-l xl:pl-7"><h2 className="mb-5 flex items-center gap-2 font-display text-sm font-bold"><CircleDot className="h-4 w-4 text-primary" /> Acesso rápido</h2><div className="grid grid-cols-1 gap-1 sm:grid-cols-3 xl:grid-cols-1">{([{ to: "/admin/obras", label: "Gerenciar catálogo", icon: BookOpen }, { to: "/admin/novels", label: "Publicar novels", icon: BookText }, { to: "/admin/nova", label: "Cadastrar obra", icon: Plus }] as const).map((item) => <Button asChild key={item.to} variant="ghost" className="h-12 w-full justify-start gap-3 border-b border-border rounded-none text-xs"><Link to={item.to}><item.icon className="h-4 w-4 text-muted-foreground" /><span className="flex-1 text-left">{item.label}</span><ArrowUpRight className="h-3 w-3 text-primary" /></Link></Button>)}</div></aside>
      </div>
      <section className="mt-10 border-t border-border pt-7">
        <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-display text-lg font-bold">Últimas movimentações</h2><Button asChild variant="ghost" size="sm"><Link to="/admin/obras">Ver catálogo <ArrowRight className="h-4 w-4" /></Link></Button></div>
        <div className="mt-5 grid grid-cols-1 gap-x-8 lg:grid-cols-2">{(d?.recent ?? []).map((r) => <Link key={r.id} to="/admin/$id" params={{ id: r.id }} className="group flex min-w-0 items-center gap-4 border-b border-border py-4"><img src={coverUrl(r.cover_url)} alt={r.title} loading="lazy" decoding="async" className="h-16 w-11 shrink-0 rounded-md object-cover" /><div className="min-w-0 flex-1"><p className="line-clamp-2 text-sm font-bold group-hover:text-primary">{r.title}</p><p className="mt-1 text-xs text-muted-foreground">{r.kind} · {timeAgo(r.updated_at)}</p></div><span className={`shrink-0 rounded-md px-2 py-1 text-[10px] font-bold ${r.published ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>{r.published ? "Publicada" : "Rascunho"}</span><ArrowUpRight className="hidden h-4 w-4 text-muted-foreground sm:block" /></Link>)}</div>
        {stats.isPending ? <p role="status" className="py-8 text-sm text-muted-foreground">Carregando catálogo…</p> : null}
      </section>
    </AdminShell>
  );
}
