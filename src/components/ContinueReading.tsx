import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQueries, useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { coverUrl, formatChapter } from "@/lib/media";
import { toast } from "sonner";
import { activeProfileId } from "@/lib/active-profile";

export type ContinueRow = {
  progress: number;
  updated_at: string;
  chapter_id: string | null;
  chapters: { id: string; number: number } | null;
  series: { id: string; slug: string; title: string; cover_url: string | null; chapter_count: number };
};

/** Quantas obras a seção busca o capítulo seguinte (a grade mostra 4; no celular dá para rolar). */
const VISIBLE = 8;

/** Continue lendo: capa, quanto já foi lido, barra de andamento e o atalho para o próximo capítulo. */
export function ContinueReading({ rows, userId }: { rows: ContinueRow[]; userId: string }) {
  const queryClient = useQueryClient();
  const [hiding, setHiding] = useState<string | null>(null);
  const shown = rows.slice(0, VISIBLE);

  // O capítulo seguinte ao que a pessoa parou (um pedido pequeno por obra mostrada).
  const nextChapters = useQueries({
    queries: shown.map((row) => ({
      queryKey: ["next-chapter", row.series.id, row.chapters?.number ?? null],
      enabled: Boolean(row.chapters),
      staleTime: 5 * 60_000,
      queryFn: async () => {
        const { data, error } = await supabase
          .from("chapters")
          .select("id, number")
          .eq("series_id", row.series.id)
          .eq("published", true)
          .gt("number", row.chapters?.number ?? 0)
          .order("number", { ascending: true })
          .limit(1);
        if (error) throw error;
        return data?.[0] ?? null;
      },
    })),
  });

  async function hide(seriesId: string) {
    setHiding(seriesId);
    const { error } = await supabase
      .from("reading_history")
      .delete()
      .eq("user_id", userId).eq("profile_id", activeProfileId())
      .eq("series_id", seriesId);
    setHiding(null);
    if (error) {
      toast.error("Não foi possível ocultar.");
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ["history", userId] });
  }

  if (shown.length === 0) return null;

  return (
    <section className="home-section" aria-labelledby="continue-title">
      <div className="home-section-head">
        <div className="home-section-title"><h2 id="continue-title">Continue lendo</h2></div>
        <div className="home-section-actions">
          <Link to="/historico" className="see-all">Ver tudo →</Link>
        </div>
      </div>
      <div className="continue-grid">
        {shown.map((row, position) => {
          const total = row.series.chapter_count ?? 0;
          const current = row.chapters?.number ?? 0;
          const pct = total > 0 ? Math.min(100, (current / total) * 100) : 0;
          const left = Math.max(0, total - current);
          const next = nextChapters[position]?.data ?? null;
          const target = next ?? row.chapters;
          return (
            <article key={row.series.id} className="continue-card">
              <Link to="/obra/$slug" params={{ slug: row.series.slug }} className="continue-cover">
                <img src={coverUrl(row.series.cover_url)} alt={row.series.title} loading="lazy" decoding="async" />
              </Link>
              <div className="continue-info">
                <h3><Link to="/obra/$slug" params={{ slug: row.series.slug }}>{row.series.title}</Link></h3>
                <p className="continue-count">
                  {total > 0
                    ? `${formatChapter(current)} de ${total.toLocaleString("pt-BR")} · faltam ${left.toLocaleString("pt-BR")}`
                    : `Capítulo ${formatChapter(current)}`}
                </p>
                <div className="continue-bar" role="progressbar" aria-label="Andamento da leitura" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)}>
                  <span style={{ width: `${Math.max(pct, 1)}%` }} />
                </div>
                {target ? (
                  <Link
                    to="/obra/$slug/$chapter"
                    params={{ slug: row.series.slug, chapter: formatChapter(target.number) }}
                    className="continue-go"
                  >
                    Continuar · Cap. {formatChapter(target.number)}
                  </Link>
                ) : (
                  <Link to="/obra/$slug" params={{ slug: row.series.slug }} className="continue-go">Continuar</Link>
                )}
              </div>
              <button
                type="button"
                className="continue-hide"
                title="Tirar de Continue lendo"
                aria-label={`Tirar ${row.series.title} de Continue lendo`}
                disabled={hiding === row.series.id}
                onClick={() => void hide(row.series.id)}
              >
                <X aria-hidden="true" />
              </button>
            </article>
          );
        })}
      </div>
    </section>
  );
}
