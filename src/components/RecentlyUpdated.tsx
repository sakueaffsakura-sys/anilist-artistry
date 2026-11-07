import { Link } from "@tanstack/react-router";
import { ArrowRight, Clock, Pin } from "lucide-react";
import type { SeriesRow } from "@/lib/queries";
import { coverUrl, formatChapter, timeAgo } from "@/lib/media";
import { SectionRow } from "@/components/SectionRow";
import { selectRecentUpdates } from "@/lib/recent-updates";
import { kindLabel } from "@/lib/work-categories";

/** Capítulo publicado há menos de 3 horas. */
const isFresh = (iso: string) => Date.now() - new Date(iso).getTime() < 3 * 60 * 60 * 1000;

/** Capítulos novos: lista compacta (capa pequena, obra, capítulo e quando saiu), em 1 a 3 colunas. */
export function RecentlyUpdated({ rows }: { rows: SeriesRow[] }) {
  const items = selectRecentUpdates(rows);
  if (items.length === 0) return null;
  return (
    <SectionRow
      icon={<Clock />}
      title="Capítulos novos"
      subtitle="Do mais recente para o mais antigo"
      action={<Link to="/catalogo" search={{ sort: "recent" }} className="see-all">Ver mais <ArrowRight className="h-3.5 w-3.5" /></Link>}
    >
      <ul className="update-list">
        {items.map((item) => {
          const [latest, previous] = item.chapters ?? [];
          return (
            <li key={item.id} className="update-row max-md:[&:nth-child(n+9)]:hidden">
              <Link to="/obra/$slug" params={{ slug: item.slug }} tabIndex={-1} aria-hidden="true">
                <img src={coverUrl(item.cover_url)} alt="" loading="lazy" decoding="async" />
              </Link>
              <div className="min-w-0">
                <h3 className="flex min-w-0 items-center gap-1.5">
                  {item.pinned ? <Pin className="h-3.5 w-3.5 shrink-0 fill-gold text-gold" aria-label="Fixada" /> : null}
                  <Link to="/obra/$slug" params={{ slug: item.slug }} className="truncate">{item.title}</Link>
                </h3>
                {latest ? (
                  <p className="update-chapter">
                    <Link to="/obra/$slug/$chapter" params={{ slug: item.slug, chapter: formatChapter(latest.number) }}>Cap. {formatChapter(latest.number)}</Link>
                    {latest.title ? <span>{latest.title}</span> : previous ? <span>· antes: <Link to="/obra/$slug/$chapter" params={{ slug: item.slug, chapter: formatChapter(previous.number) }} className="font-semibold text-muted-foreground hover:text-primary">Cap. {formatChapter(previous.number)}</Link></span> : null}
                  </p>
                ) : null}
                <p className="card-meta mt-0.5">
                  {latest && isFresh(latest.created_at) ? <span className="inline-flex items-center gap-1 font-semibold text-new"><span className="live-dot" />Novo</span> : null}
                  <span>{latest ? timeAgo(latest.created_at) : timeAgo(item.updated_at)}</span>
                  <span>{kindLabel(item.kind)}</span>
                </p>
              </div>
            </li>
          );
        })}
      </ul>
    </SectionRow>
  );
}
