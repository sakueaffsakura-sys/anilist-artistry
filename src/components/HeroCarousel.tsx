import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Heart, Play } from "lucide-react";
import type { SeriesRow } from "@/lib/queries";
import { coverUrl, formatChapter } from "@/lib/media";
import { selectHeroItems } from "@/lib/hero-policy";
import { chapterCount } from "@/lib/series-summary";
import { supabase } from "@/integrations/supabase/client";
import { useFavoriteIds } from "@/hooks/useFavoriteIds";
import { useToggleFavorite } from "@/hooks/useToggleFavorite";

const INTERVAL = 7000;
/** Quantas obras aparecem na fila "Em destaque" ao lado. */
const QUEUE_SIZE = 5;

/** Primeiro capítulo publicado da obra (para o botão "Ler capítulo N"). */
function useFirstChapter(seriesId: string | undefined) {
  return useQuery({
    queryKey: ["first-chapter", seriesId],
    enabled: Boolean(seriesId),
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("chapters")
        .select("number")
        .eq("series_id", seriesId!)
        .eq("published", true)
        .order("number", { ascending: true })
        .limit(1);
      if (error) throw error;
      const number = data?.[0]?.number;
      return typeof number === "number" ? number : null;
    },
  });
}

/** Destaques da home: capa grande, dados da obra e a fila "Em destaque" com as próximas obras. */
export function HeroCarousel({ items }: { items: SeriesRow[] }) {
  const favoriteIds = useFavoriteIds();
  const { toggle, pending } = useToggleFavorite();
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
  const first = useFirstChapter(active?.id);
  if (!active) return null;

  const go = (delta: number) => setIndex((current) => (current + delta + slides.length) % slides.length);
  const saved = favoriteIds.has(active.id);
  const total = chapterCount(active);
  const firstNumber = first.data ?? 1;
  const queue = Array.from({ length: Math.min(QUEUE_SIZE, slides.length) }, (_, offset) => {
    const at = (index + offset) % slides.length;
    return { at, item: slides[at]! };
  });
  const synopsis = (active.synopsis ?? "").replace(/<[^>]*>/g, "").trim();

  return (
    <section
      ref={sectionRef}
      aria-label="Destaques"
      aria-roledescription="carrossel"
      className="home-hero"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onTouchStart={(event) => { touchStart.current = event.touches[0]?.clientX ?? null; }}
      onTouchEnd={(event) => {
        const end = event.changedTouches[0]?.clientX;
        if (touchStart.current !== null && end !== undefined && Math.abs(end - touchStart.current) > 55 && slides.length > 1) go(end < touchStart.current ? 1 : -1);
        touchStart.current = null;
      }}
    >
      <div className="home-hero-inner">
        <div className="hero-glow" aria-hidden="true" />
        <div className="home-hero-grid">
          <div className="home-hero-main" key={active.id}>
            <Link to="/obra/$slug" params={{ slug: active.slug }} className="home-hero-cover">
              <img src={coverUrl(active.cover_url)} alt={`Capa de ${active.title}`} decoding="async" fetchPriority="high" draggable={false} />
            </Link>
            <div className="home-hero-info">
              <p className="home-hero-eyebrow">
                Destaque{slides.length > 1 ? <span style={{ color: "#737373" }}> · {index + 1} de {slides.length}</span> : null}
              </p>
              <h2 className="home-hero-title">
                <Link to="/obra/$slug" params={{ slug: active.slug }}>{active.title}</Link>
              </h2>
              <p className="home-hero-meta">{total.toLocaleString("pt-BR")} {total === 1 ? "capítulo" : "capítulos"}</p>
              {synopsis ? <p className="home-hero-synopsis">{synopsis}</p> : null}
              <div className="home-hero-actions">
                {first.data != null ? (
                  <Link to="/obra/$slug/$chapter" params={{ slug: active.slug, chapter: formatChapter(firstNumber) }} className="hero-btn hero-btn-primary">
                    <Play aria-hidden="true" />Ler capítulo {formatChapter(firstNumber)}
                  </Link>
                ) : (
                  <Link to="/obra/$slug" params={{ slug: active.slug }} className="hero-btn hero-btn-primary">
                    <Play aria-hidden="true" />Ler capítulo {formatChapter(firstNumber)}
                  </Link>
                )}
                <Link to="/obra/$slug" params={{ slug: active.slug }} className="hero-btn hero-btn-soft">Detalhes da obra</Link>
                <button
                  type="button"
                  className="hero-icon-btn"
                  aria-pressed={saved}
                  aria-label={saved ? "Remover dos favoritos" : "Adicionar aos favoritos"}
                  title={saved ? "Remover dos favoritos" : "Adicionar aos favoritos"}
                  disabled={pending}
                  onClick={() => toggle(active.id, saved)}
                >
                  <Heart aria-hidden="true" />
                </button>
              </div>
            </div>
          </div>

          {slides.length > 1 ? (
            <aside className="home-hero-side" aria-label="Em destaque">
              <div className="home-hero-side-head">
                <span>Em destaque</span>
                <div>
                  <button type="button" className="circle-btn" aria-label="Destaque anterior" onClick={() => go(-1)}><ChevronLeft aria-hidden="true" /></button>
                  <button type="button" className="circle-btn" aria-label="Próximo destaque" onClick={() => go(1)}><ChevronRight aria-hidden="true" /></button>
                </div>
              </div>
              <div className="hero-queue">
                {queue.map(({ at, item }) => (
                  <button
                    key={item.id}
                    type="button"
                    className="hero-queue-item"
                    aria-current={at === index ? "true" : undefined}
                    onClick={() => setIndex(at)}
                  >
                    <span className="hero-queue-thumb"><img src={coverUrl(item.cover_url)} alt="" loading="lazy" decoding="async" /></span>
                    <span className="title">{item.title}</span>
                  </button>
                ))}
              </div>
            </aside>
          ) : <div className="home-hero-side" />}
        </div>
      </div>
    </section>
  );
}
