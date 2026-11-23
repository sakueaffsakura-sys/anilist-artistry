import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, LayoutGrid, List, Sparkles, Star } from "lucide-react";
import type { SeriesRow } from "@/lib/queries";
import { formatChapter, isRecentChapter, timeAgoShort } from "@/lib/media";
import { PosterCard } from "@/components/PosterCard";
import { selectRecentUpdates } from "@/lib/recent-updates";

const VIEW_KEY = "bm:atualizados-lista";

/** Atualizados: grade de capas com os dois capítulos mais novos de cada obra (fixadas primeiro). */
export function RecentlyUpdated({ rows, kind }: { rows: SeriesRow[]; kind: string }) {
  const items = selectRecentUpdates(rows);
  const [view, setView] = useState<"grid" | "list">("grid");

  useEffect(() => {
    try {
      if (window.localStorage.getItem(VIEW_KEY) === "1") setView("list");
    } catch {
      /* sem armazenamento: fica na grade */
    }
  }, []);

  function choose(next: "grid" | "list") {
    setView(next);
    try {
      if (next === "list") window.localStorage.setItem(VIEW_KEY, "1");
      else window.localStorage.removeItem(VIEW_KEY);
    } catch {
      /* só vale até recarregar */
    }
  }

  if (items.length === 0) return null;
  return (
    <section className="home-section" aria-labelledby="updated-title">
      <div className="home-section-head">
        <div className="home-section-title">
          <h2 id="updated-title">Atualizados</h2>
          <p>capítulos novos em {kind}</p>
        </div>
        <div className="home-section-actions">
          {kind === "Comic" ? (
            <Link to="/" search={{ formato: "Comic2" }} className="format-cross">
              <Sparkles aria-hidden="true" />Comic 2 <em>NOVO</em><ArrowRight aria-hidden="true" />
            </Link>
          ) : null}
          <Link to="/catalogo" search={{ sort: "recent", kind }} className="see-all">Ver todos →</Link>
          <div className="icon-toggle" role="group" aria-label="Modo de exibição">
            <button type="button" aria-label="Grade" aria-pressed={view === "grid"} onClick={() => choose("grid")}><LayoutGrid aria-hidden="true" /></button>
            <button type="button" aria-label="Lista" aria-pressed={view === "list"} onClick={() => choose("list")}><List aria-hidden="true" /></button>
          </div>
        </div>
      </div>
      <div className="update-grid" data-view={view}>
        {items.map((item) => (
          <PosterCard key={item.id} item={item} pinned={item.pinned} className="update-card">
            <div className="chapter-pills">
              {item.chapters.slice(0, 2).map((chapter) => {
                const fresh = isRecentChapter(chapter.created_at);
                return (
                  <Link
                    key={chapter.id}
                    to="/obra/$slug/$chapter"
                    params={{ slug: item.slug, chapter: formatChapter(chapter.number) }}
                    className="chapter-pill"
                    data-fresh={fresh}
                    title={chapter.title ?? `Capítulo ${formatChapter(chapter.number)}`}
                  >
                    <b>Cap. {formatChapter(chapter.number)}{fresh ? <Star aria-hidden="true" /> : null}</b>
                    <span>{timeAgoShort(chapter.created_at)}</span>
                  </Link>
                );
              })}
            </div>
          </PosterCard>
        ))}
      </div>
    </section>
  );
}
