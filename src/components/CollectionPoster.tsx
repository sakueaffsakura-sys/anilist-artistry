import { Link } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, Heart, Trash2 } from "lucide-react";
import { coverUrl } from "@/lib/media";
import { pageWindow } from "@/lib/collection";

/** Cartão da Coleção: capa 2:3 com andamento em verde, título em até duas linhas e uma linha de apoio. */
export function CollectionPoster({
  slug,
  title,
  cover,
  caption,
  progress,
  heart,
  editing,
  onRemove,
  resumeChapter,
}: {
  slug: string;
  title: string;
  cover: string | null;
  caption: string;
  progress: number;
  /** Mostra o coração vermelho (aba Favoritos): tocar tira a obra dos favoritos. */
  heart: boolean;
  /** Modo "Editar": troca o coração por uma lixeira em qualquer aba. */
  editing: boolean;
  onRemove: () => void;
  resumeChapter?: number | undefined;
}) {
  return (
    <article className="coll-card">
      <div className="coll-cover">
        <Link to="/obra/$slug" params={{ slug }} aria-label={title} className="coll-cover-link">
          <img src={coverUrl(cover)} alt={title} loading="lazy" decoding="async" />
        </Link>
        {progress > 0 ? (
          <span className="coll-progress" role="progressbar" aria-label="Andamento da leitura" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100, progress)}>
            <i style={{ width: `${Math.min(100, progress)}%` }} />
          </span>
        ) : null}
        {editing ? (
          <button type="button" className="poster-heart coll-remove" onClick={onRemove} aria-label={`Remover ${title}`} title={`Remover ${title}`}>
            <Trash2 aria-hidden="true" />
          </button>
        ) : heart ? (
          <button type="button" className="poster-heart" aria-pressed="true" onClick={onRemove} aria-label={`Tirar ${title} dos favoritos`} title="Tirar dos favoritos">
            <Heart aria-hidden="true" />
          </button>
        ) : null}
      </div>
      <Link to="/obra/$slug" params={{ slug }} className="coll-title">{title}</Link>
      {resumeChapter !== undefined ? (
        <Link to="/obra/$slug/$chapter" params={{ slug, chapter: String(resumeChapter) }} className="coll-cap coll-resume">Continuar no cap. {resumeChapter}</Link>
      ) : (
        <p className="coll-cap">{caption}</p>
      )}
    </article>
  );
}

/** Paginação em círculos: anterior, números (1 2 3 … 21) e próxima; a página atual em laranja. */
export function CollectionPager({ page, pages, onChange }: { page: number; pages: number; onChange: (page: number) => void }) {
  if (pages <= 1) return null;
  return (
    <nav className="coll-pager" aria-label="Páginas">
      <button type="button" className="coll-pg" disabled={page <= 1} onClick={() => onChange(page - 1)} aria-label="Página anterior">
        <ChevronLeft aria-hidden="true" />
      </button>
      {pageWindow(page, pages).map((entry, index) =>
        entry === "gap" ? (
          <span key={`gap-${index}`} className="coll-gap" aria-hidden="true">…</span>
        ) : (
          <button
            key={entry}
            type="button"
            className="coll-pg"
            aria-current={entry === page ? "page" : undefined}
            aria-label={`Página ${entry}`}
            onClick={() => onChange(entry)}
          >
            {entry}
          </button>
        ),
      )}
      <button type="button" className="coll-pg" disabled={page >= pages} onClick={() => onChange(page + 1)} aria-label="Próxima página">
        <ChevronRight aria-hidden="true" />
      </button>
    </nav>
  );
}
