import { Link } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { BookOpen, Heart, Star } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { coverUrl, formatChapter, timeAgo } from "@/lib/media";
import { useSession } from "@/hooks/useAuth";
import { AgeRatingBadge } from "@/components/AgeRatingBadge";


type ChapterRef = { id: string; number: number | string; created_at?: string };

type Props = {
  slug: string;
  title: string;
  cover?: string | null;
  rating?: number | null;
  chapters?: number | null;
  chapterList?: ChapterRef[];
  progress?: number | null;
  badge?: string | null;
  ageRating?: string | null | undefined;

  showTitle?: boolean;
  favorite?: boolean;
  seriesId?: string;
};

export function SeriesCard({
  slug,
  title,
  cover,
  rating,
  chapters,
  chapterList,
  progress,
  badge,
  ageRating,

  showTitle = true,
  favorite = false,
  seriesId,
}: Props) {
  const { user } = useSession();
  const queryClient = useQueryClient();

  const toggleFav = useMutation({
    mutationFn: async () => {
      if (!user || !seriesId) throw new Error("Entre para favoritar");
      if (favorite) {
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

  const onHeart = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!user) {
      toast.info("Entre na sua conta para favoritar.");
      return;
    }
    toggleFav.mutate();
  };

  return (
    <div className="group flex h-full w-full min-w-0 flex-col rounded-2xl">
      <Link
        to="/obra/$slug"
        params={{ slug }}
        className="group/cover relative z-0 block aspect-[2/3] w-full shrink-0 overflow-hidden rounded-2xl border border-border bg-surface-2 transition-[transform,box-shadow,border-color] duration-200 ease-out hover:z-20 hover:-translate-y-2 hover:border-primary/50 hover:shadow-[0_18px_44px_rgba(0,0,0,0.5)] motion-safe:hover:scale-[1.03]"
      >
        <img
          src={coverUrl(cover)}
          alt={title}
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover transition-transform duration-200 ease-out group-hover/cover:scale-105"
        />
        {favorite ? (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 z-[2] rounded-2xl shadow-[inset_0_0_0_2px_rgba(239,68,68,0.75)]"
          />
        ) : null}

        <button
          type="button"
          title={favorite ? "Remover dos favoritos" : "Adicionar aos favoritos"}
          aria-label={favorite ? "Remover obra dos favoritos" : "Adicionar obra aos favoritos"}
          onClick={onHeart}
          disabled={toggleFav.isPending}
          className={`group/fav absolute right-1.5 top-1.5 z-[30] rounded-full border p-1.5 shadow-[0_2px_12px_rgba(0,0,0,0.4)] transition-[transform,colors,box-shadow,background-color] duration-200 ease-out hover:scale-110 active:scale-95 disabled:opacity-60 ${
            favorite
              ? "border-red-500/55 bg-black/45 text-red-400 hover:border-red-400 hover:bg-red-500/25 hover:text-red-300 hover:shadow-[0_0_18px_rgba(239,68,68,0.5)]"
              : "border-white/20 bg-black/45 text-white/70 hover:border-red-400/60 hover:bg-red-500/20 hover:text-red-300"
          }`}
        >
          <Heart
            className={`h-4 w-4 transition-[fill,transform] duration-200 group-hover/fav:scale-110 ${
              favorite ? "fill-red-400 group-hover/fav:fill-red-300" : ""
            }`}
          />
        </button>

        <div className="pointer-events-none absolute left-2 top-2 z-[3] flex flex-col items-start gap-1.5 antialiased">
          {rating || chapters ? (
            <span
              title={`Média ${Number(rating ?? 0).toFixed(1).replace(".", ",")} · ${chapters ?? 0} capítulos`}
              className="pointer-events-none inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-black/65 px-3 py-1 shadow-[0_2px_14px_rgba(0,0,0,0.45)]"
            >
              {rating ? (
                <>
                  <Star className="h-3.5 w-3.5 shrink-0 fill-amber-400 text-amber-400" />
                  <span className="text-xs font-black leading-none tracking-tight text-amber-50 tabular-nums">
                    {Number(rating).toFixed(1).replace(".", ",")}
                  </span>
                </>
              ) : null}
              {rating && chapters ? (
                <span aria-hidden="true" className="mx-0.5 h-3.5 w-px shrink-0 bg-white/25" />
              ) : null}
              {chapters ? (
                <>
                  <BookOpen className="h-3 w-3 shrink-0 text-primary" />
                  <span className="text-xs font-black leading-none tracking-tight text-primary tabular-nums">
                    {chapters}
                  </span>
                </>
              ) : null}
            </span>
          ) : null}
          <AgeRatingBadge value={ageRating} size="sm" variant="solid" />

          {favorite ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-red-500/45 bg-black/65 px-2.5 py-1 shadow-[0_2px_14px_rgba(0,0,0,0.45)]">
              <Heart className="h-3 w-3 shrink-0 fill-red-400 text-red-400" />
              <span className="text-[11px] font-extrabold leading-none tracking-wide text-red-300">
                Favorito
              </span>
            </span>
          ) : null}
        </div>

        {badge ? (
          <span className="absolute bottom-1.5 right-1.5 z-[3] rounded-md bg-primary px-1.5 py-0.5 text-[11px] font-bold text-primary-foreground">
            {badge}
          </span>
        ) : null}

        {typeof progress === "number" ? (
          <div className="absolute inset-x-0 bottom-0 z-[3] bg-gradient-to-t from-black/90 to-transparent p-2 pt-6">
            <div className="h-1 w-full overflow-hidden rounded-full bg-white/15">
              <div className="h-full rounded-full bg-primary" style={{ width: `${progress}%` }} />
            </div>
          </div>
        ) : null}

        {favorite ? (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 bottom-0 z-[2] flex h-5 items-center justify-center bg-red-500/90 text-[9px] font-bold uppercase tracking-[0.12em] text-white shadow-[0_-2px_8px_rgba(0,0,0,0.3)]"
          >
            Favorita
          </span>
        ) : null}

        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/90 via-transparent to-transparent opacity-0 transition-opacity group-hover/cover:opacity-100" />
      </Link>

      {showTitle ? (
        <div className="flex min-h-0 flex-1 flex-col px-0.5 pt-2">
          <div className="min-h-[3.125rem] shrink-0">
            <Link to="/obra/$slug" params={{ slug }} className="block no-underline">
              <h3 className="line-clamp-2 text-[1.03rem] font-semibold leading-snug transition-colors group-hover:text-primary">
                {title}
              </h3>
            </Link>
          </div>
          {chapterList && chapterList.length > 0 ? (
            <div className="mt-2 flex min-h-[6.25rem] flex-col gap-2 overflow-visible">
              {chapterList.slice(0, 2).map((chapter) => (
                <Link
                  key={chapter.id}
                  to="/obra/$slug/$chapter"
                  params={{ slug, chapter: formatChapter(chapter.number) }}
                  className={`group/cap relative z-0 flex min-h-[2.875rem] w-full origin-center transform-gpu items-center justify-between gap-1.5 rounded-lg px-3 py-2.5 text-sm no-underline transition-[transform,colors,filter,box-shadow] duration-[350ms] ease-[cubic-bezier(0.22,1,0.36,1)] hover:z-10 hover:brightness-110 motion-safe:hover:scale-[1.035] active:scale-[0.99] active:duration-[150ms] ${
                    favorite
                      ? "bg-red-500/10 shadow-[inset_0_0_0_1px_rgba(239,68,68,0.4)]"
                      : "bg-white/[0.05] hover:bg-white/[0.09]"
                  }`}
                >
                  <span className="inline-flex min-w-0 flex-1 items-center gap-1 truncate text-left text-sm font-bold text-white/90 transition-colors group-hover/cap:text-white">
                    Cap. {formatChapter(chapter.number)}
                  </span>
                  {chapter.created_at ? (
                    <span className="shrink-0 text-xs font-bold text-white/40 tabular-nums transition-colors group-hover/cap:text-white/55">
                      {timeAgo(chapter.created_at)}
                    </span>
                  ) : null}
                </Link>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
