import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Heart, Star } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { allowedAgeRatings } from "@/lib/active-profile";
import { coverUrl } from "@/lib/media";
import { formatRating } from "@/lib/format";
import { useFavoriteIds } from "@/hooks/useFavoriteIds";
import { useToggleFavorite } from "@/hooks/useToggleFavorite";

type Metric = "views" | "reactions" | "comments";
const TABS: ReadonlyArray<readonly [Metric, string]> = [["views", "Views"], ["reactions", "Reações"], ["comments", "Comentários"]];

type HotRow = { id: string; slug: string; title: string; cover_url: string | null; rating: number; chapters: number };

/** Em alta: as 10 obras da semana por leituras, reações ou comentários (a mesma conta do /ranking). */
export function HotThisWeek() {
  const [metric, setMetric] = useState<Metric>("views");
  const favoriteIds = useFavoriteIds();
  const { toggle, pending } = useToggleFavorite();

  const list = useQuery({
    queryKey: ["home-hot", metric],
    staleTime: 60_000,
    queryFn: async (): Promise<HotRow[]> => {
      const { data, error } = await supabase.rpc("obra_ranking", { _metric: metric });
      if (error) throw error;
      const ranked = (data ?? [])
        .map((row) => ({ ...row, rating: Number(row.rating), total: Number(row.total) }))
        .filter((row) => row.total > 0)
        .slice(0, 10);
      if (ranked.length === 0) return [];
      let meta = supabase.from("series").select("id, chapter_count").eq("published", true).in("id", ranked.map((row) => row.id));
      const kidsAges = allowedAgeRatings();
      if (kidsAges) meta = meta.in("age_rating", kidsAges);
      const { data: counts, error: metaError } = await meta;
      if (metaError) throw metaError;
      const chapters = new Map((counts ?? []).map((row) => [row.id as string, Number(row.chapter_count ?? 0)]));
      return ranked
        .filter((row) => chapters.has(row.id))
        .map((row) => ({ id: row.id, slug: row.slug, title: row.title, cover_url: row.cover_url, rating: row.rating, chapters: chapters.get(row.id) ?? 0 }));
    },
  });
  const rows = list.data ?? [];

  return (
    <section className="home-section" aria-labelledby="hot-title">
      <div className="home-section-head">
        <div className="home-section-title">
          <h2 id="hot-title">Em alta</h2>
          <p>esta semana</p>
        </div>
        <div className="hot-tabs" role="tablist" aria-label="Medir por">
          {TABS.map(([key, label]) => (
            <button key={key} type="button" role="tab" aria-selected={metric === key} onClick={() => setMetric(key)}>{label}</button>
          ))}
        </div>
      </div>
      {list.isError ? <p role="alert" className="py-6 text-sm text-muted-foreground">Não foi possível carregar o ranking.</p> : null}
      {list.isSuccess && rows.length === 0 ? <p className="py-6 text-sm text-muted-foreground">Ainda sem movimento nesta semana.</p> : null}
      {rows.length > 0 ? (
        <ol className="hot-list">
          {rows.map((item, index) => {
            const saved = favoriteIds.has(item.id);
            return (
              <li key={item.id} className="hot-row" data-top={index < 3}>
                <span className="hot-rank" aria-label={`${index + 1}º lugar`}>{index + 1}</span>
                <Link to="/obra/$slug" params={{ slug: item.slug }} className="hot-thumb" tabIndex={-1} aria-hidden="true">
                  <img src={coverUrl(item.cover_url)} alt="" loading="lazy" decoding="async" />
                </Link>
                <div className="hot-info">
                  <h3><Link to="/obra/$slug" params={{ slug: item.slug }}>{item.title}</Link></h3>
                  <p className="hot-meta">
                    <span>{item.chapters.toLocaleString("pt-BR")} caps ·</span>
                    {item.rating > 0 ? <><Star aria-hidden="true" /><span>{formatRating(item.rating)}</span></> : null}
                  </p>
                </div>
                <button
                  type="button"
                  className="hot-heart"
                  aria-pressed={saved}
                  aria-label={saved ? `Remover ${item.title} dos favoritos` : `Adicionar ${item.title} aos favoritos`}
                  disabled={pending}
                  onClick={() => toggle(item.id, saved)}
                >
                  <Heart aria-hidden="true" />
                </button>
              </li>
            );
          })}
        </ol>
      ) : null}
    </section>
  );
}
