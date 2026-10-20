import { Link } from "@tanstack/react-router";
import { BookOpen, Star } from "lucide-react";
import type { SeriesRow } from "@/lib/queries";
import { coverUrl } from "@/lib/media";
import { chapterCount } from "@/lib/series-summary";

export function TopRated({ rows }: { rows: SeriesRow[] }) {
  if (rows.length === 0) return null;

  return (
    <section aria-label="Muito bem avaliados" className="relative min-w-0 max-w-full py-4 md:py-8">
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
          <Star className="h-[18px] w-[18px] fill-primary" />
        </div>
        <h2 className="relative shrink-0 text-lg font-bold md:text-2xl">
          Muito bem avaliados
          <span className="absolute -bottom-2 left-0 h-1 w-1/3 rounded-full bg-primary" />
        </h2>
      </div>

      <div className="relative -mx-4 md:-mx-6">
        <div className="pointer-events-none absolute bottom-0 left-0 top-0 z-10 w-16 bg-gradient-to-r from-background to-transparent md:w-20" />
        <div className="pointer-events-none absolute bottom-0 right-0 top-0 z-10 w-16 bg-gradient-to-l from-background to-transparent md:w-20" />
        <div className="no-scrollbar flex gap-4 overflow-x-auto px-4 pb-4 md:px-6">
          {rows.map((item) => (
            <Link
              key={item.id}
              to="/obra/$slug"
              params={{ slug: item.slug }}
              className="group relative block h-[min(62vw,340px)] w-[min(72vw,280px)] shrink-0 overflow-hidden rounded-2xl border border-foreground/10 bg-card/50 shadow-[0_12px_40px_rgba(0,0,0,0.45)] transition-transform duration-200 active:scale-[0.98]"
            >
              <img
                alt={item.title}
                loading="lazy"
                decoding="async"
                draggable={false}
                className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                src={coverUrl(item.cover_url)}
              />
              <div
                className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black via-black/55 to-black/10"
                aria-hidden="true"
              />
              <div className="absolute inset-x-0 bottom-0 z-[1] p-4 pt-16">
                <h3 className="mb-2 line-clamp-2 text-[1.2rem] font-bold leading-tight tracking-tight text-white">
                  {item.title}
                </h3>
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className="inline-flex max-w-full items-center gap-1 rounded-md bg-black/55 px-2 py-1 text-[11px] font-semibold text-white/90 shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--primary)_33%,transparent)]">
                    <BookOpen className="h-3 w-3 shrink-0 opacity-80" />
                    <span className="truncate">{item.kind}</span>
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-md bg-black/55 px-2 py-1 text-[11px] font-semibold tabular-nums text-amber-50">
                    <Star className="h-3 w-3 shrink-0 fill-gold text-gold" />
                    {Number(item.rating).toFixed(1).replace(".", ",")}
                  </span>
                </div>
                <p className="text-[13px] text-white/60">{chapterCount(item)} capítulos</p>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
