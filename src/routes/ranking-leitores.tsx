import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Clock, Crown, Flame, Sparkles, Star, Trophy, Users } from "lucide-react";
import { SiteFooter, SiteHeader } from "@/components/SiteHeader";
import { Button } from "@/components/ui/button";
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
      <main className="mx-auto max-w-6xl px-4 py-8 md:px-6 md:py-10">
        <div className="mb-10 flex justify-center gap-2">
          <Button asChild variant="outline"><Link to="/ranking"><Trophy className="mr-2 h-4 w-4" />Obras</Link></Button>
          <Button asChild><Link to="/ranking-leitores"><Users className="mr-2 h-4 w-4" />Leitores</Link></Button>
        </div>

        <section>
          <div className="text-center">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-[10px] font-bold uppercase text-muted-foreground"><Sparkles className="h-3 w-3 text-primary" /> Leitores</span>
            <h1 className="mt-4 font-display text-3xl font-extrabold">Ranking de XP</h1>
            <p className="mt-2 text-sm text-muted-foreground">{period === "weekly" ? "Quem mais ganhou XP nesta semana." : period === "total" ? "Quem mais acumulou XP desde sempre." : "Resultado da última semana encerrada."}</p>
            <div className="mt-8 inline-flex max-w-full overflow-x-auto rounded-lg border border-border bg-surface p-1.5 no-scrollbar">
              {([['weekly', 'Semanal'], ['total', 'Total'], ['snapshot', 'Último resultado']] as const).map(([key, label]) => (
                <Button key={key} type="button" variant="ghost" size="sm" onClick={() => setPeriod(key)} className={period === key ? "bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground" : "text-muted-foreground"}>{label}</Button>
              ))}
            </div>
            {period === "weekly" ? <p className="mt-4 flex items-center justify-center gap-2 text-xs text-muted-foreground"><Clock className="h-3.5 w-3.5 text-primary" /> Próximo reset: <b className="text-foreground">{reset}</b></p> : null}
          </div>

          {rows.length ? (
            <>
              <div className="mx-auto mt-12 flex max-w-2xl items-end justify-center gap-2 sm:gap-5" aria-label="Pódio dos três melhores leitores">
                {podiumReaders.map((reader, index) => reader ? (
                  <div key={reader.id} className="flex min-w-0 flex-1 flex-col items-center">
                    {podiumPlaces[index] === 1 ? <Crown className="mb-2 h-7 w-7 text-gold" /> : null}
                    <Link to="/u/$username" params={{ username: reader.username }} className="relative z-10"><Avatar reader={reader} className={`${podiumPlaces[index] === 1 ? "h-24 w-24 ring-gold" : "h-20 w-20 ring-primary/40"} ring-2 ring-offset-4 ring-offset-background`} /></Link>
                    <div className={`${podiumPlaces[index] === 1 ? "h-52 border-gold/35 bg-gold/10" : podiumPlaces[index] === 2 ? "h-40" : "h-32"} -mt-8 flex w-full flex-col items-center rounded-t-lg border border-border bg-surface px-2 pb-4 pt-12`}>
                      <span className="text-4xl font-black text-muted-foreground/20">{podiumPlaces[index]}</span>
                      <span className="max-w-full truncate text-sm font-bold">{reader.username}</span>
                      <LevelBadge level={reader.level} />
                      <span className="mt-auto text-xs font-bold text-primary">{reader.xp.toLocaleString("pt-BR")} XP</span>
                    </div>
                  </div>
                ) : <div key={podiumPlaces[index]} className="min-w-0 flex-1" />)}
              </div>
              <ol className="mx-auto mt-12 max-w-2xl space-y-2.5">
                {rows.slice(3).map((reader, index) => (
                  <li key={reader.id}>
                    <Link to="/u/$username" params={{ username: reader.username }} className="grid grid-cols-[auto_auto_minmax(0,1fr)_auto] items-center gap-3 rounded-lg border border-border bg-surface px-4 py-3 transition hover:border-primary/60">
                      <span className="grid h-9 w-9 place-items-center rounded-md bg-surface-2 text-xs font-bold text-muted-foreground">{index + 4}</span>
                      <Avatar reader={reader} className="h-11 w-11 text-sm" />
                      <span className="min-w-0"><b className="block truncate text-sm">{reader.username}</b><LevelBadge level={reader.level} /></span>
                      <span className="text-sm font-bold text-primary">{reader.xp.toLocaleString("pt-BR")} <small>XP</small></span>
                    </Link>
                  </li>
                ))}
              </ol>
            </>
          ) : !list.isLoading ? <p className="mt-12 text-center text-sm text-muted-foreground">Ainda não há leitores no ranking.</p> : null}
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}