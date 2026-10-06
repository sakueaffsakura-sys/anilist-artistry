import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpen, Clock, History, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { SiteFooter, SiteHeader } from "@/components/SiteHeader";
import { Chips, PageTitle } from "@/components/LibraryBits";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/useAuth";
import { coverUrl, formatChapter, timeAgo } from "@/lib/media";

export const Route = createFileRoute("/_authenticated/historico")({
  staticData: { sitemap: false },
  head: () => ({
    meta: [
      { title: "Histórico — Better Mangá" },
      { name: "description", content: "As últimas obras e capítulos que você abriu no Better Mangá." },
      { property: "og:title", content: "Histórico — Better Mangá" },
      { property: "og:description", content: "Últimas obras que você abriu." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Historico,
});

type Row = {
  updated_at: string;
  series_id: string;
  chapters: { number: number } | null;
  series: { id: string; slug: string; title: string; cover_url: string | null; kind: string };
};

function Historico() {
  const { user } = useSession();
  const qc = useQueryClient();
  const [kind, setKind] = useState("Todos");
  const [onlyChapter, setOnlyChapter] = useState(false);

  const history = useQuery({
    queryKey: ["hist-page", user?.id],
    enabled: Boolean(user),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reading_history")
        .select("updated_at, series_id, chapters(number), series!inner(id, slug, title, cover_url, kind)")
        .eq("user_id", user!.id)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Row[];
    },
  });

  const entries = useMemo(() => {
    const seen = new Set<string>();
    return (history.data ?? []).filter((r) => {
      if (seen.has(r.series_id)) return false;
      seen.add(r.series_id);
      return true;
    });
  }, [history.data]);

  const filtered = entries.filter(
    (e) => (kind === "Todos" || e.series.kind === kind) && (!onlyChapter || e.chapters),
  );

  const invalidate = () => qc.invalidateQueries({ queryKey: ["hist-page"] });
  const removeOne = useMutation({
    mutationFn: async (id: string) => {
      { const { error: dbErr } = await supabase.from("reading_history").delete().eq("user_id", user!.id).eq("series_id", id); if (dbErr) throw dbErr; }
    },
    onSuccess: invalidate,
  });
  const clearAll = useMutation({
    mutationFn: async () => {
      { const { error: dbErr } = await supabase.from("reading_history").delete().eq("user_id", user!.id); if (dbErr) throw dbErr; }
    },
    onSuccess: () => {
      invalidate();
      toast.success("Histórico limpo");
    },
  });

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-7xl px-4 py-10">
        <PageTitle
          icon={<History className="h-7 w-7" />}
          title="Histórico"
          subtitle="Últimas obras que abriste"
          right={
            <Button variant="outline" onClick={() => clearAll.mutate()} disabled={entries.length === 0}>
              <Trash2 className="mr-2 h-4 w-4" /> Limpar histórico
            </Button>
          }
        />
        <p className="mb-6 text-sm text-muted-foreground">
          Clique na capa ou no título para abrir. Passe o rato na capa para remover.
        </p>

        <div className="rounded-xl border border-border bg-surface p-5">
          <p className="mb-2 text-xs font-semibold text-muted-foreground">Formato</p>
          <Chips value={kind === "Todos" ? "Todas" : kind} onChange={(v) => setKind(v === "Todas" ? "Todos" : v)} options={["Todas", "Comic", "Manga", "Manhwa", "Manhua", "Shoujo", "Yaoi", "Yuri", "Novel"]} />
          <div className="mt-4 flex items-center justify-end gap-2">
            <button
              onClick={() => setOnlyChapter(false)}
              className={`rounded-full border px-3 py-1 text-xs font-semibold ${!onlyChapter ? "border-primary bg-primary/15 text-primary" : "border-border"}`}
            >
              Obras todas
            </button>
            <button
              onClick={() => setOnlyChapter(true)}
              className={`flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-semibold ${onlyChapter ? "border-primary bg-primary/15 text-primary" : "border-border"}`}
            >
              <BookOpen className="h-3.5 w-3.5" /> Só com capítulo
            </button>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            {filtered.length} de {entries.length} entradas
          </p>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {filtered.map((e) => (
            <div key={e.series_id} className="group">
              <div className="relative overflow-hidden rounded-xl border border-border">
                <Link to="/obra/$slug" params={{ slug: e.series.slug }}>
                  <img src={coverUrl(e.series.cover_url)} alt={e.series.title} className="aspect-[2/3] w-full object-cover" loading="lazy" />
                </Link>
                <span className="absolute left-2 top-2 flex items-center gap-1 rounded-md bg-background/85 px-2 py-0.5 text-[11px] font-bold backdrop-blur">
                  <Clock className="h-3 w-3" /> {timeAgo(e.updated_at)}
                </span>
                <button
                  onClick={() => removeOne.mutate(e.series_id)}
                  aria-label="Remover do histórico"
                  className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-full bg-background/85 opacity-0 transition-opacity group-hover:opacity-100 hover:text-destructive"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <Link to="/obra/$slug" params={{ slug: e.series.slug }} className="mt-2 line-clamp-2 block text-sm font-bold hover:text-primary">
                {e.series.title}
              </Link>
              {e.chapters ? (
                <Link
                  to="/obra/$slug/$chapter"
                  params={{ slug: e.series.slug, chapter: formatChapter(e.chapters.number) }}
                  className="mt-2 flex items-center justify-between rounded-lg bg-surface-2 px-3 py-2 text-xs hover:bg-surface-2/70"
                >
                  <span className="font-bold">Cap. {formatChapter(e.chapters.number)}</span>
                  <span className="text-muted-foreground">{timeAgo(e.updated_at)}</span>
                </Link>
              ) : null}
            </div>
          ))}
        </div>
        {filtered.length === 0 ? (
          <p className="mt-10 text-center text-sm text-muted-foreground">Nenhuma leitura registrada ainda.</p>
        ) : null}
      </main>
      <SiteFooter />
    </div>
  );
}
