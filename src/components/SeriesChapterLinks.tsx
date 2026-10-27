import { Link } from "@tanstack/react-router";
import { formatChapter, timeAgo } from "@/lib/media";
import { cn } from "@/lib/utils";

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

export function SeriesChapterLinks({ slug, chapters, favorite }: SeriesChapterLinksProps) {
  return (
    <div className="mt-2 flex min-h-24 flex-col gap-1.5">
      {chapters.slice(0, 2).map((chapter) => (
        <Link key={chapter.id} to="/obra/$slug/$chapter"
          params={{ slug, chapter: formatChapter(chapter.number) }}
          className={cn("flex min-h-10 items-center justify-between gap-2 rounded-md border border-border/60 bg-surface px-2.5 py-2 text-xs hover:border-primary/40 hover:bg-surface-2", favorite && "border-favorite/30")}>
          <span className="min-w-0 truncate font-semibold">Cap. {formatChapter(chapter.number)}</span>
          {chapter.created_at ? <span className="shrink-0 text-[10px] text-muted-foreground tabular-nums">{timeAgo(chapter.created_at)}</span> : null}
        </Link>
      ))}
    </div>
  );
}