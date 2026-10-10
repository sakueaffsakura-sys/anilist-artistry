import { useEffect, useRef, useState } from "react";
import { FileText, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { publishTxtChapters } from "@/lib/txt-chapters";
import { compareChapterFilenames } from "@/lib/chapter-filename";

type Entry = { name: string; file?: File | undefined; status: "pending" | "saved" | "error"; error?: string | undefined };

export function TxtChapterImport({ seriesId, onChange }: { seriesId: string; onChange: () => void }) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [busy, setBusy] = useState(false);
  const [page, setPage] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const cancel = useRef(false);
  const queryClient = useQueryClient();
  useEffect(() => () => { cancel.current = true; }, []);
  const pending = entries.filter((entry) => entry.file && entry.status !== "saved");
  const select = (files: File[]) => {
    if (busy) return;
    const txt = files.filter((file) => /\.txt$/i.test(file.name));
    if (txt.length !== files.length) toast.error("Somente arquivos TXT são aceitos.");
    setEntries((previous) => [...previous, ...txt.map((file): Entry => ({ name: file.name, file, status: "pending" }))]
      .sort(compareChapterFilenames));
  };
  const publish = async () => {
    if (busy || !pending.length) return;
    setBusy(true);
    cancel.current = false;
    let saved = 0;
    try {
      const { data, error } = await supabase.from("chapters").select("number").eq("series_id", seriesId);
      if (error) throw error;
      const jobs = pending.flatMap((entry) => entry.file ? [{ entry, file: entry.file }] : []);
      await publishTxtChapters(jobs.map((job) => job.file), (data ?? []).map((row) => Number(row.number)), async (chapter) => {
        const { error: insertError } = await supabase.from("chapters").insert({ series_id: seriesId, ...chapter, published: true });
        if (insertError) throw insertError;
        saved++;
      }, (index, failure) => {
        const job = jobs[index];
        if (!job) return;
        setEntries((previous) => previous.map((entry) => entry === job.entry ?
          { name: entry.name, file: failure ? entry.file : undefined, status: failure ? "error" : "saved", error: failure ?? undefined } : entry));
      }, () => cancel.current);
      if (saved) {
        const { error: touchError } = await supabase.from("series").update({ updated_at: new Date().toISOString() }).eq("id", seriesId);
        if (touchError) toast.error("Capítulos publicados, mas a data da obra não foi atualizada.");
        toast.success(`${saved} capítulo(s) publicado(s).`);
        onChange();
        await queryClient.invalidateQueries({ predicate: (query) => ["series", "chapters", "chapter", "obra", "admin-series"].includes(String(query.queryKey[0])) });
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível publicar.");
    } finally { setBusy(false); }
  };
  const pageCount = Math.max(1, Math.ceil(entries.length / 25));
  const currentPage = Math.min(page, pageCount - 1);
  return (
    <section className="mb-6 space-y-4 border-y border-border py-5" aria-label="Publicação por TXT">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 font-display text-lg font-bold"><FileText className="h-5 w-5 text-primary" /> Capítulos por TXT</h3>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" disabled={busy} onClick={() => input.current?.click()}><Upload className="mr-2 h-4 w-4" /> Selecionar TXT</Button>
          <Button disabled={busy || !pending.length} onClick={() => void publish()}>{busy ? "Publicando…" : `Publicar selecionados (${pending.length})`}</Button>
          {busy ? <Button variant="outline" onClick={() => { cancel.current = true; }}>Parar após capítulo atual</Button> : null}
          {entries.length && !busy ? <Button variant="ghost" size="icon" aria-label="Limpar seleção de TXT" title="Limpar seleção" onClick={() => { setEntries([]); setPage(0); }}><X className="h-4 w-4" /></Button> : null}
        </div>
      </div>
      <input ref={input} aria-label="Arquivos TXT dos capítulos" type="file" accept=".txt,text/plain" multiple disabled={busy} className="hidden" onChange={(event) => { select(Array.from(event.target.files ?? [])); event.target.value = ""; }} />
      {entries.length ? (
        <>
          <div className="divide-y divide-border">
            {entries.slice(currentPage * 25, (currentPage + 1) * 25).map((entry, index) => (
              <div key={`${currentPage}-${index}`} className="flex min-w-0 flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <span className="min-w-0 break-all font-semibold">{entry.name}</span>
                <span className={entry.status === "error" ? "text-destructive" : entry.status === "saved" ? "text-primary" : "text-muted-foreground"}>{entry.error ?? (entry.status === "saved" ? "Publicado" : "Aguardando")}</span>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
            <span>{entries.length} arquivos · {entries.filter((entry) => entry.status === "saved").length} publicados</span>
            {pageCount > 1 ? <div className="flex items-center gap-2"><Button variant="outline" size="sm" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>Anterior</Button><span>{currentPage + 1}/{pageCount}</span><Button variant="outline" size="sm" disabled={currentPage + 1 === pageCount} onClick={() => setPage(currentPage + 1)}>Próxima</Button></div> : null}
          </div>
        </>
      ) : null}
    </section>
  );
}