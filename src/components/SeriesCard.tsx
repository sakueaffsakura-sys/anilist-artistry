import { Link } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { BookOpen, Heart, Star } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { coverUrl } from "@/lib/media";
import { useSession } from "@/hooks/useAuth";
import { AgeRatingBadge } from "@/components/AgeRatingBadge";
import { activeProfileId } from "@/lib/active-profile";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { SeriesChapterLinks, type ChapterRef } from "@/components/SeriesChapterLinks";
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
    <div className="group flex h-full w-full min-w-0 flex-col rounded-lg">
      <Link
        to="/obra/$slug"
        params={{ slug }}
        className="series-cover group/cover relative z-0 block aspect-[2/3] w-full shrink-0 overflow-hidden rounded-lg border border-border bg-surface-2 transition-[transform,box-shadow,border-color] duration-200 hover:border-primary/50 motion-safe:hover:-translate-y-1"
      >
        <img
          src={coverUrl(cover)}
          alt={title}
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover transition-transform duration-200 ease-out group-hover/cover:scale-105"
        />
        {favorite ? <span aria-hidden="true" className="series-favorite-outline pointer-events-none absolute inset-0 z-[2] rounded-lg" /> : null}
        <Button type="button" size="icon" variant="ghost"
          title={favorite ? "Remover dos favoritos" : "Adicionar aos favoritos"}
          aria-label={favorite ? "Remover obra dos favoritos" : "Adicionar obra aos favoritos"}
          onClick={onHeart} disabled={toggleFav.isPending}
          className={cn("absolute right-1.5 top-1.5 z-30 h-7 w-7 rounded-full border border-cover-foreground/20 bg-cover-overlay text-cover-foreground hover:bg-cover-overlay hover:text-favorite", favorite && "border-favorite/50 text-favorite")}>
          <Heart className={cn("h-3.5 w-3.5", favorite && "fill-current")} />
        </Button>
        <div className="pointer-events-none absolute left-2 top-2 z-[3] flex flex-col items-start gap-1.5 antialiased">
          {rating || chapters ? (
            <span
              title={`Média ${Number(rating ?? 0).toFixed(1).replace(".", ",")} · ${chapters ?? 0} capítulos`}
              className="pointer-events-none inline-flex items-center gap-1.5 rounded-full border border-cover-foreground/15 bg-cover-overlay px-3 py-1 shadow-sm"
            >
              {rating ? (
                <>
                  <Star className="h-3.5 w-3.5 shrink-0 fill-gold text-gold" />
                  <span className="text-xs font-black leading-none text-cover-foreground tabular-nums">
                    {Number(rating).toFixed(1).replace(".", ",")}
                  </span>
                </>
              ) : null}
              {rating && chapters ? (
                <span aria-hidden="true" className="mx-0.5 h-3.5 w-px shrink-0 bg-cover-foreground/25" />
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
            <span className="inline-flex items-center gap-1.5 rounded-full border border-favorite/40 bg-cover-overlay px-2.5 py-1 shadow-sm">
              <Heart className="h-3 w-3 shrink-0 fill-favorite text-favorite" />
              <span className="text-[11px] font-extrabold leading-none text-favorite">
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
          <div className="absolute inset-x-0 bottom-0 z-[3] series-cover-shade p-2 pt-6">
            <div className="h-1 w-full overflow-hidden rounded-full bg-cover-foreground/15">
              <div className="h-full rounded-full bg-primary" style={{ width: `${progress}%` }} />
            </div>
          </div>
        ) : null}
        <div className="series-cover-shade pointer-events-none absolute inset-0 opacity-0 transition-opacity group-hover/cover:opacity-100" />
      </Link>
      {showTitle ? (
        <div className="flex min-h-0 flex-1 flex-col px-0.5 pt-2">
          <div className="min-h-10 shrink-0">
            <Link to="/obra/$slug" params={{ slug }} className="block no-underline">
              <h3 className="line-clamp-2 text-sm font-semibold leading-snug transition-colors group-hover:text-primary">
                {title}
              </h3>
            </Link>
          </div>
          {chapterList && chapterList.length > 0 ? (
            <SeriesChapterLinks slug={slug} chapters={chapterList} favorite={favorite} />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
