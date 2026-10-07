import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { BookOpen, ChevronLeft, ChevronRight, Bookmark, Star, Quote, CirclePlus } from "lucide-react";
import type { SeriesRow } from "@/lib/queries";
import { coverUrl, formatChapter, timeAgo } from "@/lib/media";
import { Button } from "@/components/ui/button";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useSession } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const INTERVAL = 6000;

export function HeroCarousel({ items, favoriteIds }: { items: SeriesRow[]; favoriteIds: Set<string> }) {
  const { user } = useSession();
  const queryClient = useQueryClient();
  const toggleFavorite = useMutation({
    mutationFn: async ({ id, saved }: { id: string; saved: boolean }) => {
      if (!user) throw new Error("Entre na sua conta para favoritar.");
      const { error } = saved
        ? await supabase.from("favorites").delete().eq("user_id", user.id).eq("series_id", id)
        : await supabase.from("favorites").insert({ user_id: user.id, series_id: id });
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["favorites"] }); },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Não foi possível atualizar os favoritos."),
  });
  const slides = useMemo(() => items.slice(0, 10), [items]);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [visible, setVisible] = useState(true);
  const sectionRef = useRef<HTMLElement>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;
    const observer = new IntersectionObserver(([entry]) => {
      setVisible(entry?.isIntersecting ?? false);
    });
    observer.observe(section);
    return () => observer.disconnect();
  }, [slides.length > 0]);

  useEffect(() => {
    if (index >= slides.length) setIndex(0);
  }, [slides.length, index]);

  useEffect(() => {
    if (paused || !visible || slides.length < 2) return;
    timer.current = setInterval(() => {
      if (document.hidden) return; // não trabalha com a aba em segundo plano
      setIndex((current) => (current + 1) % slides.length);
    }, INTERVAL);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [paused, visible, slides.length]);

  const touchStart = useRef<number | null>(null);

  if (slides.length === 0) return null;

  const active = slides[index] ?? slides[0] ?? null;
  const go = (delta: number) =>
    setIndex((current) => (current + delta + slides.length) % slides.length);

  if (!active) return null;

  return (
    <section
      ref={sectionRef}
      aria-label="Destaques"
      className="hero-model w-full overflow-hidden pb-6 md:pb-8"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="relative isolate" onTouchStart={(event) => { touchStart.current = event.touches[0]?.clientX ?? null; }} onTouchEnd={(event) => {
        const end = event.changedTouches[0]?.clientX;
        if (touchStart.current !== null && end !== undefined && Math.abs(end - touchStart.current) > 55 && slides.length > 1) go(end < touchStart.current ? 1 : -1);
        touchStart.current = null;
      }}>
        {active.banner_url ? <img src={coverUrl(active.banner_url)} alt="" aria-hidden="true" decoding="async" className="absolute inset-0 -z-20 h-full w-full object-cover" /> : null}
        <div className="hero-reference-shade absolute inset-0 -z-10" />
        <div className="hero-model-layout mx-auto grid max-w-[1400px] grid-cols-[110px_minmax(0,1fr)] gap-5 px-4 py-7 md:grid-cols-[220px_minmax(0,1fr)] md:gap-10 md:px-10 md:py-12 lg:grid-cols-[250px_minmax(0,1fr)] lg:gap-12">
          <Link to="/obra/$slug" params={{ slug: active.slug }} className="relative self-start overflow-hidden rounded-lg shadow-[var(--shadow-hero)]">
            <img src={coverUrl(active.cover_url)} alt={`Capa de ${active.title}`} className="aspect-[2/3] w-full object-cover" decoding="async" fetchPriority="high" draggable={false} />
          </Link>
          <div className="min-w-0">
            <p className="hero-model-status mb-1 text-sm font-bold md:text-base">{active.status}</p>
            <h2 className="break-words font-display text-xl font-extrabold leading-tight md:text-3xl lg:text-4xl"><Link to="/obra/$slug" params={{ slug: active.slug }}>{active.title}</Link></h2>
            <div className="mt-5 flex flex-wrap gap-2 text-xs md:text-sm">
              {(active.genres ?? []).slice(0, 3).map((genre) => <span key={genre} className="hero-model-tag rounded-lg px-2.5 py-1">{genre}</span>)}
            </div>
            {active.synopsis ? <p className="hero-model-synopsis mt-5 hidden text-sm font-semibold italic leading-relaxed line-clamp-3 md:[display:-webkit-box] md:text-base"><Quote className="mr-1 inline h-4 w-4" />{active.synopsis.replace(/<[^>]*>/g, "")}</p> : null}
            <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-3 text-xs md:text-sm">
              <span className="hero-model-rating flex items-center gap-2 text-xl font-extrabold md:text-2xl"><span className="flex gap-0.5" aria-hidden="true">{Array.from({ length: 5 }, (_, star) => <Star key={star} className={`h-4 w-4 md:h-5 md:w-5 ${star < Math.round(Number(active.rating) / 2) ? "fill-current" : "fill-none opacity-40"}`} />)}</span>{Number(active.rating).toFixed(1)}</span>
              <span className="hero-model-tag inline-flex items-center gap-2 rounded-full px-3 py-0.5"><CirclePlus className="hero-model-status h-3 w-3" />{active.chapters.length} capítulos</span>
              <span className="hero-model-tag inline-flex items-center gap-2 rounded-full px-3 py-0.5"><CirclePlus className="hero-model-status h-3 w-3" />{active.kind}</span>
            </div>
            {active.chapters.length ? <div className="mt-5 flex flex-wrap gap-3">
              {active.chapters.slice(0, 2).map((chapter) => <Link key={chapter.id} to="/obra/$slug/$chapter" params={{ slug: active.slug, chapter: formatChapter(chapter.number) }} className="hero-model-chapter inline-flex items-center overflow-hidden rounded-lg text-xs" title={chapter.title ?? `Capítulo ${formatChapter(chapter.number)}`}><span className="hero-model-chapter-icon px-2 py-2"><BookOpen className="h-3.5 w-3.5" /></span><span className="px-1.5 font-semibold">Cap. {formatChapter(chapter.number)}</span><span className="hero-model-synopsis pr-2 text-[10px]">{timeAgo(chapter.created_at)}</span></Link>)}
            </div> : null}
            <div className="mt-8 flex flex-wrap items-center justify-between gap-5 md:mt-10">
              <div className="flex flex-wrap items-center gap-3">
                <Button asChild className="hero-model-read h-12 rounded-full pl-1.5 pr-5 text-sm font-medium md:h-14 md:text-base"><Link to="/obra/$slug" params={{ slug: active.slug }}><span className="hero-model-action-icon mr-1 grid h-9 w-9 place-items-center rounded-full md:h-10 md:w-10"><BookOpen className="h-5 w-5" /></span>Ver todos os capítulos</Link></Button>
                <Button variant="ghost" className="hero-model-favorite h-12 rounded-full pl-1.5 pr-4 text-sm md:h-14 md:text-base" aria-label={favoriteIds.has(active.id) ? "Remover dos favoritos" : "Favoritar"} aria-pressed={favoriteIds.has(active.id)} disabled={toggleFavorite.isPending} onClick={() => toggleFavorite.mutate({ id: active.id, saved: favoriteIds.has(active.id) })}><span className="hero-model-action-icon grid h-9 w-9 place-items-center rounded-full md:h-10 md:w-10"><Bookmark className={`hero-model-bookmark h-5 w-5 ${favoriteIds.has(active.id) ? "fill-current" : ""}`} /></span>{favoriteIds.has(active.id) ? "Nos favoritos" : "Add aos Favoritos"}</Button>
              </div>
              {slides.length > 1 ? <div className="ml-auto flex items-end gap-3">
                <span className="hero-model-dot mb-0.5 mr-5 h-2 w-4 rounded-full" aria-label={`Destaque ${index + 1} de ${slides.length}`} />
                <Button size="icon" variant="outline" className="hero-model-nav h-12 w-12 rounded-full" aria-label="Destaque anterior" onClick={() => go(-1)}><ChevronLeft className="h-4 w-4" /></Button>
                <Button size="icon" variant="outline" className="hero-model-nav h-12 w-12 rounded-full" aria-label="Próximo destaque" onClick={() => go(1)}><ChevronRight className="h-4 w-4" /></Button>
              </div> : null}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
