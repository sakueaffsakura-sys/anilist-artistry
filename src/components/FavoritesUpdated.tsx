import { useRef } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, Heart } from "lucide-react";
import type { SeriesRow } from "@/lib/queries";
import { formatChapter, timeAgo } from "@/lib/media";
import { PosterCard } from "@/components/PosterCard";

/** Favoritas atualizadas: as obras favoritadas, da atualização mais recente para a mais antiga. */
export function FavoritesUpdated({ rows }: { rows: SeriesRow[] }) {
  const rowRef = useRef<HTMLDivElement>(null);
  if (rows.length === 0) return null;

  const scroll = (direction: 1 | -1) => {
    const el = rowRef.current;
    if (el) el.scrollBy({ left: direction * Math.max(el.clientWidth * 0.8, 160), behavior: "smooth" });
  };

  return (
    <section className="home-section" aria-labelledby="favorites-title">
      <div className="home-section-head">
        <div className="home-section-title">
          <h2 id="favorites-title"><Heart aria-hidden="true" stroke="#fbbf24" />Favoritas atualizadas</h2>
        </div>
        <div className="home-section-actions" style={{ gap: 8 }}>
          <button type="button" className="circle-btn" aria-label="Rolar para a esquerda" onClick={() => scroll(-1)}><ChevronLeft aria-hidden="true" /></button>
          <button type="button" className="circle-btn" aria-label="Rolar para a direita" onClick={() => scroll(1)}><ChevronRight aria-hidden="true" /></button>
        </div>
      </div>
      <div className="shelf-row" ref={rowRef}>
        {rows.map((item) => {
          const latest = item.chapters[0];
          return (
            <PosterCard key={item.id} item={item}>
              {latest ? (
                <Link to="/obra/$slug/$chapter" params={{ slug: item.slug, chapter: formatChapter(latest.number) }} className="poster-chip">
                  <b>Cap. {formatChapter(latest.number)}</b>
                  <span>{timeAgo(latest.created_at)}</span>
                </Link>
              ) : null}
            </PosterCard>
          );
        })}
      </div>
    </section>
  );
}
