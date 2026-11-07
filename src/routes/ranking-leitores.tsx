import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Clock, Crown, Flame, Star, Trophy, Users } from "lucide-react";
import { SiteFooter, SiteHeader } from "@/components/SiteHeader";
import { PageTitle } from "@/components/LibraryBits";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/ranking-leitores")({
  staticData: { sitemap: true },
  head: () => ({
    meta: [
      { title: "Ranking de Leitores — Better Mangá" },
      { name: "description", content: "Ranking semanal e geral de XP dos leitores do Better Mangá." },
      { property: "og:title", content: "Ranking de Leitores — Better Mangá" },
      { property: "og:description", content: "Veja os leitores com mais XP na semana e no ranking geral." },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://bettermanga.net/ranking-leitores" },
      { name: "twitter:card", content: "summary" },
    ],
    links: [{ rel: "canonical", href: "https://bettermanga.net/ranking-leitores" }],
  }),
  component: ReaderRankingPage,
});

type Reader = { id: string; username: string; avatar_url: string | null; level: number; xp: number };
type Period = "weekly" | "total" | "snapshot";

function nextReset() {
  const now = new Date();
  const next = new Date(now);
  next.setUTCHours(0, 0, 0, 0);
  next.setUTCDate(now.getUTCDate() + ((8 - now.getUTCDay()) % 7 || 7));
  const ms = next.getTime() - now.getTime();
  const days = Math.floor(ms / 86400000);
  const hours = Math.floor((ms % 86400000) / 3600000);
  return `${days}d ${hours}h`;
}

function LevelBadge({ level }: { level: number }) {
  const high = level >= 50;
  return (
    <span className={`inline-flex shrink-0 items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-semibold ${high ? "border-gold/35 bg-gold/10 text-gold" : "border-primary/30 bg-primary/10 text-primary"}`}>
      {high ? <Star className="h-3 w-3" /> : <Flame className="h-3 w-3" />} Nv. {level}
    </span>
  );
}

function Avatar({ reader, className }: { reader: Reader; className: string }) {
  return (
    <span className={`grid place-items-center overflow-hidden rounded-full bg-surface-2 font-medium text-primary ${className}`}>
      {reader.avatar_url ? <img loading="lazy" decoding="async" src={reader.avatar_url} alt={reader.username} className="h-full w-full object-cover" /> : reader.username.slice(0, 2).toUpperCase()}
    </span>
  );
}

function ReaderRankingPage() {
  const [period, setPeriod] = useState<Period>("weekly");
  const [reset, setReset] = useState("");
  useEffect(() => setReset(nextReset()), []);

  const list = useQuery({
    queryKey: ["xp-ranking", period],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("xp_ranking", { _period: period });
      if (error) throw error;
      return (data ?? []).map((row) => ({ ...row, xp: Number(row.xp) })) as Reader[];
    },
  });
  const rows = list.data ?? [];
  const [first, second, third] = rows;
  const podiumReaders = [second, first, third];
  const podiumPlaces = [2, 1, 3] as const;

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="site-content mx-auto max-w-5xl px-4 py-6 sm:px-6 md:py-8">
        <PageTitle
          icon={<Trophy />}
          title="Ranking"
          subtitle={period === "weekly" ? "Quem mais ganhou XP nesta semana." : period === "total" ? "Quem mais acumulou XP desde sempre." : "Resultado da última semana encerrada."}
        />
        <div className="mb-4 flex gap-1.5" role="navigation" aria-label="Tipo de ranking">
          <Link to="/ranking" className="chip"><Trophy />Obras</Link>
          <Link to="/ranking-leitores" className="chip" aria-current="page"><Users />Leitores</Link>
        </div>

        <section>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="chip-row" role="tablist" aria-label="Período">
              {([['weekly', 'Semanal'], ['total', 'Total'], ['snapshot', 'Última semana']] as const).map(([key, label]) => (
                <button key={key} type="button" role="tab" aria-selected={period === key} aria-pressed={period === key} onClick={() => setPeriod(key)} className="chip chip-sm">{label}</button>
              ))}
            </div>
            {period === "weekly" && reset ? <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Clock className="h-3.5 w-3.5" /> Recomeça em <b className="text-foreground">{reset}</b></p> : null}
          </div>

          {rows.length ? (
            <>
              <div className="mx-auto mt-10 flex max-w-2xl items-end justify-center gap-2 sm:gap-5" aria-label="Pódio dos três melhores leitores">
                {podiumReaders.map((reader, index) => reader ? (
                  <div key={reader.id} className="flex min-w-0 flex-1 flex-col items-center">
                    {podiumPlaces[index] === 1 ? <Crown className="mb-2 h-7 w-7 text-gold" /> : null}
                    <Link to="/u/$username" params={{ username: reader.username }} className="relative z-10"><Avatar reader={reader} className={`${podiumPlaces[index] === 1 ? "h-24 w-24 ring-gold" : "h-20 w-20 ring-primary/40"} ring-2 ring-offset-4 ring-offset-background`} /></Link>
                    <div className={`${podiumPlaces[index] === 1 ? "h-52 border-gold/35 bg-gold/10" : podiumPlaces[index] === 2 ? "h-40" : "h-32"} -mt-8 flex w-full flex-col items-center rounded-t-lg border border-border bg-surface px-2 pb-4 pt-12`}>
                      <span className="font-display text-3xl font-bold text-muted-foreground/40">{podiumPlaces[index]}</span>
                      <span className="max-w-full truncate text-sm font-bold">{reader.username}</span>
                      <LevelBadge level={reader.level} />
                      <span className="mt-auto text-xs font-bold text-primary">{reader.xp.toLocaleString("pt-BR")} XP</span>
                    </div>
                  </div>
                ) : <div key={podiumPlaces[index]} className="min-w-0 flex-1" />)}
              </div>
              <ol className="mx-auto mt-8 max-w-2xl space-y-2">
                {rows.slice(3).map((reader, index) => (
                  <li key={reader.id}>
                    <Link to="/u/$username" params={{ username: reader.username }} className="grid grid-cols-[auto_auto_minmax(0,1fr)_auto] items-center gap-3 rounded-lg border border-border bg-surface px-3 py-2.5 hover:border-primary/50">
                      <span className="w-6 text-center font-display text-base font-bold text-muted-foreground">{index + 4}</span>
                      <Avatar reader={reader} className="h-10 w-10 text-sm" />
                      <span className="min-w-0"><b className="block truncate text-sm">{reader.username}</b><LevelBadge level={reader.level} /></span>
                      <span className="text-sm font-bold text-primary">{reader.xp.toLocaleString("pt-BR")} <small>XP</small></span>
                    </Link>
                  </li>
                ))}
              </ol>
            </>
          ) : !list.isLoading ? <p className="mt-10 text-center text-sm text-muted-foreground">Ainda não há leitores no ranking.</p> : null}
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}