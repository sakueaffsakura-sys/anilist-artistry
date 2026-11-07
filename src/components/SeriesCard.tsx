import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Heart, Star } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { coverUrl } from "@/lib/media";
import { useSession } from "@/hooks/useAuth";
import { useFavoriteIds } from "@/hooks/useFavoriteIds";
import { AgeRatingBadge } from "@/components/AgeRatingBadge";
import { activeProfileId } from "@/lib/active-profile";
import { formatRating } from "@/lib/format";
import { kindLabel } from "@/lib/work-categories";
import { cn } from "@/lib/utils";
import { SeriesChapterLinks, type ChapterRef } from "@/components/SeriesChapterLinks";

type Props = {
  slug: string;
  title: string;
  /** Título com marcação (ex.: termo buscado destacado); o texto puro continua em `title`. */
  titleNode?: ReactNode;
  cover?: string | null;
  rating?: number | null;
  chapters?: number | null;
  chapterList?: ChapterRef[];
  /** Andamento de leitura (0–100), mostrado como barra no pé da capa. */
  progress?: number | null;
  /** Etiqueta curta no canto de baixo da capa (ex.: "Cap. 12"). */
  badge?: string | null;
  ageRating?: string | null | undefined;
  kind?: string | null;
  showTitle?: boolean;
  /** Estado do favorito; sem ele o cartão consulta os favoritos do perfil ativo. */
  favorite?: boolean;
  seriesId?: string;
  /** Selo "Novo" no canto da capa. */
  isNew?: boolean;
  /** Linha de informação abaixo do título; sem ela aparecem nota, capítulos e formato. */
  meta?: ReactNode;
};

/** Cartão de obra único do site: capa, selos discretos, favorito e uma linha de informação. */
export function SeriesCard({
  slug,
  title,
  titleNode,
  cover,
  rating,
  chapters,
  chapterList,
  progress,
  badge,
  ageRating,
  kind,
  showTitle = true,
  favorite: favoriteProp,
  seriesId,
  isNew = false,
  meta,
}: Props) {
  const { user } = useSession();
  const queryClient = useQueryClient();
  const favoriteIds = useFavoriteIds();
  const favorite = favoriteProp ?? (seriesId ? favoriteIds.has(seriesId) : false);
  const toggleFav = useMutation({
    mutationFn: async () => {
      if (!user || !seriesId) throw new Error("Entre na sua conta para favoritar.");
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
    onError: (err) => toast.error(err instanceof Error ? err.message : "Não foi possível atualizar os favoritos."),
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
  const score = Number(rating ?? 0);
  const defaultMeta = score > 0 || chapters || kind ? (
    <p className="card-meta mt-1">
      {score > 0 ? <span className="inline-flex items-center gap-1 font-semibold text-foreground"><Star className="fill-gold text-gold" />{formatRating(score)}</span> : null}
      {chapters ? <span>{chapters.toLocaleString("pt-BR")} cap.</span> : null}
      {kind ? <span className="truncate">{kindLabel(kind)}</span> : null}
    </p>
  ) : null;

  return (
    <div className="group flex h-full w-full min-w-0 flex-col">
      <Link
        to="/obra/$slug"
        params={{ slug }}
        className="series-cover relative z-0 block aspect-[2/3] w-full shrink-0 overflow-hidden rounded-md"
      >
        <img src={coverUrl(cover)} alt={title} loading="lazy" decoding="async" className="h-full w-full object-cover" />
        <div className="pointer-events-none absolute left-1.5 top-1.5 z-[3] flex flex-col items-start gap-1">
          {isNew ? <span className="badge-new">Novo</span> : null}
          <AgeRatingBadge value={ageRating} size="sm" variant="solid" />
        </div>
        <button
          type="button"
          title={favorite ? "Remover dos favoritos" : "Adicionar aos favoritos"}
          aria-label={favorite ? `Remover ${title} dos favoritos` : `Adicionar ${title} aos favoritos`}
          aria-pressed={favorite}
          onClick={onHeart}
          disabled={toggleFav.isPending}
          className={cn(
            "absolute right-1.5 top-1.5 z-[4] grid h-7 w-7 place-items-center rounded-full bg-cover-overlay text-cover-foreground hover:text-favorite disabled:opacity-60",
            favorite && "text-favorite",
          )}
        >
          <Heart className={cn("h-3.5 w-3.5", favorite && "fill-current")} />
        </button>
        {badge ? <span className="cover-badge absolute bottom-1.5 left-1.5 z-[3]">{badge}</span> : null}
        {typeof progress === "number" ? (
          <div className="absolute inset-x-0 bottom-0 z-[3] series-cover-shade px-1.5 pb-1.5 pt-6">
            <div className="h-1 w-full overflow-hidden rounded-full bg-cover-foreground/20">
              <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(0, Math.min(100, progress))}%` }} />
            </div>
          </div>
        ) : null}
      </Link>
      {showTitle ? (
        <div className="flex min-h-0 flex-1 flex-col pt-2">
          <h3 className="line-clamp-2 text-[13px] font-semibold leading-snug sm:text-sm">
            <Link to="/obra/$slug" params={{ slug }} className="hover:text-primary">{titleNode ?? title}</Link>
          </h3>
          {meta ?? defaultMeta}
          {chapterList && chapterList.length > 0 ? (
            <SeriesChapterLinks slug={slug} chapters={chapterList} favorite={favorite} />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
