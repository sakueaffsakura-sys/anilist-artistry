import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, RefreshCw, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

type Counts = { auto: number; fixed: number; noAge: number; noGenre: number };

async function countSeries(filter: (query: ReturnType<typeof base>) => ReturnType<typeof base>): Promise<number> {
  const { count, error } = await filter(base());
  if (error) throw error;
  return count ?? 0;
}
function base() {
  return supabase.from("series").select("id", { count: "exact", head: true });
}

/**
 * Classificação automática pelas regras do banco (migration 0059): sem IA e sem créditos.
 * Mostra quantas obras estão em cada situação e roda a classificação de novo quando o admin pede.
 */
export function AutoClassificationPanel() {
  const qc = useQueryClient();
  const [message, setMessage] = useState("");
  const stats = useQuery({
    queryKey: ["auto-classification"],
    queryFn: async (): Promise<Counts> => {
      const [auto, fixed, noAge, noGenre] = await Promise.all([
        countSeries((q) => q.eq("age_rating_auto", true)),
        countSeries((q) => q.eq("age_rating_auto", false).not("age_rating", "is", null)),
        countSeries((q) => q.is("age_rating", null)),
        countSeries((q) => q.filter("genres", "eq", "{}")),
      ]);
      return { auto, fixed, noAge, noGenre };
    },
  });
  const run = useMutation({
    mutationFn: async (all: boolean) => {
      const { data, error } = await supabase.rpc("auto_classify_series", { _all: all });
      if (error) throw error;
      const result = (data ?? {}) as { generos?: number; idades?: number };
      return { genres: Number(result.generos ?? 0), ages: Number(result.idades ?? 0) };
    },
    onMutate: () => setMessage(""),
    onSuccess: ({ genres, ages }) => {
      setMessage(
        genres || ages
          ? `Pronto: ${ages} ${ages === 1 ? "obra teve a idade definida" : "obras tiveram a idade definida"} e ${genres} ${genres === 1 ? "ganhou gêneros" : "ganharam gêneros"}.`
          : "Nada para mudar: as obras já estão classificadas.",
      );
      void qc.invalidateQueries({ queryKey: ["auto-classification"] });
      void qc.invalidateQueries({ queryKey: ["admin-series"] });
      void qc.invalidateQueries({ queryKey: ["series"] });
    },
    onError: (error) => setMessage(error instanceof Error ? error.message : "Não foi possível classificar."),
  });
  const c = stats.data;
  const tiles: [string, number | undefined][] = [
    ["Automáticas", c?.auto],
    ["Escolhidas por você", c?.fixed],
    ["Sem idade", c?.noAge],
    ["Sem gênero", c?.noGenre],
  ];

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Toda obra nova recebe idade e gêneros na hora, pelas regras do site. Sem IA e sem créditos.
      </p>
      <dl className="grid grid-cols-2 gap-2" aria-busy={stats.isFetching}>
        {tiles.map(([label, value]) => (
          <div key={label} className="stat-tile">
            <dt>{label}</dt>
            <dd>{value === undefined ? "–" : value.toLocaleString("pt-BR")}</dd>
          </div>
        ))}
      </dl>
      {stats.isError ? <p role="alert" className="text-sm text-destructive">Não foi possível carregar os números.</p> : null}
      <ul className="space-y-1.5 text-xs text-muted-foreground">
        <li><b className="text-foreground">18</b> · Hentai, etiquetas adultas (+18, Adulto, Smut…) ou termos explícitos na sinopse.</li>
        <li><b className="text-foreground">16</b> · Ecchi, Gore, Sangue, Maduro, nudez, drogas ou insinuação sexual.</li>
        <li><b className="text-foreground">14</b> · As demais com sinopse ou gênero.</li>
        <li>Livre, 10 e 12 só por escolha sua: perfis infantis nunca são liberados sozinhos.</li>
        <li>Idade escolhida por você não muda. Na obra, a opção "Automática" devolve a idade às regras.</li>
        <li>Obra sem gênero ganha até 5 gêneros tirados do título e da sinopse.</li>
      </ul>
      {message ? <p role="status" className="break-words text-sm">{message}</p> : null}
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="outline" disabled={run.isPending} onClick={() => run.mutate(true)} title="Calcula de novo as idades automáticas e preenche o que faltar">
          {run.isPending && run.variables ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Recalcular automáticas
        </Button>
        <Button disabled={run.isPending} onClick={() => run.mutate(false)}>
          {run.isPending && !run.variables ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
          Classificar pendentes
        </Button>
      </div>
    </div>
  );
}
