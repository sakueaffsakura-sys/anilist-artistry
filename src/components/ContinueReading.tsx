import { useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { BookMarked, ChevronLeft, ChevronRight, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { coverUrl, formatChapter } from "@/lib/media";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { activeProfileId } from "@/lib/active-profile";

export type ContinueRow = {
  progress: number;
  updated_at: string;
  chapter_id: string | null;
  chapters: { id: string; number: number } | null;
  series: { id: string; slug: string; title: string; cover_url: string | null; chapters: Array<{ count: number }> };
};

export function ContinueReading({ rows, userId }: { rows: ContinueRow[]; userId: string }) {
  const scroller = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  const [hiding, setHiding] = useState<string | null>(null);

  const scrollBy = (delta: number) =>
    scroller.current?.scrollBy({ left: delta, behavior: "smooth" });

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
    <section aria-label="Continue lendo" className="relative min-w-0 max-w-full pb-4 md:pb-8">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-2">
          <h2 className="section-title shrink-0"><BookMarked className="h-[18px] w-[18px]" />Continue lendo</h2>
        </div>
        <div className="hidden shrink-0 items-center gap-2 md:flex">
           <Button
             variant="ghost"
             size="icon"
            type="button"
            title="Anterior"
             aria-label="Anterior"
            onClick={() => scrollBy(-420)}
             className="h-[38px] w-[38px] rounded-full border border-foreground/10 bg-card/40 text-muted-foreground shadow-sm transition-all duration-200 hover:scale-110 hover:border-foreground/20 hover:bg-card/60 hover:text-foreground active:scale-95 motion-reduce:transform-none motion-reduce:transition-none [&_svg]:size-5"
          >
            <ChevronLeft className="h-5 w-5" />
           </Button>
           <Button
             variant="ghost"
             size="icon"
            type="button"
            title="Próximo"
             aria-label="Próximo"
            onClick={() => scrollBy(420)}
             className="h-[38px] w-[38px] rounded-full border border-foreground/10 bg-card/40 text-muted-foreground shadow-sm transition-all duration-200 hover:scale-110 hover:border-foreground/20 hover:bg-card/60 hover:text-foreground active:scale-95 motion-reduce:transform-none motion-reduce:transition-none [&_svg]:size-5"
          >
            <ChevronRight className="h-5 w-5" />
           </Button>
        </div>
      </div>

       <div className="relative -mx-4 py-3 md:-mx-8">
         <div className="pointer-events-none absolute inset-y-0 right-0 z-10 hidden w-16 bg-gradient-to-l from-background to-transparent md:block" />
        <div
          ref={scroller}
           className="no-scrollbar overflow-x-auto overscroll-x-contain pb-4 pl-4 pr-2 pt-1 sm:pr-4 md:px-8 md:pt-3"
        >
          <div className="flex gap-4 sm:gap-6">
            {rows.map((row) => {
              const total = row.series.chapters[0]?.count ?? 0;
              const current = row.chapters?.number ?? 0;
              const pct = total > 0 ? Math.min(100, (current / total) * 100) : 0;
              return (
                <div
                  key={row.series.id}
                   className="continue-reading-card group relative flex h-full w-[160px] min-w-[160px] max-w-[160px] shrink-0 flex-col rounded-md transition-[transform,box-shadow] duration-200 ease-out hover:z-[5] hover:-translate-y-1.5 motion-reduce:transform-none motion-reduce:transition-none"
                >
                  <Link
                    to="/obra/$slug"
                    params={{ slug: row.series.slug }}
                    className="relative block aspect-[2/3] w-full shrink-0 overflow-hidden rounded-md border border-foreground/10 bg-card/60 text-left no-underline transition-transform duration-200 ease-out active:scale-[0.98]"
                  >
                    <img
                      src={coverUrl(row.series.cover_url)}
                      alt={row.series.title}
                       loading="lazy"
                      decoding="async"
                      className="h-full w-full object-cover transition-[transform,filter] duration-300 ease-out group-hover:scale-[1.04] group-hover:brightness-110"
                    />
                     <div className="continue-reading-shade pointer-events-none absolute inset-0" />
                   </Link>
                     <Button
                       variant="ghost"
                       size="icon"
                      type="button"
                      title="Ocultar do Continue lendo"
                       aria-label={`Ocultar ${row.series.title} do Continue lendo`}
                      disabled={hiding === row.series.id}
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        void hide(row.series.id);
                      }}
                       className="continue-reading-hide absolute right-2 top-2 z-20 h-8 w-8 rounded-full border border-foreground/10 text-foreground/60 shadow-md backdrop-blur-md transition-all hover:border-destructive/40 hover:text-destructive md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100 motion-reduce:transition-none [&_svg]:size-3.5"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                     </Button>
                     <span className="continue-reading-counter pointer-events-none absolute left-2 top-[210px] z-[12] inline-flex items-center gap-1.5 rounded-full border border-foreground/15 px-2 py-1 text-foreground shadow-sm backdrop-blur-2xl">
                       <BookMarked className="h-2.5 w-2.5 shrink-0" strokeWidth={2.5} />
                       <span className="text-[10px] font-extrabold tabular-nums leading-none">
                        {formatChapter(current)}/{formatChapter(total)}
                      </span>
                    </span>
                  <div className="mt-2 px-0.5">
                    <div className="h-1 w-full overflow-hidden rounded-full bg-foreground/10">
                      <div
                        className="h-1 rounded-full bg-primary transition-all duration-500"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                  <div className="pb-2" />
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
