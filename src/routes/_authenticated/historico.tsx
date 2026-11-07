import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { History, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { SiteFooter, SiteHeader } from "@/components/SiteHeader";
import { PageTitle } from "@/components/LibraryBits";
import { kindLabel } from "@/lib/work-categories";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/useAuth";
import { coverUrl, formatChapter, timeAgo } from "@/lib/media";
import { activeProfileId } from "@/lib/active-profile";

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
        .eq("user_id", user!.id).eq("profile_id", activeProfileId())
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

  const kinds = useMemo(() => ["Todos", ...new Set(entries.map((e) => kindLabel(e.series.kind)).filter(Boolean))], [entries]);
  const filtered = entries.filter(
    (e) => (kind === "Todos" || kindLabel(e.series.kind) === kind) && (!onlyChapter || e.chapters),
  );

  const invalidate = () => qc.invalidateQueries({ queryKey: ["hist-page"] });
  const removeOne = useMutation({
    mutationFn: async (id: string) => {
      { const { error: dbErr } = await supabase.from("reading_history").delete().eq("user_id", user!.id).eq("profile_id", activeProfileId()).eq("series_id", id); if (dbErr) throw dbErr; }
    },
    onSuccess: invalidate,
  });
  const clearAll = useMutation({
    mutationFn: async () => {
      { const { error: dbErr } = await supabase.from("reading_history").delete().eq("user_id", user!.id).eq("profile_id", activeProfileId()); if (dbErr) throw dbErr; }
    },
    onSuccess: () => {
      invalidate();
      toast.success("Histórico limpo");
    },
  });

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="site-content mx-auto max-w-7xl px-4 py-6 sm:px-6 md:py-8 lg:px-8">
        <PageTitle
          icon={<History />}
          title="Histórico"
          subtitle="Obras que você abriu, da mais recente para a mais antiga."
          right={
            <Button variant="secondary" size="sm" onClick={() => clearAll.mutate()} disabled={entries.length === 0 || clearAll.isPending}>
              <Trash2 className="h-4 w-4" /> Limpar
            </Button>
          }
        />

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="chip-row" role="group" aria-label="Formato">
            {kinds.map((k) => <button key={k} type="button" className="chip chip-sm" aria-pressed={kind === k} onClick={() => setKind(k)}>{k === "Todos" ? "Todos" : k}</button>)}
          </div>
          <div className="flex gap-1.5">
            <button type="button" className="chip chip-sm" aria-pressed={!onlyChapter} onClick={() => setOnlyChapter(false)}>Todas</button>
            <button type="button" className="chip chip-sm" aria-pressed={onlyChapter} onClick={() => setOnlyChapter(true)}>Só com capítulo</button>
          </div>
        </div>
        <p className="mt-3 text-[13px] text-muted-foreground">{filtered.length.toLocaleString("pt-BR")} de {entries.length.toLocaleString("pt-BR")} obras</p>

        <div className="mt-4 grid grid-cols-3 gap-x-3 gap-y-5 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
          {filtered.map((e) => (
            <div key={e.series_id} className="group min-w-0">
              <div className="relative">
                <Link to="/obra/$slug" params={{ slug: e.series.slug }} className="series-cover block aspect-[2/3] overflow-hidden rounded-md">
                  <img src={coverUrl(e.series.cover_url)} alt={e.series.title} className="h-full w-full object-cover" loading="lazy" decoding="async" />
                </Link>
                <span className="cover-badge absolute bottom-1.5 left-1.5">{timeAgo(e.updated_at)}</span>
                <button
                  type="button"
                  onClick={() => removeOne.mutate(e.series_id)}
                  aria-label={`Tirar ${e.series.title} do histórico`}
                  title="Tirar do histórico"
                  className="absolute right-1.5 top-1.5 grid h-7 w-7 place-items-center rounded-full bg-cover-overlay text-cover-foreground hover:text-destructive md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              <h3 className="mt-2 line-clamp-2 text-[13px] font-semibold leading-snug sm:text-sm">
                <Link to="/obra/$slug" params={{ slug: e.series.slug }} className="hover:text-primary">{e.series.title}</Link>
              </h3>
              {e.chapters ? (
                <Link
                  to="/obra/$slug/$chapter"
                  params={{ slug: e.series.slug, chapter: formatChapter(e.chapters.number) }}
                  className="card-meta mt-1 font-semibold text-primary hover:underline"
                >
                  Continuar no cap. {formatChapter(e.chapters.number)}
                </Link>
              ) : null}
            </div>
          ))}
        </div>
        {history.isSuccess && filtered.length === 0 ? (
          <p className="mt-10 text-center text-sm text-muted-foreground">Nenhuma leitura registrada ainda.</p>
        ) : null}
      </main>
      <SiteFooter />
    </div>
  );
}
