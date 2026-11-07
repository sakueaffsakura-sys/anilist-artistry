import { Link } from "@tanstack/react-router";
import { ArrowRight, Heart } from "lucide-react";
import type { SeriesRow } from "@/lib/queries";
import { formatChapter, timeAgo } from "@/lib/media";
import { HScroll, SectionRow, shelfItem } from "@/components/SectionRow";
import { SeriesCard } from "@/components/SeriesCard";

/** Favoritos com capítulo novo: as obras favoritadas, da atualização mais recente para a mais antiga. */
export function FavoritesUpdated({ rows }: { rows: SeriesRow[] }) {
  if (rows.length === 0) return null;
  return (
    <SectionRow
      icon={<Heart />}
      title="Seus favoritos"
      subtitle="Ordenados pelo capítulo mais novo"
      action={<Link to="/biblioteca" className="see-all">Biblioteca <ArrowRight className="h-3.5 w-3.5" /></Link>}
    >
      <HScroll>
        {rows.map((item) => {
          const latest = item.chapters[0];
          return (
            <div key={item.id} className={shelfItem}>
              <SeriesCard
                slug={item.slug}
                title={item.title}
                cover={item.cover_url}
                ageRating={item.age_rating}
                seriesId={item.id}
                favorite
                meta={latest ? (
                  <Link to="/obra/$slug/$chapter" params={{ slug: item.slug, chapter: formatChapter(latest.number) }} className="card-meta mt-1 hover:text-primary">
                    <span className="font-semibold text-foreground">Cap. {formatChapter(latest.number)}</span>
                    <span>{timeAgo(latest.created_at)}</span>
                  </Link>
                ) : undefined}
              />
            </div>
          );
        })}
      </HScroll>
    </SectionRow>
  );
}
