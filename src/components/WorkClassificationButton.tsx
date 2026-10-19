import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Sparkles, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useSession } from "@/hooks/useAuth";
import type { ClassificationEvent } from "@/lib/work-classification";
export function WorkClassificationButton() {
 const { session } = useSession();
 const qc = useQueryClient();
 const [open, setOpen] = useState(false), [running, setRunning] = useState(false), [paused, setPaused] = useState(false), [message, setMessage] = useState("");
 const [progress, setProgress] = useState({ total: 0, processed: 0, updated: 0 });
 const [rows, setRows] = useState<{ title: string; saved: boolean }[]>([]);
 const controller = useRef<AbortController | null>(null);
 useEffect(() => () => controller.current?.abort(), []);
 const run = async () => {
  if (!session?.access_token || running) return;
  const abort = new AbortController(); controller.current = abort;
  setRunning(true); setMessage(""); setRows([]); setProgress({ total: 0, processed: 0, updated: 0 });
  let terminal = false;
  try {
   const response = await fetch("/api/admin/classificar-obras", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` }, body: JSON.stringify({ resume: paused }), signal: abort.signal });
   if (!response.ok) {
    const error = await response.json().catch(() => null) as { message?: string; paused?: boolean } | null;
    setPaused(error?.paused ?? false); throw new Error(error?.message || "Não foi possível iniciar a classificação.");
   }
   if (!response.body) throw new Error("A classificação não retornou resposta.");
   setPaused(false);
   const reader = response.body.getReader(), decoder = new TextDecoder();
   let buffer = "";
   const consume = (line: string) => {
    if (!line.trim()) return;
    const event = JSON.parse(line) as ClassificationEvent;
    if (event.type === "start") setProgress({ total: event.total, processed: 0, updated: 0 });
    if (event.type === "work") { setProgress({ total: event.total, processed: event.processed, updated: event.updated }); setRows((previous) => [...previous, { title: event.title, saved: event.saved }]); }
    if (event.type === "done") { terminal = true; setMessage(event.total === 0 ? "Todas as obras já têm gêneros." : `${event.updated} obras atualizadas. ${event.processed - event.updated} mantidas sem alteração.`); }
    if (event.type === "error") { terminal = true; setPaused(event.paused); setMessage(event.message); }
   };
   while (true) {
    const { value, done } = await reader.read(); buffer += decoder.decode(value, { stream: !done });
    const lines = buffer.split("\n"); buffer = lines.pop() ?? ""; lines.forEach(consume);
    if (done) { consume(buffer); break; }
   }
   if (!terminal) throw new Error("A conexão foi interrompida. As obras já salvas foram preservadas.");
  } catch (error) {
   setMessage(abort.signal.aborted ? "Classificação interrompida. As obras já salvas foram preservadas." : error instanceof Error ? error.message : "Não foi possível classificar as obras.");
  } finally {
   setRunning(false); controller.current = null;
   for (const key of [["admin-series"], ["series"], ["all-genres"]]) void qc.invalidateQueries({ queryKey: key });
  }
 };
 return <>
  <Button variant="outline" onClick={() => setOpen(true)}><Sparkles className="h-4 w-4 text-primary" /> Classificar com IA</Button>
  <Dialog open={open} onOpenChange={(value) => { if (!running) setOpen(value); }}>
   <DialogContent className="max-h-[85dvh] overflow-y-auto" onEscapeKeyDown={(event) => { if (running) event.preventDefault(); }} onInteractOutside={(event) => { if (running) event.preventDefault(); }}>
    <DialogHeader><DialogTitle>Classificar obras com IA</DialogTitle><DialogDescription>Preencher gêneros ausentes e identificar o tipo das obras sem gêneros, incluindo rascunhos. Obras que já têm gêneros não serão alteradas. Novels permanecem no painel próprio. O uso da Lovable AI consome créditos.</DialogDescription></DialogHeader>
    {running || rows.length ? <div className="space-y-3">
     <p role="status" className="text-sm">{progress.processed} de {progress.total} analisadas · {progress.updated} atualizadas</p>
     <progress className="h-2 w-full accent-primary" value={progress.processed} max={Math.max(1, progress.total)} />
     <ul className="max-h-60 overflow-y-auto divide-y divide-border">{rows.map((row, index) => <li key={index} className="flex items-start justify-between gap-3 py-2 text-sm"><span className="min-w-0 break-words">{row.title}</span><span className="shrink-0 text-muted-foreground">{row.saved ? "Atualizada" : "Sem alteração"}</span></li>)}</ul>
    </div> : null}
    {message ? <p role="status" className="break-words text-sm text-muted-foreground">{message}</p> : null}
    <div className="flex flex-wrap justify-end gap-2">
     {running ? <Button variant="outline" onClick={() => controller.current?.abort()}><Square className="h-4 w-4" /> Interromper</Button> : <Button variant="outline" onClick={() => setOpen(false)}>Fechar</Button>}
     <Button disabled={running || !session} onClick={() => void run()}>{running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}{running ? "Classificando…" : paused ? "Retomar após liberar acesso" : "Classificar obras sem gêneros"}</Button>
    </div>
   </DialogContent>
  </Dialog>
 </>;
}
