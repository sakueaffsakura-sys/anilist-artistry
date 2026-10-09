import { useEffect, useRef, useState } from "react";
import { FileText, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { importNovelFiles } from "@/lib/novel-txt";

type Entry = { name: string; file?: File | undefined; status: "pending" | "saved" | "error"; error?: string | undefined };

export function NovelFileImport({ novelId, onChange }: { novelId: string; onChange: () => void }) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [busy, setBusy] = useState(false);
  const [published, setPublished] = useState(true);
  const [page, setPage] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const cancel = useRef(false);
  useEffect(() => () => { cancel.current = true; }, []);
  const pending = entries.filter(entry => entry.file && entry.status !== "saved");
  const saved = entries.filter(entry => entry.status === "saved").length;
  const pages = Math.max(1, Math.ceil(entries.length / 20));
  const select = (files: File[]) => {
    const accepted = files.filter(file => /\.(txt|html?)$/i.test(file.name));
    if (accepted.length !== files.length) toast.error("Somente TXT e HTML são aceitos.");
    setEntries(previous => [...previous, ...accepted.map((file): Entry => ({ name: file.name, file, status: "pending" }))].sort((a, b) => a.name.localeCompare(b.name, "pt-BR", { numeric: true })));
  };
  const submit = async () => {
    if (busy || !pending.length) return;
    cancel.current = false;
    setBusy(true);
    let count = 0;
    try {
      const { data, error } = await supabase.from("chapters").select("number").eq("series_id", novelId);
      if (error) throw error;
      const jobs = pending.flatMap(entry => entry.file ? [{ entry, file: entry.file }] : []);
      await importNovelFiles(jobs.map(job => job.file), (data ?? []).map(chapter => Number(chapter.number)), async chapter => {
        const { error: failure } = await supabase.from("chapters").insert({ ...chapter, series_id: novelId, published });
        if (failure) throw failure;
        count++;
      }, (index, error) => {
        const job = jobs[index];
        if (!job) return;
        setEntries(previous => previous.map(entry => entry === job.entry ? { name: entry.name, file: error ? entry.file : undefined, status: error ? "error" : "saved", error: error ?? undefined } : entry));
      }, () => cancel.current);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível importar."); }
    finally {
      if (count) { onChange(); toast.success(`${count} capítulo(s) ${published ? "publicado(s)" : "salvo(s) como rascunho"}.`); }
      setBusy(false);
    }
  };
  return <section className="min-w-0 space-y-5 py-5" aria-label="Importar arquivos de novel">
    <input ref={input} type="file" multiple accept=".txt,.html,.htm,text/plain,text/html" aria-label="Arquivos de capítulos da novel" className="hidden" disabled={busy} onChange={event => { select(Array.from(event.target.files ?? [])); event.target.value = ""; }} />
    <div className="flex flex-col items-center gap-3 border-y border-dashed border-primary/40 bg-primary/5 px-4 py-8 text-center" onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); if (!busy) select(Array.from(event.dataTransfer.files)); }}>
      <FileText className="h-8 w-8 text-primary" />
      <h3 className="font-display text-lg font-bold">Capítulos por TXT</h3>
      <Button type="button" variant="outline" disabled={busy} onClick={() => input.current?.click()}><Upload className="h-4 w-4" /> Selecionar arquivos</Button>
      <p className="text-xs text-muted-foreground">TXT ou HTML · 1.txt · Capítulo 2 - Título.txt</p>
    </div>
    {entries.length ? <>
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
        <p className="text-sm font-semibold">{entries.length} arquivos <span className="font-normal text-muted-foreground">· {saved} concluídos</span></p>
        <Button type="button" size="icon" variant="ghost" disabled={busy} title="Limpar seleção" aria-label="Limpar arquivos" onClick={() => { setEntries([]); setPage(0); }}><X className="h-4 w-4" /></Button>
      </div>
      <div className="divide-y divide-border">
        {entries.slice(page * 20, (page + 1) * 20).map((entry, index) => <div key={`${page}-${index}`} className="grid min-w-0 gap-1 py-3 text-sm sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] sm:gap-4">
          <span className="min-w-0 break-all font-medium">{entry.name}</span>
          <span className={`min-w-0 break-words sm:text-right ${entry.status === "error" ? "text-destructive" : entry.status === "saved" ? "text-primary" : "text-muted-foreground"}`}>{entry.error ?? (entry.status === "saved" ? "Concluído" : "Aguardando")}</span>
        </div>)}
      </div>
      {pages > 1 ? <div className="flex items-center justify-end gap-2"><Button type="button" variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>Anterior</Button><span className="text-xs text-muted-foreground">{page + 1}/{pages}</span><Button type="button" variant="outline" size="sm" disabled={page + 1 === pages} onClick={() => setPage(page + 1)}>Próxima</Button></div> : null}
      <div className="grid gap-4 border-t border-border pt-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-primary" checked={published} disabled={busy} onChange={event => setPublished(event.target.checked)} /> Publicar agora</label>
        <Button type="button" disabled={busy || !pending.length} onClick={() => void submit()}><Upload className="h-4 w-4" />{busy ? "Importando…" : `${published ? "Publicar" : "Salvar rascunhos"} (${pending.length})`}</Button>
      </div>
      {busy ? <Button type="button" variant="outline" onClick={() => { cancel.current = true; }}>Parar após capítulo atual</Button> : null}
    </> : null}
  </section>;
}