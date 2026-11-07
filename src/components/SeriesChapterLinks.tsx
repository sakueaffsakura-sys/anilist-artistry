import { Link } from "@tanstack/react-router";
import { formatChapter, timeAgo } from "@/lib/media";

export interface ChapterRef {
  id: string;
  number: number | string;
  created_at?: string;
}

export interface SeriesChapterLinksProps {
  slug: string;
  chapters: ChapterRef[];
  favorite: boolean;
}

/** Os dois capítulos mais novos de uma obra, em linhas curtas abaixo do título. */
export function SeriesChapterLinks({ slug, chapters }: SeriesChapterLinksProps) {
  return (
    <div className="mt-1.5 flex flex-col divide-y divide-border/70 border-t border-border/70">
      {chapters.slice(0, 2).map((chapter) => (
        <Link key={chapter.id} to="/obra/$slug/$chapter"
          params={{ slug, chapter: formatChapter(chapter.number) }}
          className="flex items-center justify-between gap-2 py-1.5 text-xs hover:text-primary">
          <span className="min-w-0 truncate font-semibold">Cap. {formatChapter(chapter.number)}</span>
          {chapter.created_at ? <span className="shrink-0 text-muted-foreground tabular-nums">{timeAgo(chapter.created_at)}</span> : null}
        </Link>
      ))}
    </div>
  );
}
