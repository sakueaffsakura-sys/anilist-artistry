import { Link } from "@tanstack/react-router";
import type { SeriesRow } from "@/lib/queries";
import { timeAgo } from "@/lib/media";
import { PosterCard } from "@/components/PosterCard";

/** Lançamentos: as obras que acabaram de chegar ao site (8 capas; em telas menores cabem 6, 4 ou 3 por linha). */
export function Releases({ rows, kind }: { rows: SeriesRow[]; kind: string }) {
  if (rows.length === 0) return null;
  return (
    <section className="home-section" aria-labelledby="releases-title">
      <div className="home-section-head">
        <div className="home-section-title"><h2 id="releases-title">Lançamentos</h2></div>
        <div className="home-section-actions">
          <Link to="/catalogo" search={{ sort: "novas", kind }} className="see-all">Ver todos →</Link>
        </div>
      </div>
      <div className="release-grid">
        {rows.slice(0, 8).map((item) => {
          const latest = item.chapters[0];
          return (
            <PosterCard key={item.id} item={item}>
              <p className="poster-time">{timeAgo(latest?.created_at ?? item.created_at)}</p>
            </PosterCard>
          );
        })}
      </div>
    </section>
  );
}
