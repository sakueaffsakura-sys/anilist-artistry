import { useRef } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { BookOpen, ChevronLeft, ChevronRight, Heart, Sparkles, Star } from "lucide-react";
import { toast } from "sonner";
import type { SeriesRow } from "@/lib/queries";
import { supabase } from "@/integrations/supabase/client";
import { coverUrl, formatChapter, timeAgo } from "@/lib/media";
import { useSession } from "@/hooks/useAuth";
import { chapterCount } from "@/lib/series-summary";
import { activeProfileId } from "@/lib/active-profile";

/** Obra que chegou nos últimos 7 dias. */
const isNew = (iso: string) => Date.now() - new Date(iso).getTime() < 7 * 24 * 60 * 60 * 1000;

export function Releases({ rows }: { rows: SeriesRow[] }) {
  const { user } = useSession();
  const queryClient = useQueryClient();
  const scroller = useRef<HTMLDivElement>(null);
  const scrollBy = (delta: number) =>
    scroller.current?.scrollBy({ left: delta, behavior: "smooth" });

  const toggleFav = useMutation({
    mutationFn: async ({ seriesId, isFav }: { seriesId: string; isFav: boolean }) => {
      if (!user) throw new Error("Entre na sua conta para favoritar.");
      if (isFav) {
        const { error } = await supabase
          .from("favorites")
          .delete()
          .eq("user_id", user.id).eq("profile_id", activeProfileId())
          .eq("series_id", seriesId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("favorites")
          .insert({ user_id: user.id, profile_id: activeProfileId(), series_id: seriesId });
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
    <section aria-label="Lançamentos" className="relative min-w-0 max-w-full py-4 md:py-8">
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
          <Sparkles className="h-[18px] w-[18px]" />
        </div>
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-lg font-bold">Lançamentos <span className="section-count">{rows.length}</span></h2>
          <p className="text-xs text-muted-foreground">Obras que acabaram de chegar ao Better Mangá</p>
        </div>
        <div className="ml-auto hidden items-center gap-2 md:flex">
          <button
            type="button"
            title="Anterior"
            onClick={() => scrollBy(-420)}
            className="cursor-pointer rounded-full border border-foreground/10 bg-card/40 p-2 text-muted-foreground shadow-sm transition-all duration-200 hover:scale-110 hover:border-foreground/20 hover:bg-card/60 hover:text-foreground active:scale-95"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            type="button"
            title="Próximo"
            onClick={() => scrollBy(420)}
            className="cursor-pointer rounded-full border border-foreground/10 bg-card/40 p-2 text-muted-foreground shadow-sm transition-all duration-200 hover:scale-110 hover:border-foreground/20 hover:bg-card/60 hover:text-foreground active:scale-95"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
      </div>

      <div className="relative -mx-4 md:-mx-8">
        <div className="pointer-events-none absolute bottom-0 left-0 top-0 z-10 w-20 bg-gradient-to-r from-background to-transparent" />
        <div className="pointer-events-none absolute bottom-0 right-0 top-0 z-10 w-20 bg-gradient-to-l from-background to-transparent" />
        <div
          ref={scroller}
          className="no-scrollbar flex gap-4 overflow-x-auto px-4 pb-4 md:px-8"
        >
          {rows.map((item) => {
            const latest = item.chapters[0];
            return (
              <div key={item.id} className="w-[140px] shrink-0 sm:w-[160px]">
                <Link
                  to="/obra/$slug"
                  params={{ slug: item.slug }}
                  className="group relative flex h-full flex-col gap-2 text-left no-underline"
                >
                  <div className="series-cover relative aspect-[2/3] overflow-hidden rounded-[1.35rem] border border-foreground/10 bg-card/55 transition-[transform,box-shadow,border-color] duration-300 ease-out group-hover:-translate-y-0.5 group-hover:border-foreground/20 group-hover:shadow-[0_18px_42px_rgba(0,0,0,0.45)] group-hover:will-change-transform">
                    <img
                      alt={item.title}
                      loading="lazy"
                      decoding="async"
                      draggable={false}
                      className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-105"
                      src={coverUrl(item.cover_url)}
                    />
                    <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/10" />
                    <span className="pointer-events-none absolute left-2 top-2 z-[12] flex flex-col items-start gap-1">
                      {isNew(item.created_at) ? <span className="badge-new">Novo</span> : null}
                      <span className="kind-badge">{item.kind}</span>
                    </span>
                    <span
                      className="pointer-events-none absolute bottom-2 left-2 z-[12] inline-flex max-w-[calc(100%-1rem)] items-center gap-2 rounded-full border border-foreground/15 bg-black/25 px-2 py-1 shadow-[0_2px_14px_rgba(0,0,0,0.45)] backdrop-blur-2xl"
                      title={`${chapterCount(item)} capítulos · média ${Number(item.rating).toFixed(1).replace(".", ",")}/10`}
                    >
                      <span className="inline-flex shrink-0 items-center gap-1">
                        <BookOpen
                          className="h-[11px] w-[11px] shrink-0 text-white"
                          strokeWidth={2.5}
                        />
                        <span className="text-[10px] font-extrabold leading-none tabular-nums text-white">
                          {chapterCount(item)}
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
                    <button
                      type="button"
                      aria-label="Adicionar aos favoritos"
                      onClick={(e) => onHeart(e, item.id, false)}
                      className="absolute right-2 top-2 z-10 flex h-10 w-10 items-center justify-center rounded-full border border-foreground/10 bg-black/45 text-foreground/75 shadow-[0_10px_24px_rgba(0,0,0,0.28)] backdrop-blur-md transition-all duration-200 hover:border-red-400/35 hover:text-red-300"
                    >
                      <Heart className="h-5 w-5" strokeWidth={2.2} />
                    </button>
                  </div>
                  <div className="flex min-h-[2.5rem] flex-1 flex-col px-0.5">
                    <h3 className="line-clamp-2 text-[13px] font-semibold leading-tight text-foreground transition-colors group-hover:text-foreground/80">
                      {item.title}
                    </h3>
                    <p className="mt-1 truncate text-[11px] font-medium text-muted-foreground">
                      {latest
                        ? `Cap. ${formatChapter(latest.number)} · ${timeAgo(latest.created_at)}`
                        : "Cap. 0"}
                    </p>
                    <p className="mt-0.5 truncate text-[10px] font-semibold text-muted-foreground/70">Chegou {timeAgo(item.created_at)}</p>
                  </div>
                </Link>
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-3 flex justify-center pb-2">
        <Link
          to="/catalogo"
          search={{ q: "", kind: "Todos" }}
          className="rounded-full border border-foreground/10 bg-card/40 px-4 py-2 text-xs font-bold text-muted-foreground no-underline transition-colors hover:border-primary/40 hover:text-primary"
        >
          Ver todas as obras
        </Link>
      </div>
    </section>
  );
}
