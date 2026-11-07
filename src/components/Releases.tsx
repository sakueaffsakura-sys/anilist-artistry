import { Link } from "@tanstack/react-router";
import { ArrowRight, Sparkles } from "lucide-react";
import type { SeriesRow } from "@/lib/queries";
import { formatChapter, timeAgo } from "@/lib/media";
import { HScroll, SectionRow, shelfItem } from "@/components/SectionRow";
import { SeriesCard } from "@/components/SeriesCard";

/** Obra que chegou nos últimos 7 dias. */
const isNew = (iso: string) => Date.now() - new Date(iso).getTime() < 7 * 24 * 60 * 60 * 1000;

/** Lançamentos: as obras que acabaram de chegar ao site. */
export function Releases({ rows, favoriteIds }: { rows: SeriesRow[]; favoriteIds: Set<string> }) {
  if (rows.length === 0) return null;
  return (
    <SectionRow
      icon={<Sparkles />}
      title="Lançamentos"
      count={rows.length}
      subtitle="Obras que acabaram de chegar"
      action={<Link to="/catalogo" search={{ sort: "recent" }} className="see-all">Ver todas <ArrowRight className="h-3.5 w-3.5" /></Link>}
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
                favorite={favoriteIds.has(item.id)}
                isNew={isNew(item.created_at)}
                meta={<p className="card-meta mt-1">{latest ? <span>Cap. {formatChapter(latest.number)} · {timeAgo(latest.created_at)}</span> : <span>Chegou {timeAgo(item.created_at)}</span>}</p>}
              />
            </div>
          );
        })}
      </HScroll>
    </SectionRow>
  );
}
