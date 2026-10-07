import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { BookOpen, ChevronLeft, ChevronRight, Bookmark, Star } from "lucide-react";
import type { SeriesRow } from "@/lib/queries";
import { KINDS } from "@/lib/queries";
import { coverUrl, formatChapter, timeAgo } from "@/lib/media";
import { Button } from "@/components/ui/button";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useSession } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const INTERVAL = 6000;
const CATEGORY_LABELS = [...KINDS];

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
  const allSlides = useMemo(() => items.slice(0, 10), [items]);
  const kinds = useMemo(() => new Set(allSlides.map((item) => item.kind).filter(Boolean)), [allSlides]);
  const [kind, setKind] = useState(() => allSlides[0]?.kind ?? "");
  const slides = useMemo(
    () => (kind ? allSlides.filter((item) => item.kind === kind) : allSlides),
    [allSlides, kind],
  );
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => setIndex(0), [kind]);

  useEffect(() => {
    if (index >= slides.length) setIndex(0);
  }, [slides.length, index]);

  useEffect(() => {
    if (paused || slides.length < 2) return;
    timer.current = setInterval(() => {
      if (document.hidden) return; // não trabalha com a aba em segundo plano
      setIndex((current) => (current + 1) % slides.length);
    }, INTERVAL);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [paused, slides.length]);

  const touchStart = useRef<number | null>(null);

  if (allSlides.length === 0) return null;

  const active = slides[index] ?? slides[0] ?? null;
  const go = (delta: number) =>
    setIndex((current) => (current + delta + slides.length) % slides.length);

  const categoryBar = (
    <div className="mx-auto mb-5 hidden w-full max-w-[1400px] justify-center px-6 md:flex">
      <div className="no-scrollbar inline-flex max-w-full items-center gap-0.5 overflow-x-auto rounded-full border border-foreground/10 bg-card/70 px-1 py-1 backdrop-blur-sm">
        {CATEGORY_LABELS.map((label) => (
          <Button
            key={label}
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => setKind(label)}
            className={`h-8 shrink-0 rounded-full px-4 text-[11px] font-semibold whitespace-nowrap transition-all duration-200 ease-out active:scale-[0.97] ${
              kind === label
                ? "ring-1 ring-foreground/80 bg-primary text-primary-foreground shadow-[var(--shadow-glow)] hover:bg-primary"
                : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
            }`}
          >
            {label}
          </Button>
        ))}
      </div>
    </div>
  );

  if (!active) {
    return (
      <section aria-label="Destaques" className="w-full overflow-hidden bg-background pb-6 pt-4 md:pb-8 md:pt-5">
        {categoryBar}
        <div className="mx-auto max-w-7xl px-4 md:px-6">
          <div className="flex min-h-[16rem] flex-col items-center justify-center gap-4 rounded-2xl border border-foreground/10 bg-card/60 py-10 text-center backdrop-blur-sm">
            <BookOpen className="h-8 w-8 text-muted-foreground" />
            <p className="max-w-sm text-sm text-muted-foreground">
              Nenhuma obra de <span className="font-bold text-foreground">{kind}</span> no slide ainda.
            </p>
            <Button asChild size="sm" className="rounded-full px-5 text-xs font-black uppercase shadow-[var(--shadow-glow)]">
              <Link to="/catalogo" search={{ kind }}>
                Explorar {kind} no catálogo
              </Link>
            </Button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section
      aria-label="Destaques"
      className="w-full overflow-hidden bg-background pb-6 pt-4 md:pb-8 md:pt-5"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {kinds.size > 0 ? categoryBar : null}

      <div className="relative isolate" onTouchStart={(event) => { touchStart.current = event.touches[0]?.clientX ?? null; }} onTouchEnd={(event) => {
        const end = event.changedTouches[0]?.clientX;
        if (touchStart.current !== null && end !== undefined && Math.abs(end - touchStart.current) > 55 && slides.length > 1) go(end < touchStart.current ? 1 : -1);
        touchStart.current = null;
      }}>
        {active.banner_url ? <img src={coverUrl(active.banner_url)} alt="" aria-hidden="true" decoding="async" className="absolute inset-0 -z-20 h-full w-full object-cover" /> : null}
        <div className="hero-reference-shade absolute inset-0 -z-10" />
        <div className="mx-auto grid max-w-7xl grid-cols-[110px_minmax(0,1fr)] gap-5 px-4 py-7 md:grid-cols-[240px_minmax(0,1fr)] md:gap-10 md:px-6 md:py-10 lg:grid-cols-[280px_minmax(0,1fr)]">
          <Link to="/obra/$slug" params={{ slug: active.slug }} className="relative self-start overflow-hidden rounded-lg shadow-[var(--shadow-hero)]">
            <img src={coverUrl(active.cover_url)} alt={`Capa de ${active.title}`} className="aspect-[2/3] w-full object-cover" decoding="async" fetchPriority="high" draggable={false} />
            <span className="absolute left-2 top-2 flex items-center gap-1 rounded bg-background/90 px-2 py-1 text-xs font-bold text-gold"><Star className="h-3 w-3 fill-current" />{Number(active.rating).toFixed(1)}</span>
          </Link>
          <div className="min-w-0 self-center">
            <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs">
              <span className="font-bold text-primary">{active.status}</span>
              {(active.genres ?? []).slice(0, 3).map((genre) => <span key={genre} className="text-muted-foreground">{genre}</span>)}
            </div>
            <h2 className="break-words font-display text-xl font-extrabold leading-tight md:text-3xl lg:text-4xl"><Link to="/obra/$slug" params={{ slug: active.slug }}>{active.title}</Link></h2>
            <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted-foreground md:text-sm">
              <span className="flex items-center gap-2 text-gold"><span className="flex gap-0.5" aria-hidden="true">{Array.from({ length: 5 }, (_, star) => <Star key={star} className={`h-3.5 w-3.5 ${star < Math.round(Number(active.rating) / 2) ? "fill-current" : "fill-none opacity-40"}`} />)}</span>{Number(active.rating).toFixed(1)}</span>
              <span className="inline-flex items-center gap-1.5"><BookOpen className="h-4 w-4" />{active.kind}</span>
              <span>{active.chapters.length} capítulos disponíveis</span>
            </div>
            {active.synopsis ? <p className="mt-4 hidden max-w-3xl text-sm leading-7 text-foreground/80 line-clamp-3 md:[display:-webkit-box]">{active.synopsis.replace(/<[^>]*>/g, "")}</p> : null}
            <div className="mt-5 flex flex-wrap items-center gap-2">
              <Button asChild className="rounded-md font-bold"><Link to="/obra/$slug" params={{ slug: active.slug }}><BookOpen className="h-4 w-4" /><span className="md:hidden">Capítulos</span><span className="hidden md:inline">Ver todos os capítulos</span></Link></Button>
              <Button variant="outline" size="icon" className={`shrink-0 rounded-md bg-background/60 ${favoriteIds.has(active.id) ? "text-primary" : "text-foreground"}`} title={favoriteIds.has(active.id) ? "Remover dos favoritos" : "Favoritar"} aria-label={favoriteIds.has(active.id) ? "Remover dos favoritos" : "Favoritar"} aria-pressed={favoriteIds.has(active.id)} disabled={toggleFavorite.isPending} onClick={() => toggleFavorite.mutate({ id: active.id, saved: favoriteIds.has(active.id) })}><Bookmark className={`h-4 w-4 ${favoriteIds.has(active.id) ? "fill-current" : ""}`} /></Button>
            </div>
          </div>
          <div className="col-span-2 md:col-start-2 md:col-span-1">
            {active.synopsis ? <p className="mb-5 line-clamp-3 text-sm leading-6 text-muted-foreground md:hidden">{active.synopsis.replace(/<[^>]*>/g, "")}</p> : null}
            {active.chapters.length ? <div className="max-w-3xl divide-y divide-border border-y border-border">
              {active.chapters.slice(0, 2).map((chapter) => <Link key={chapter.id} to="/obra/$slug/$chapter" params={{ slug: active.slug, chapter: formatChapter(chapter.number) }} className="flex items-center justify-between gap-4 py-3 text-xs transition-colors hover:text-primary md:text-sm"><span className="truncate font-semibold">Cap. {formatChapter(chapter.number)}{chapter.title ? ` — ${chapter.title}` : ""}</span><span className="shrink-0 text-xs text-muted-foreground">{timeAgo(chapter.created_at)}</span></Link>)}
            </div> : null}
          </div>
        </div>
        {slides.length > 1 ? <div className="mx-auto flex max-w-7xl items-center justify-end gap-3 px-4 pb-4 md:px-6">
          <Button size="icon" variant="ghost" aria-label="Destaque anterior" onClick={() => go(-1)}><ChevronLeft className="h-4 w-4" /></Button>
          <span className="text-xs tabular-nums text-muted-foreground">{index + 1} / {slides.length}</span>
          <Button size="icon" variant="ghost" aria-label="Próximo destaque" onClick={() => go(1)}><ChevronRight className="h-4 w-4" /></Button>
        </div> : null}
      </div>
    </section>
  );
}
