import { useRef } from "react";
import { Link } from "@tanstack/react-router";
import { BookOpen, ChevronLeft, ChevronRight, Heart, Star } from "lucide-react";
import type { SeriesRow } from "@/lib/queries";
import { coverUrl, formatChapter, timeAgo } from "@/lib/media";
import { chapterCount } from "@/lib/series-summary";

export function FavoritesUpdated({ rows }: { rows: SeriesRow[] }) {
  const scroller = useRef<HTMLDivElement>(null);
  const scrollBy = (delta: number) =>
    scroller.current?.scrollBy({ left: delta, behavior: "smooth" });

  if (rows.length === 0) return null;

  return (
    <section aria-label="Favoritas atualizadas" className="relative min-w-0 max-w-full py-4 md:py-8">
      <div className="mb-6 flex items-center gap-3">
        <h2 className="section-title"><Heart className="h-[18px] w-[18px]" />Favoritas atualizadas</h2>
        <div className="ml-auto hidden items-center justify-end gap-2 md:flex">
          <button
            type="button"
            title="Anterior"
            onClick={() => scrollBy(-420)}
            className="cursor-pointer rounded-full border border-foreground/10 bg-card/40 p-2 text-muted-foreground shadow-sm transition-all duration-200 hover:scale-110 hover:border-foreground/20 hover:bg-card/60 hover:text-foreground active:scale-95"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            type="button"
            title="Próximo"
            onClick={() => scrollBy(420)}
            className="cursor-pointer rounded-full border border-foreground/10 bg-card/40 p-2 text-muted-foreground shadow-sm transition-all duration-200 hover:scale-110 hover:border-foreground/20 hover:bg-card/60 hover:text-foreground active:scale-95"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
      </div>

      <div className="relative -mx-4">
        <div className="pointer-events-none absolute bottom-4 left-0 top-0 z-10 w-14 bg-gradient-to-r from-background to-transparent md:w-16" />
        <div className="pointer-events-none absolute bottom-4 right-0 top-0 z-10 w-14 bg-gradient-to-l from-background to-transparent md:w-16" />
        <div
          ref={scroller}
          className="no-scrollbar cursor-grab select-none overflow-x-auto overflow-y-hidden pb-4 pl-4 pr-6 active:cursor-grabbing"
        >
          <div className="flex gap-4 sm:gap-6">
            {rows.map((item) => {
              const latest = item.chapters[0];
              return (
                <div
                  key={item.id}
                  className="group flex w-[160px] min-w-[160px] max-w-[160px] shrink-0 flex-col"
                >
                  <Link
                    to="/obra/$slug"
                    params={{ slug: item.slug }}
                    className="relative mb-2 block aspect-[3/4] w-full shrink-0 overflow-hidden rounded-md border border-destructive/30 bg-card/60 text-left no-underline transition-[transform,border-color,box-shadow] duration-200 group-hover:-translate-y-0.5 group-hover:border-destructive/45 group-hover:shadow-[0_18px_42px_rgba(0,0,0,0.45)] active:scale-95"
                  >
                    <span
                      className="pointer-events-none absolute inset-0 z-[2] rounded-md shadow-[inset_0_0_0_2px_var(--destructive)] opacity-60"
                      aria-hidden="true"
                    />
                    <img
                      src={coverUrl(item.cover_url)}
                      alt={item.title}
                      draggable={false}
                      loading="lazy"
                      decoding="async"
                      className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                    <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/10" />
                    <span
                      className="pointer-events-none absolute bottom-2 left-2 z-[12] inline-flex max-w-[calc(100%-1rem)] items-center gap-2 rounded-full border border-foreground/15 bg-black/25 px-2 py-1 shadow-[0_2px_14px_rgba(0,0,0,0.45)] backdrop-blur-2xl"
                      title={`${chapterCount(item)} capítulos · média ${Number(item.rating).toFixed(1).replace(".", ",")}/10`}
                    >
                      <span className="inline-flex shrink-0 items-center gap-1">
                        <BookOpen className="h-[11px] w-[11px] shrink-0 text-white" strokeWidth={2.5} />
                        <span className="text-[10px] font-extrabold tabular-nums leading-none text-white">
                          {chapterCount(item)}
                        </span>
                      </span>
                      <span className="h-3 w-px shrink-0 bg-white/20" aria-hidden="true" />
                      <span className="inline-flex min-w-0 shrink-0 items-center gap-0.5">
                        <Star className="h-[11px] w-[11px] shrink-0 fill-gold text-gold" />
                        <span className="text-[10px] font-extrabold tabular-nums leading-none text-gold">
                          {Number(item.rating).toFixed(1).replace(".", ",")}
                        </span>
                      </span>
                    </span>
                    <span className="absolute right-2 top-2 z-10 flex h-9 w-9 items-center justify-center rounded-full border border-destructive/35 bg-black/45 text-destructive shadow-[0_10px_24px_rgba(0,0,0,0.28)] backdrop-blur-md">
                      <Heart className="h-[18px] w-[18px] fill-current" strokeWidth={2.2} />
                    </span>
                  </Link>
                  <div className="flex min-h-[2.25rem] items-start px-0.5 text-left">
                    <div className="w-full min-w-0">
                      <Link
                        to="/obra/$slug"
                        params={{ slug: item.slug }}
                        className="no-underline"
                      >
                        <h3 className="line-clamp-2 text-[13px] font-semibold leading-tight text-foreground transition-colors group-hover:text-foreground/80">
                          {item.title}
                        </h3>
                      </Link>
                      {latest ? (
                        <Link
                          to="/obra/$slug/$chapter"
                          params={{ slug: item.slug, chapter: String(latest.number) }}
                          className="mt-2 flex w-full items-center justify-between gap-1 rounded-lg bg-foreground/[0.05] px-2 py-1.5 no-underline transition-colors hover:bg-foreground/[0.09]"
                        >
                          <span className="truncate text-[11px] font-bold text-foreground/90">
                            Cap. {formatChapter(latest.number)}
                          </span>
                          <span className="shrink-0 text-[10px] font-bold tabular-nums text-muted-foreground">
                            {timeAgo(latest.created_at)}
                          </span>
                        </Link>
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
