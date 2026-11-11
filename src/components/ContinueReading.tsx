import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowRight, BookMarked, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { coverUrl, formatChapter } from "@/lib/media";
import { toast } from "sonner";
import { activeProfileId } from "@/lib/active-profile";
import { HScroll, SectionRow, shelfItem } from "@/components/SectionRow";

export type ContinueRow = {
  progress: number;
  updated_at: string;
  chapter_id: string | null;
  chapters: { id: string; number: number } | null;
  series: { id: string; slug: string; title: string; cover_url: string | null; chapter_count: number };
};

/** Continuar lendo: capa com a barra de andamento, o capítulo onde parou e o atalho para voltar a ele. */
export function ContinueReading({ rows, userId }: { rows: ContinueRow[]; userId: string }) {
  const queryClient = useQueryClient();
  const [hiding, setHiding] = useState<string | null>(null);

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

  if (rows.length === 0) return null;

  return (
    <SectionRow
      icon={<BookMarked />}
      title="Continuar lendo"
      action={<Link to="/historico" className="see-all">Histórico <ArrowRight className="h-3.5 w-3.5" /></Link>}
    >
      <HScroll>
        {rows.map((row) => {
          const total = row.series.chapter_count ?? 0;
          const current = row.chapters?.number ?? 0;
          const pct = total > 0 ? Math.min(100, (current / total) * 100) : 0;
          return (
            <div key={row.series.id} className={`${shelfItem} group`}>
              <div className="relative">
                <Link to="/obra/$slug" params={{ slug: row.series.slug }} className="series-cover relative block aspect-[2/3] overflow-hidden rounded-md">
                  <img src={coverUrl(row.series.cover_url)} alt={row.series.title} loading="lazy" decoding="async" className="h-full w-full object-cover" />
                  <div className="absolute inset-x-0 bottom-0 series-cover-shade px-1.5 pb-1.5 pt-6">
                    <div className="h-1 w-full overflow-hidden rounded-full bg-cover-foreground/20">
                      <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(pct, 3)}%` }} />
                    </div>
                  </div>
                </Link>
                <button
                  type="button"
                  title="Tirar de Continuar lendo"
                  aria-label={`Tirar ${row.series.title} de Continuar lendo`}
                  disabled={hiding === row.series.id}
                  onClick={() => void hide(row.series.id)}
                  className="continue-reading-hide absolute right-1.5 top-1.5 grid h-7 w-7 place-items-center rounded-full text-cover-foreground disabled:opacity-60"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              <h3 className="mt-2 line-clamp-2 text-[13px] font-semibold leading-snug sm:text-sm">
                <Link to="/obra/$slug" params={{ slug: row.series.slug }} className="hover:text-primary">{row.series.title}</Link>
              </h3>
              {row.chapters ? (
                <Link
                  to="/obra/$slug/$chapter"
                  params={{ slug: row.series.slug, chapter: formatChapter(row.chapters.number) }}
                  className="card-meta mt-1 font-semibold text-primary hover:underline"
                >
                  Cap. {formatChapter(current)}{total ? ` de ${total.toLocaleString("pt-BR")}` : ""}
                </Link>
              ) : null}
            </div>
          );
        })}
      </HScroll>
    </SectionRow>
  );
}
