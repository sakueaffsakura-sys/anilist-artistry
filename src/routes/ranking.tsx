import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Eye, Heart, MessageCircle, Trophy, Users } from "lucide-react";
import { SiteFooter, SiteHeader } from "@/components/SiteHeader";
import { PageTitle } from "@/components/LibraryBits";
import { supabase } from "@/integrations/supabase/client";
import { coverUrl } from "@/lib/media";
import { compactNumber, formatRating } from "@/lib/format";
import { fetchSeries } from "@/lib/queries";

export const Route = createFileRoute("/ranking")({
  staticData: { sitemap: true },
  head: () => ({
    meta: [
      { title: "Ranking de obras — Better Mangá" },
      { name: "description", content: "As obras mais lidas, com mais reações e mais comentadas dos últimos 7 dias no Better Mangá." },
      { property: "og:title", content: "Ranking de obras — Better Mangá" },
      { property: "og:description", content: "Top 20 de obras por leituras, reações e comentários nos últimos 7 dias." },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://bettermanga.net/ranking" },
      { name: "twitter:card", content: "summary" },
    ],
    links: [{ rel: "canonical", href: "https://bettermanga.net/ranking" }],
  }),
  component: Ranking,
});

type ObraRank = { id: string; slug: string; title: string; cover_url: string | null; rating: number; total: number };
type Metric = "views" | "reactions" | "comments";

const METRICS: { key: Metric; label: string; unit: [string, string]; icon: typeof Eye }[] = [
  { key: "views", label: "Leituras", unit: ["leitura", "leituras"], icon: Eye },
  { key: "reactions", label: "Reações", unit: ["reação", "reações"], icon: Heart },
  { key: "comments", label: "Comentários", unit: ["comentário", "comentários"], icon: MessageCircle },
];

/** Lista numerada (a mesma da home): posição, capa pequena, título e o total da métrica. */
function RankList({ rows, unit }: { rows: ObraRank[]; unit: [string, string] }) {
  return (
    <ol className="rank-list">
      {rows.map((obra, index) => (
        <li key={obra.id} className="rank-row" data-rank={index + 1}>
          <span className="rank-pos" aria-label={`${index + 1}º lugar`}>{index + 1}</span>
          <Link to="/obra/$slug" params={{ slug: obra.slug }} tabIndex={-1} aria-hidden="true">
            <img src={coverUrl(obra.cover_url)} alt="" loading="lazy" decoding="async" />
          </Link>
          <div className="min-w-0">
            <h3 className="line-clamp-2"><Link to="/obra/$slug" params={{ slug: obra.slug }}>{obra.title}</Link></h3>
            <p className="card-meta mt-0.5">
              <span title={obra.total.toLocaleString("pt-BR")}>{compactNumber(obra.total)} {obra.total === 1 ? unit[0] : unit[1]}</span>
              {obra.rating > 0 ? <span>Nota {formatRating(obra.rating)}</span> : null}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}

function ObrasRankings() {
  const [metric, setMetric] = useState<Metric>("views");
  const active = METRICS.find((m) => m.key === metric)!;

  const list = useQuery({
    queryKey: ["obra-ranking", metric],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("obra_ranking", { _metric: metric });
      if (error) throw error;
      return (data ?? []).map((r) => ({ ...r, rating: Number(r.rating), total: Number(r.total) })) as ObraRank[];
    },
  });
  // Sem leituras registradas na semana: mostra as mais lidas de sempre, para a página nunca ficar vazia.
  const weekEmpty = list.isSuccess && (list.data?.length ?? 0) === 0;
  const allTime = useQuery({
    queryKey: ["series", "views", 20],
    enabled: weekEmpty && metric === "views",
    queryFn: () => fetchSeries({ order: "views", limit: 20 }),
  });
  const allTimeRows: ObraRank[] = (allTime.data ?? []).map((s) => ({ id: s.id, slug: s.slug, title: s.title, cover_url: s.cover_url, rating: Number(s.rating), total: s.views }));
  const rows = list.data ?? [];

  return (
    <section>
      <div className="chip-row" role="tablist" aria-label="Medir por">
        {METRICS.map(({ key, label, icon: Icon }) => (
          <button key={key} type="button" role="tab" aria-selected={metric === key} aria-pressed={metric === key} onClick={() => setMetric(key)} className="chip chip-sm">
            <Icon aria-hidden="true" />
            {label}
          </button>
        ))}
      </div>

      {list.isLoading ? <p role="status" className="py-8 text-sm text-muted-foreground">Carregando ranking…</p> : null}
      {list.isError ? <p role="alert" className="py-8 text-sm text-muted-foreground">Não foi possível carregar o ranking.</p> : null}

      {rows.length ? (
        <>
          <p className="mb-1 mt-3 text-[13px] text-muted-foreground">Últimos 7 dias · top {rows.length}</p>
          <RankList rows={rows} unit={active.unit} />
        </>
      ) : null}

      {weekEmpty ? (
        metric === "views" && allTimeRows.length ? (
          <>
            <p className="mb-1 mt-3 text-[13px] text-muted-foreground">Ainda não há leituras registradas nesta semana. Estas são as mais lidas de todos os tempos.</p>
            <RankList rows={allTimeRows} unit={active.unit} />
          </>
        ) : metric !== "views" ? (
          <p className="py-8 text-sm text-muted-foreground">Ainda sem {active.label.toLowerCase()} nos últimos 7 dias.</p>
        ) : null
      ) : null}
    </section>
  );
}

function Ranking() {
  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="site-content mx-auto max-w-5xl px-4 py-6 sm:px-6 md:py-8">
        <PageTitle icon={<Trophy />} title="Ranking" subtitle="As obras que mais movimentaram o Better Mangá." />
        <div className="mb-4 flex gap-1.5" role="navigation" aria-label="Tipo de ranking">
          <Link to="/ranking" className="chip" aria-current="page"><Trophy />Obras</Link>
          <Link to="/ranking-leitores" className="chip"><Users />Leitores</Link>
        </div>
        <ObrasRankings />
      </main>
      <SiteFooter />
    </div>
  );
}
