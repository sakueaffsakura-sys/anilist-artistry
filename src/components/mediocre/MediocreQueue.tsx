import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Clock, Loader2, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

export const QUEUE_KEY = ["mediocre-queue"] as const;

const LABEL: Record<string, string> = { waiting: "Na fila", running: "Publicando", done: "Concluída", error: "Erro" };

/** Publish queue: one work at a time, one chapter per minute, processed by the server even with the page closed. */
export function MediocreQueue() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: QUEUE_KEY,
    queryFn: async () => {
      const { data, error } = await supabase.from("mediocre_queue")
        .select("id, obra_id, title, status, chapters_added, chapters_remaining, last_error, next_run_at, created_at")
        .order("created_at").limit(200);
      if (error) throw error;
      return data;
    },
    refetchInterval: 20_000,
  });
  const rows = q.data ?? [];
  const active = rows.filter((r) => r.status === "waiting" || r.status === "running");
  const remove = async (id: string) => {
    const { error } = await supabase.from("mediocre_queue").delete().eq("id", id);
    if (error) toast.error("Não foi possível remover."); else void qc.invalidateQueries({ queryKey: QUEUE_KEY });
  };
  const clearDone = async () => {
    const { error } = await supabase.from("mediocre_queue").delete().in("status", ["done", "error"]);
    if (error) toast.error("Não foi possível limpar."); else void qc.invalidateQueries({ queryKey: QUEUE_KEY });
  };
  return (
    <details className="rounded-lg border p-3" open={active.length > 0}>
      <summary className="cursor-pointer text-sm font-semibold">Fila de publicação · {active.length} aguardando</summary>
      <p className="mt-2 text-xs text-muted-foreground">Uma obra por vez e um capítulo por minuto. A fila continua sozinha mesmo com a página fechada.</p>
      {q.isLoading ? <Loader2 className="mt-3 h-4 w-4 animate-spin" aria-label="Carregando" /> : rows.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">Fila vazia.</p>
      ) : (
        <ol className="mt-3 grid gap-2">
          {rows.map((r, i) => (
            <li key={r.id} className="flex flex-wrap items-center gap-2 rounded-md border bg-card p-2 text-sm">
              <span className="w-6 text-muted-foreground">{i + 1}.</span>
              {r.status === "running" ? <Loader2 className="h-4 w-4 animate-spin text-primary" /> : r.status === "done" ? <Check className="h-4 w-4 text-primary" /> : r.status === "error" ? <X className="h-4 w-4 text-destructive" /> : <Clock className="h-4 w-4 text-muted-foreground" />}
              <span className="min-w-0 flex-1 truncate font-medium">{r.title || `Obra #${r.obra_id}`}</span>
              <span className="text-xs text-muted-foreground">
                {LABEL[r.status] ?? r.status} · {r.chapters_added} cap.{r.chapters_remaining != null && r.status === "running" ? ` · faltam ${r.chapters_remaining}` : ""}
                {r.status === "running" ? ` · próximo às ${new Date(r.next_run_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}` : ""}
              </span>
              {r.last_error && <span className="w-full text-xs text-destructive">{r.last_error}</span>}
              <Button size="icon" variant="ghost" className="h-7 w-7" aria-label="Remover da fila" onClick={() => void remove(r.id)}><Trash2 className="h-4 w-4" /></Button>
            </li>
          ))}
        </ol>
      )}
      {rows.some((r) => r.status === "done" || r.status === "error") && <Button size="sm" variant="outline" className="mt-3" onClick={() => void clearDone()}>Limpar concluídas</Button>}
    </details>
  );
}
