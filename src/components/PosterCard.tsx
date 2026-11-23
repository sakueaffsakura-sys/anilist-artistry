import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { BookOpen, Heart, Pin, Star } from "lucide-react";
import { useFavoriteIds } from "@/hooks/useFavoriteIds";
import { useToggleFavorite } from "@/hooks/useToggleFavorite";
import { coverUrl } from "@/lib/media";
import { formatRating } from "@/lib/format";
import { cn } from "@/lib/utils";

type PosterItem = {
  id: string;
  slug: string;
  title: string;
  cover_url: string | null;
  rating: number;
  chapter_count?: number | undefined;
  chapters: readonly unknown[];
};

/**
 * Capa da home: coração no canto, selo com capítulos e nota sobre a arte, título em duas linhas
 * e, abaixo dele, o que a seção quiser mostrar (`children`).
 */
export function PosterCard({
  item,
  pinned = false,
  className,
  children,
}: {
  item: PosterItem;
  pinned?: boolean;
  className?: string;
  children?: ReactNode;
}) {
  const favoriteIds = useFavoriteIds();
  const { toggle, pending } = useToggleFavorite();
  const favorite = favoriteIds.has(item.id);
  const total = item.chapter_count ?? item.chapters.length;
  const score = Number(item.rating ?? 0);

  return (
    <article className={cn("poster", className)} data-favorite={favorite} data-pinned={pinned}>
      <Link to="/obra/$slug" params={{ slug: item.slug }} className="poster-cover">
        <img src={coverUrl(item.cover_url)} alt={item.title} loading="lazy" decoding="async" />
        {pinned ? <span className="poster-flag"><Pin aria-hidden="true" />Fixada</span> : null}
        <span className="poster-stats">
          <span><BookOpen aria-hidden="true" />{total.toLocaleString("pt-BR")}</span>
          {score > 0 ? (
            <>
              <i aria-hidden="true" />
              <span className="star"><Star aria-hidden="true" />{formatRating(score)}</span>
            </>
          ) : null}
        </span>
      </Link>
      <button
        type="button"
        className="poster-heart"
        title={favorite ? "Remover dos favoritos" : "Adicionar aos favoritos"}
        aria-label={favorite ? `Remover ${item.title} dos favoritos` : `Adicionar ${item.title} aos favoritos`}
        aria-pressed={favorite}
        disabled={pending}
        onClick={() => toggle(item.id, favorite)}
      >
        <Heart aria-hidden="true" />
      </button>
      <h3 className="poster-title"><Link to="/obra/$slug" params={{ slug: item.slug }}>{item.title}</Link></h3>
      {children}
    </article>
  );
}
