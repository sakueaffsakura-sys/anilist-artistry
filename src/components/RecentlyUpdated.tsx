import { Link } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { BookOpen, Clock, Heart, Pin, Star } from "lucide-react";
import { toast } from "sonner";
import type { SeriesRow } from "@/lib/queries";
import { supabase } from "@/integrations/supabase/client";
import { coverUrl, formatChapter, timeAgo } from "@/lib/media";
import { useSession } from "@/hooks/useAuth";
import { HScroll, SectionRow } from "@/components/SectionRow";
import { selectRecentUpdates } from "@/lib/recent-updates";

export function RecentlyUpdated({ rows }: { rows: SeriesRow[] }) {
  const { user } = useSession();
  const queryClient = useQueryClient();

  const toggleFav = useMutation({
    mutationFn: async ({ seriesId, isFav }: { seriesId: string; isFav: boolean }) => {
      if (!user) throw new Error("Entre na sua conta para favoritar.");
      if (isFav) {
        const { error } = await supabase
          .from("favorites")
          .delete()
          .eq("user_id", user.id)
          .eq("series_id", seriesId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("favorites")
          .insert({ user_id: user.id, series_id: seriesId });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["favorites"] });
      queryClient.invalidateQueries({ queryKey: ["favorite-ids"] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Erro ao favoritar"),
  });

  const onHeart = (e: React.MouseEvent, seriesId: string, isFav: boolean) => {
    e.preventDefault();
    e.stopPropagation();
    if (!user) {
      toast.info("Entre na sua conta para favoritar.");
      return;
    }
    toggleFav.mutate({ seriesId, isFav });
  };

  if (rows.length === 0) return null;

  return (
    <SectionRow icon={<Clock className="h-5 w-5" />} title="Atualizados Recentes">

      <HScroll>
        {selectRecentUpdates(rows).map((item) => {
          const [latest, previous] = item.chapters ?? [];
          return (
            <div
              key={item.id}
              className="group flex w-[160px] min-w-0 shrink-0 flex-col gap-2 rounded-[1.35rem] bg-card/40 transition-colors duration-200"
            >
              <Link
                to="/obra/$slug"
                params={{ slug: item.slug }}
                className="group/cover relative z-0 block aspect-[2/3] w-full shrink-0 overflow-hidden rounded-[1.35rem] border border-foreground/10 bg-surface-2/55 transition-[transform,box-shadow,border-color] duration-200 ease-out hover:z-20 hover:-translate-y-0.5 hover:border-foreground/25 hover:shadow-[0_18px_44px_rgba(0,0,0,0.5)] hover:will-change-transform focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary active:translate-y-0 active:shadow-none motion-reduce:hover:translate-y-0 motion-reduce:hover:shadow-none"
              >
                <img
                  alt={item.title}
                  loading="lazy"
                  decoding="async"
                  className="h-full w-full object-cover transition-transform duration-200 ease-out group-hover/cover:scale-105 motion-reduce:transition-none"
                  src={coverUrl(item.cover_url)}
                />
                {item.pinned ? (
                  <span
                    title="Fixada pelo admin"
                    className="pointer-events-none absolute left-2 top-2 z-[25] inline-flex items-center gap-1 rounded-full border border-gold/40 bg-black/50 px-2 py-1 text-[10px] font-extrabold uppercase tracking-wider text-gold shadow-[0_2px_10px_rgba(0,0,0,0.4)]"
                  >
                    <Pin className="h-[11px] w-[11px] shrink-0 fill-gold" strokeWidth={2.5} />
                    Fixada
                  </span>
                ) : null}
                <button
                  type="button"
                  title="Adicionar aos favoritos"
                  aria-label="Favoritar obra"
                  onClick={(e) => onHeart(e, item.id, false)}
                  className="group/fav absolute right-2 top-2 z-[30] flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-black/40 text-white/80 transition-[transform,colors,box-shadow,background-color] duration-200 ease-out hover:scale-110 hover:border-red-400/50 hover:bg-red-500/20 hover:text-red-300 hover:shadow-[0_0_18px_rgba(239,68,68,0.5)] active:scale-95 disabled:opacity-60 disabled:hover:scale-100 disabled:hover:shadow-none motion-reduce:hover:scale-100"
                >
                  <Heart
                    className="h-[18px] w-[18px] fill-transparent transition-[fill,transform] duration-200 group-hover/fav:scale-110 group-hover/fav:fill-red-400/60"
                    strokeWidth={2}
                  />
                </button>
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/10 opacity-90" />
                <span
                  className="pointer-events-none absolute bottom-2 left-2 z-[12] inline-flex max-w-[calc(100%-1rem)] items-center gap-2 rounded-full border border-white/15 bg-black/25 px-2 py-1 shadow-[0_2px_14px_rgba(0,0,0,0.45)]"
                  title={`${item.chapters?.length ?? 0} capítulos · média ${Number(item.rating).toFixed(1).replace(".", ",")}/10`}
                >
                  <span className="inline-flex shrink-0 items-center gap-1">
                    <BookOpen
                      className="h-[11px] w-[11px] shrink-0 text-white"
                      strokeWidth={2.5}
                    />
                    <span className="text-[10px] font-extrabold leading-none tabular-nums text-white">
                      {item.chapters?.length ?? 0}
                    </span>
                  </span>
                  <span className="h-3 w-px shrink-0 bg-white/20" aria-hidden="true" />
                  <span className="inline-flex min-w-0 shrink-0 items-center gap-0.5">
                    <Star className="h-[11px] w-[11px] shrink-0 fill-gold text-gold" />
                    <span className="text-[10px] font-extrabold leading-none tabular-nums text-gold">
                      {Number(item.rating).toFixed(1).replace(".", ",")}
                    </span>
                  </span>
                </span>
              </Link>

              <div className="flex min-h-0 flex-1 flex-col px-2 pt-1 sm:pt-2">
                <div className="min-h-[2.75rem] shrink-0">
                  <Link to="/obra/$slug" params={{ slug: item.slug }} className="block no-underline">
                    <h3 className="line-clamp-2 text-[15px] font-semibold leading-snug transition-colors group-hover:text-foreground/80 sm:text-[17px]">
                      {item.title}
                    </h3>
                  </Link>
                </div>
                <div className="mt-2 flex min-h-[5rem] flex-col gap-1.5 overflow-visible">
                  {latest ? (
                    <Link
                      to="/obra/$slug/$chapter"
                      params={{ slug: item.slug, chapter: formatChapter(latest.number) }}
                      className="group/cap relative z-0 flex min-h-[2.125rem] w-full origin-center transform-gpu items-center justify-between gap-1.5 rounded-lg bg-primary/10 px-2 py-1.5 text-xs no-underline ring-1 ring-primary/35 transition-[transform,colors,filter,box-shadow] duration-[350ms] ease-[cubic-bezier(0.22,1,0.36,1)] hover:z-10 hover:brightness-110 motion-safe:hover:scale-[1.035] motion-reduce:hover:scale-100 active:scale-[0.99] active:duration-[150ms] active:ease-out"
                    >
                      <span className="inline-flex min-w-0 flex-1 items-center gap-1 truncate text-left text-xs font-bold text-foreground/90 transition-colors duration-[350ms] ease-[cubic-bezier(0.22,1,0.36,1)] group-hover/cap:text-foreground">
                        Cap. {formatChapter(latest.number)}
                        <Star
                          className="h-[13px] w-[13px] shrink-0 fill-primary text-primary"
                          strokeWidth={1.5}
                        />
                      </span>
                      <span className="shrink-0 text-xs font-bold tabular-nums text-foreground/40 transition-colors duration-[350ms] ease-[cubic-bezier(0.22,1,0.36,1)] group-hover/cap:text-foreground/55">
                        {timeAgo(latest.created_at)}
                      </span>
                    </Link>
                  ) : null}
                  {previous ? (
                    <Link
                      to="/obra/$slug/$chapter"
                      params={{ slug: item.slug, chapter: formatChapter(previous.number) }}
                      className="group/cap relative z-0 flex min-h-[2.125rem] w-full origin-center transform-gpu items-center justify-between gap-1.5 rounded-lg bg-white/[0.05] px-2 py-1.5 text-xs no-underline transition-[transform,colors,filter,box-shadow] duration-[350ms] ease-[cubic-bezier(0.22,1,0.36,1)] hover:z-10 hover:bg-white/[0.09] motion-safe:hover:scale-[1.035] motion-reduce:hover:scale-100 active:scale-[0.99] active:duration-[150ms] active:ease-out"
                    >
                      <span className="inline-flex min-w-0 flex-1 items-center gap-1 truncate text-left text-xs font-bold text-foreground/90 transition-colors duration-[350ms] ease-[cubic-bezier(0.22,1,0.36,1)] group-hover/cap:text-foreground">
                        Cap. {formatChapter(previous.number)}
                      </span>
                      <span className="shrink-0 text-xs font-bold tabular-nums text-foreground/40 transition-colors duration-[350ms] ease-[cubic-bezier(0.22,1,0.36,1)] group-hover/cap:text-foreground/55">
                        {timeAgo(previous.created_at)}
                      </span>
                    </Link>
                  ) : null}
                </div>
              </div>
            </div>
          );
        })}
      </HScroll>
    </SectionRow>
  );
}
