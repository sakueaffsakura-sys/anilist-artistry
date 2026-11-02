import { useRef, useState } from "react";
import { Link2, Upload } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { parseMediocreLink, parseMediocrePages } from "@/lib/mediocre-json";
import { parseChapterFilename } from "@/lib/chapter-filename";

type Result = { line: string; message: string; ok: boolean };
const FETCH_CONCURRENCY = 4;

/** Extract every link from pasted text (lines, spaces or commas), deduplicated. */
function extractLinks(text: string) {
  return [...new Set(text.split(/[\s,;]+/).map((s) => s.trim()).filter((s) => /^https?:\/\//i.test(s)))];
}

export function MediocreJsonImport({ seriesId, onChange }: { seriesId: string; onChange: () => void }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(0);
  const [total, setTotal] = useState(0);
  const [results, setResults] = useState<Result[]>([]);
  const [localChapters, setLocalChapters] = useState<{ line: string; number: number; pages: string[] }[]>([]);
  const cancel = useRef(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const links = extractLinks(text);

  const loadFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    for (const file of files) {
      try {
        const content = await file.text();
        if (/\.json$/i.test(file.name)) {
          const parsed = parseChapterFilename(file.name.replace(/\.json$/i, ".txt"));
          if (!parsed) throw new Error("Nomeie o JSON com o número do capítulo, por exemplo 1.json.");
          const pages = parseMediocrePages(JSON.parse(content));
          setLocalChapters((current) => [...current.filter((c) => c.line !== file.name), { line: file.name, number: parsed.number, pages }]);
        } else {
          setText((t) => [t, content].filter(Boolean).join("\n"));
        }
      } catch (error) { toast.error(`${file.name}: ${error instanceof Error ? error.message : "Arquivo inválido."}`); }
    }
  };

  const run = async () => {
    if ((!links.length && !localChapters.length) || busy) return;
    cancel.current = false;
    setBusy(true); setResults([]); setDone(0); setTotal(0);
    const published = new Set<string>();
    const add = (r: Result) => setResults((list) => [...list, r]);
    let saved = 0;
    try {
      const { data, error } = await supabase.from("chapters").select("number").eq("series_id", seriesId);
      if (error) throw error;
      const taken = new Set((data ?? []).map((row) => Number(row.number)));
      const items: { line: string; url?: string; number: number; pages?: string[] }[] = [];
      for (const line of links) {
        try {
          const parsed = parseMediocreLink(line);
          if (taken.has(parsed.number)) { add({ line, ok: false, message: `Capítulo ${parsed.number} já existe.` }); published.add(line); continue; }
          if (items.some((i) => i.number === parsed.number)) { add({ line, ok: false, message: `Capítulo ${parsed.number} repetido na lista.` }); continue; }
          items.push({ line, ...parsed });
        } catch (e) { add({ line, ok: false, message: e instanceof Error ? e.message : "Link inválido." }); }
      }
      for (const chapter of localChapters) {
        if (taken.has(chapter.number)) { add({ line: chapter.line, ok: false, message: `Capítulo ${chapter.number} já existe.` }); continue; }
        if (items.some((item) => item.number === chapter.number)) { add({ line: chapter.line, ok: false, message: `Capítulo ${chapter.number} repetido na lista.` }); continue; }
        items.push(chapter);
      }
      items.sort((a, b) => a.number - b.number);
      setTotal(items.length);
      // Fetch JSONs in parallel (bounded), publish in chapter order.
      const fetched = new Map<number, Promise<string[]>>();
      const fetchPages = (item: (typeof items)[number]) => {
        if (item.pages) return Promise.resolve(item.pages);
        if (!item.url) return Promise.reject(new Error("Link ausente."));
        return fetch(item.url, { redirect: "error" }).then(async (res) => {
        if (!res.ok) throw new Error(`Erro ${res.status} ao ler o JSON.`);
        return parseMediocrePages(await res.json());
        });
      };
      for (let i = 0; i < items.length; i++) {
        if (cancel.current) break;
        for (let j = i; j < Math.min(items.length, i + FETCH_CONCURRENCY); j++) {
          const next = items[j];
          if (next && !fetched.has(j)) { const p = fetchPages(next); p.catch(() => {}); fetched.set(j, p); }
        }
        const item = items[i];
        if (!item) continue;
        try {
          const request = fetched.get(i);
          if (!request) throw new Error("Capítulo não preparado.");
          const pages = await request;
          if (cancel.current) break;
          const { error: insertError } = await supabase.from("chapters").insert({ series_id: seriesId, number: item.number, title: null, pages, published: true });
          if (insertError) throw insertError;
          saved++; published.add(item.line);
          add({ line: item.line, ok: true, message: `Capítulo ${item.number}: ${pages.length} páginas` });
        } catch (e) {
          add({ line: item.line, ok: false, message: e instanceof Error ? e.message : "Falha." });
        }
        setDone(i + 1);
      }
      setText(links.filter((line) => !published.has(line)).join("\n"));
      setLocalChapters((current) => current.filter((chapter) => !published.has(chapter.line)));
      if (cancel.current) toast.info("Envio cancelado.");
      if (saved) {
        await supabase.from("series").update({ updated_at: new Date().toISOString() }).eq("id", seriesId);
        toast.success(`${saved} capítulo(s) publicado(s).`);
        onChange();
        await queryClient.invalidateQueries({ predicate: (q) => ["series", "chapters", "chapter", "obra", "admin-series"].includes(String(q.queryKey[0])) });
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível publicar.");
    } finally { setBusy(false); }
  };

  const fails = results.filter((r) => !r.ok).length;
  return (
    <section className="mb-6 space-y-3 border-b border-border pb-5" aria-label="Publicação em massa por link JSON">
      <h3 className="flex items-center gap-2 font-display text-lg font-bold"><Link2 className="h-5 w-5 text-primary" /> Capítulos em massa por link JSON (MediocreScan)</h3>
      <Textarea rows={6} disabled={busy} value={text} onChange={(e) => setText(e.target.value)} placeholder="Cole quantos links quiser (um por linha, espaço ou vírgula) ou envie um .txt" aria-label="Links JSON dos capítulos" />
      <div className="flex flex-wrap items-center gap-2">
        <Button disabled={busy || (!links.length && !localChapters.length)} onClick={() => void run()}>{busy ? "Publicando…" : `Publicar ${links.length + localChapters.length || ""} capítulo(s)`}</Button>
        <Button variant="outline" disabled={busy} onClick={() => fileRef.current?.click()}><Upload className="h-4 w-4" /> Carregar TXT / JSON</Button>
        {busy ? <Button variant="ghost" onClick={() => { cancel.current = true; }}>Cancelar</Button> : null}
        {!busy && (text || localChapters.length) ? <Button variant="ghost" onClick={() => { setText(""); setLocalChapters([]); }}>Limpar</Button> : null}
        <input ref={fileRef} type="file" accept=".txt,.json,text/plain,application/json" multiple hidden onChange={(e) => { void loadFiles(e.target.files); e.target.value = ""; }} />
        <span className="text-sm text-muted-foreground">{links.length} link(s) detectado(s)</span>
      </div>
      {localChapters.length ? <div className="max-h-48 divide-y divide-border overflow-y-auto text-sm">{localChapters.map((chapter) => <div key={chapter.line} className="flex flex-wrap justify-between gap-2 py-2"><span className="break-all">{chapter.line}</span><span className="text-muted-foreground">Capítulo {chapter.number} · {chapter.pages.length} páginas</span></div>)}</div> : null}
      {busy || total ? <div className="space-y-1"><Progress value={total ? (done / total) * 100 : 0} /><p className="text-xs text-muted-foreground">{done}/{total} processados{results.length ? ` · ${results.length - fails} ok · ${fails} com erro` : ""}</p></div> : null}
      {results.length ? <div className="max-h-72 divide-y divide-border overflow-y-auto text-sm">{results.map((r, i) => (
        <div key={i} className="flex flex-wrap justify-between gap-2 py-1.5"><span className="min-w-0 break-all text-muted-foreground">{r.line}</span><span className={r.ok ? "text-primary" : "text-destructive"}>{r.message}</span></div>
      ))}</div> : null}
    </section>
  );
}
