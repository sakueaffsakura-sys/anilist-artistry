import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Sparkles, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ClassificationReviewItem, type ReviewRow } from "@/components/ClassificationReviewItem";
import { useSession } from "@/hooks/useAuth";
import { approveWorkClassification } from "@/lib/work-classification.functions";
import type { ClassificationEvent, ClassificationMode } from "@/lib/work-classification";

export function WorkClassificationButton() {
 const { session } = useSession();
 const qc = useQueryClient();
 const approve = useServerFn(approveWorkClassification);
 const [open, setOpen] = useState(false), [running, setRunning] = useState(false), [paused, setPaused] = useState(false), [message, setMessage] = useState("");
 const [mode, setMode] = useState<ClassificationMode>("missing");
 const [progress, setProgress] = useState({ total: 0, processed: 0, suggested: 0 });
 const [rows, setRows] = useState<ReviewRow[]>([]);
 const [savingId, setSavingId] = useState<string | null>(null);
 const controller = useRef<AbortController | null>(null);
 const saving = useRef(false);
 useEffect(() => () => controller.current?.abort(), []);
 const busy = running || savingId !== null;
 const run = async () => {
  if (!session?.access_token || busy) return;
  if (rows.some((row) => row.status === "pending" && row.changes) && !window.confirm("Iniciar uma nova análise descarta as sugestões ainda não aprovadas. Continuar?")) return;
  const abort = new AbortController(); controller.current = abort;
  setRunning(true); setMessage(""); setRows([]); setProgress({ total: 0, processed: 0, suggested: 0 });
  let terminal = false;
  try {
   const response = await fetch("/api/admin/classificar-obras", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` }, body: JSON.stringify({ resume: paused, mode }), signal: abort.signal });
   if (!response.ok) {
    const error = await response.json().catch(() => null) as { message?: string; paused?: boolean } | null;
    setPaused(error?.paused ?? false); throw new Error(error?.message || "Não foi possível iniciar a análise.");
   }
   if (!response.body) throw new Error("A análise não retornou resposta.");
   setPaused(false);
   const reader = response.body.getReader(), decoder = new TextDecoder();
   let buffer = "";
   const consume = (line: string) => {
    if (!line.trim()) return;
    const event = JSON.parse(line) as ClassificationEvent;
    if (event.type === "start") setProgress({ total: event.total, processed: 0, suggested: 0 });
    if (event.type === "review") { setProgress({ total: event.total, processed: event.processed, suggested: event.suggested }); setRows((previous) => [...previous, { ...event.review, status: "pending" }]); }
    if (event.type === "done") { terminal = true; setMessage(event.total === 0 ? "Nenhuma obra pendente de análise." : `${event.updated} sugestões para revisão. Nenhuma alteração foi salva automaticamente.`); }
    if (event.type === "error") { terminal = true; setPaused(event.paused); setMessage(event.message); }
   };
   while (true) {
    const { value, done } = await reader.read(); buffer += decoder.decode(value, { stream: !done });
    const lines = buffer.split("\n"); buffer = lines.pop() ?? ""; lines.forEach(consume);
    if (done) { consume(buffer); break; }
   }
   if (!terminal) throw new Error("A conexão foi interrompida. As sugestões recebidas continuam disponíveis para revisão.");
  } catch (error) {
   setMessage(abort.signal.aborted ? "Análise interrompida. Você ainda pode revisar as sugestões recebidas." : error instanceof Error ? error.message : "Não foi possível analisar as obras.");
  } finally { setRunning(false); controller.current = null; }
 };
 const save = async (row: ReviewRow) => {
  if (busy || saving.current || !row.suggestion || !row.changes || row.status !== "pending") return;
  saving.current = true; setSavingId(row.work.id);
  try {
   const result = await approve({ data: { work: row.work, suggestion: row.suggestion, mode } });
   setRows((previous) => previous.map((item) => item.work.id === row.work.id ? { ...item, status: result.saved ? "saved" : "conflict", message: result.message } : item));
   if (result.saved) { await qc.invalidateQueries({ queryKey: ["admin-series"] }); await qc.invalidateQueries({ queryKey: ["series"] }); await qc.invalidateQueries({ queryKey: ["all-genres"] }); }
  } catch (error) { setRows((previous) => previous.map((item) => item.work.id === row.work.id ? { ...item, message: error instanceof Error ? error.message : "Não foi possível salvar." } : item)); }
  finally { saving.current = false; setSavingId(null); }
 };
 return <>
  <Button variant="outline" onClick={() => setOpen(true)}><Sparkles className="h-4 w-4 text-primary" /> Classificar com IA</Button>
  <Dialog open={open} onOpenChange={(value) => { if (!busy) setOpen(value); }}>
   <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-3xl" onEscapeKeyDown={(event) => { if (busy) event.preventDefault(); }} onInteractOutside={(event) => { if (busy) event.preventDefault(); }}>
    <DialogHeader><DialogTitle>Classificar obras com IA</DialogTitle><DialogDescription>Revise as sugestões antes de aprovar. Rascunhos são incluídos; novels permanecem no painel próprio. Classificação de idade sugerida, não oficial. Lovable AI consome créditos.</DialogDescription></DialogHeader>
    <Tabs value={mode} onValueChange={(value) => { if (!busy && !rows.length && (value === "missing" || value === "review")) setMode(value); }}>
     <TabsList className="grid h-auto w-full grid-cols-2"><TabsTrigger className="whitespace-normal" value="missing" disabled={busy || rows.length > 0}>Preencher ausentes</TabsTrigger><TabsTrigger className="whitespace-normal" value="review" disabled={busy || rows.length > 0}>Revisar todas as obras</TabsTrigger></TabsList>
    </Tabs>
    {running || rows.length ? <div className="space-y-3">
     <p role="status" className="text-sm">{progress.processed} de {progress.total} analisadas · {progress.suggested} sugestões · {rows.filter((row) => row.status === "saved").length} salvas</p>
     <progress aria-label="Progresso da análise" className="h-2 w-full accent-primary" value={progress.processed} max={Math.max(1, progress.total)} />
     <ul className="max-h-[45dvh] overflow-y-auto divide-y divide-border pr-1">{rows.map((row) => <ClassificationReviewItem key={row.work.id} row={row} busy={busy} saving={savingId === row.work.id} onApprove={() => void save(row)} onDismiss={() => setRows((previous) => previous.map((item) => item.work.id === row.work.id ? { ...item, status: "dismissed" } : item))} />)}</ul>
    </div> : null}
    {message ? <p role="status" className="break-words text-sm text-muted-foreground">{message}</p> : null}
    <div className="flex flex-wrap justify-end gap-2">
     {rows.length > 0 && !busy ? <Button variant="ghost" onClick={() => { if (!rows.some((row) => row.status === "pending" && row.changes) || window.confirm("Descartar as sugestões não aprovadas?")) { setRows([]); setMessage(""); setProgress({ total: 0, processed: 0, suggested: 0 }); } }}>Limpar revisão</Button> : null}
     {running ? <Button variant="outline" onClick={() => controller.current?.abort()}><Square className="h-4 w-4" /> Interromper</Button> : <Button variant="outline" disabled={busy} onClick={() => setOpen(false)}>Fechar</Button>}
     <Button disabled={busy || !session} onClick={() => void run()}>{running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}{running ? "Analisando…" : paused ? "Retomar após liberar acesso" : "Analisar obras"}</Button>
    </div>
   </DialogContent>
  </Dialog>
 </>;
}
