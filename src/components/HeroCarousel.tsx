import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { BookOpen, ChevronLeft, ChevronRight, Heart, Star } from "lucide-react";
import { AgeRatingBadge } from "@/components/AgeRatingBadge";
import type { SeriesRow } from "@/lib/queries";
import { coverUrl, formatChapter, timeAgo } from "@/lib/media";
import { Button } from "@/components/ui/button";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useSession } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { selectHeroItems } from "@/lib/hero-policy";
import { normalizeGenres } from "@/lib/work-genres";
import { chapterCount } from "@/lib/series-summary";
import { activeProfileId } from "@/lib/active-profile";
import { formatRating } from "@/lib/format";
import { kindLabel } from "@/lib/work-categories";
import { cn } from "@/lib/utils";

const INTERVAL = 7000;

/** Destaques da home: faixa com a arte da obra desfocada ao fundo, capa, dados e os capítulos mais novos. */
export function HeroCarousel({ items, favoriteIds }: { items: SeriesRow[]; favoriteIds: Set<string> }) {
  const { user } = useSession();
  const queryClient = useQueryClient();
  const toggleFavorite = useMutation({
    mutationFn: async ({ id, saved }: { id: string; saved: boolean }) => {
      if (!user) throw new Error("Entre na sua conta para favoritar.");
      const { error } = saved
        ? await supabase.from("favorites").delete().eq("user_id", user.id).eq("profile_id", activeProfileId()).eq("series_id", id)
        : await supabase.from("favorites").insert({ user_id: user.id, profile_id: activeProfileId(), series_id: id });
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["favorites"] }); },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Não foi possível atualizar os favoritos."),
  });
  const slides = useMemo(() => selectHeroItems(items), [items]);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [visible, setVisible] = useState(true);
  const sectionRef = useRef<HTMLElement>(null);
  const touchStart = useRef<number | null>(null);

  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;
    const observer = new IntersectionObserver(([entry]) => setVisible(entry?.isIntersecting ?? false));
    observer.observe(section);
    return () => observer.disconnect();
  }, [slides.length > 0]);

  useEffect(() => {
    if (index >= slides.length) setIndex(0);
  }, [slides.length, index]);

  useEffect(() => {
    if (paused || !visible || slides.length < 2) return;
    const timer = setInterval(() => {
      if (document.hidden) return; // não trabalha com a aba em segundo plano
      setIndex((current) => (current + 1) % slides.length);
    }, INTERVAL);
    return () => clearInterval(timer);
  }, [paused, visible, slides.length, index]);

  const active = slides[index] ?? slides[0] ?? null;
  if (!active) return null;
  const go = (delta: number) => setIndex((current) => (current + delta + slides.length) % slides.length);
  const saved = favoriteIds.has(active.id);
  const score = Number(active.rating ?? 0);

  return (
    <section
      ref={sectionRef}
      aria-label="Destaques"
      aria-roledescription="carrossel"
      className="home-banner"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onTouchStart={(event) => { touchStart.current = event.touches[0]?.clientX ?? null; }}
      onTouchEnd={(event) => {
        const end = event.changedTouches[0]?.clientX;
        if (touchStart.current !== null && end !== undefined && Math.abs(end - touchStart.current) > 55 && slides.length > 1) go(end < touchStart.current ? 1 : -1);
        touchStart.current = null;
      }}
    >
      <img key={active.id} src={coverUrl(active.banner_url || active.cover_url)} alt="" aria-hidden="true" decoding="async" className="home-banner-bg" />
      <div className="home-banner-shade" />
      <div className="mx-auto max-w-7xl px-4 pb-5 pt-5 sm:px-6 md:pb-8 md:pt-9 lg:px-8">
        <div className="grid grid-cols-[96px_minmax(0,1fr)] gap-4 sm:grid-cols-[150px_minmax(0,1fr)] md:grid-cols-[190px_minmax(0,1fr)] md:gap-7">
          <Link to="/obra/$slug" params={{ slug: active.slug }} className="self-start">
            <img src={coverUrl(active.cover_url)} alt={`Capa de ${active.title}`} className="home-banner-cover aspect-[2/3] w-full object-cover" decoding="async" fetchPriority="high" draggable={false} />
          </Link>
          <div key={active.id} className="min-w-0">
            <p className="text-xs font-semibold text-primary sm:text-[13px]">
              Destaque{slides.length > 1 ? <span className="text-muted-foreground"> · {index + 1} de {slides.length}</span> : null}
            </p>
            <h2 className="mt-1 line-clamp-2 font-display text-lg font-bold leading-tight sm:text-2xl md:text-3xl">
              <Link to="/obra/$slug" params={{ slug: active.slug }} className="hover:text-primary">{active.title}</Link>
            </h2>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground sm:text-[13px]">
              {score > 0 ? <span className="inline-flex items-center gap-1 font-semibold text-foreground"><Star className="h-3.5 w-3.5 fill-gold text-gold" />{formatRating(score)}</span> : null}
              <span>{chapterCount(active).toLocaleString("pt-BR")} capítulos</span>
              <span>{kindLabel(active.kind)}</span>
              <span>{active.status}</span>
              <AgeRatingBadge value={active.age_rating} size="sm" variant="solid" />
            </div>
            <div className="mt-2.5 hidden flex-wrap gap-1.5 sm:flex">
              {normalizeGenres(active.genres ?? []).slice(0, 4).map((genre) => (
                <Link key={genre} to="/catalogo" search={{ tag: genre }} className="home-banner-tag">{genre}</Link>
              ))}
            </div>
            {active.synopsis ? (
              <p className="mt-3 hidden max-w-3xl text-sm leading-relaxed text-foreground/80 sm:[display:-webkit-box] sm:line-clamp-3">
                {active.synopsis.replace(/<[^>]*>/g, "")}
              </p>
            ) : null}
            {active.chapters.length ? (
              <div className="mt-3 hidden flex-wrap gap-2 sm:flex">
                {active.chapters.slice(0, 2).map((chapter) => (
                  <Link key={chapter.id} to="/obra/$slug/$chapter" params={{ slug: active.slug, chapter: formatChapter(chapter.number) }} className="home-banner-chapter" title={chapter.title ?? `Capítulo ${formatChapter(chapter.number)}`}>
                    Cap. {formatChapter(chapter.number)} <span>{timeAgo(chapter.created_at)}</span>
                  </Link>
                ))}
              </div>
            ) : null}
          </div>
        </div>
        {active.synopsis ? (
          <p className="mt-3 line-clamp-2 text-[13px] leading-relaxed text-foreground/80 sm:hidden">{active.synopsis.replace(/<[^>]*>/g, "")}</p>
        ) : null}
        <div className="mt-4 flex items-center gap-2 md:mt-5">
          <Button asChild className="h-10 px-4">
            <Link to="/obra/$slug" params={{ slug: active.slug }}><BookOpen className="h-4 w-4" />Ver obra</Link>
          </Button>
          <Button
            variant="secondary"
            className="h-10 px-3 sm:px-4"
            aria-pressed={saved}
            disabled={toggleFavorite.isPending}
            onClick={() => (user ? toggleFavorite.mutate({ id: active.id, saved }) : toast.info("Entre na sua conta para favoritar."))}
          >
            <Heart className={cn("h-4 w-4", saved && "fill-favorite text-favorite")} />
            <span className="hidden min-[400px]:inline">{saved ? "Nos favoritos" : "Favoritar"}</span>
          </Button>
          {slides.length > 1 ? (
            <div className="ml-auto flex items-center gap-1.5">
              <span className="mr-1 hidden text-xs font-semibold text-muted-foreground tabular-nums sm:inline">{index + 1} / {slides.length}</span>
              <Button size="icon" variant="secondary" className="h-10 w-10" aria-label="Destaque anterior" onClick={() => go(-1)}><ChevronLeft className="h-4 w-4" /></Button>
              <Button size="icon" variant="secondary" className="h-10 w-10" aria-label="Próximo destaque" onClick={() => go(1)}><ChevronRight className="h-4 w-4" /></Button>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
