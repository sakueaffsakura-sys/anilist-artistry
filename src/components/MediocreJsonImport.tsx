import { useState } from "react";
import { Link2 } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { parseMediocreLink, parseMediocrePages } from "@/lib/mediocre-json";

type Result = { line: string; message: string; ok: boolean };

export function MediocreJsonImport({ seriesId, onChange }: { seriesId: string; onChange: () => void }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<Result[]>([]);
  const queryClient = useQueryClient();
  const run = async () => {
    const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    if (!lines.length || busy) return;
    setBusy(true); setResults([]);
    let saved = 0;
    try {
      const { data, error } = await supabase.from("chapters").select("number").eq("series_id", seriesId);
      if (error) throw error;
      const taken = new Set((data ?? []).map((row) => Number(row.number)));
      for (const line of lines) {
        try {
          const { url, number } = parseMediocreLink(line);
          if (taken.has(number)) throw new Error(`Capítulo ${number} já existe.`);
          const response = await fetch(url, { redirect: "error" });
          if (!response.ok) throw new Error(`Erro ${response.status} ao ler o JSON.`);
          const pages = parseMediocrePages(await response.json());
          const { error: insertError } = await supabase.from("chapters").insert({ series_id: seriesId, number, title: null, pages, published: true });
          if (insertError) throw insertError;
          taken.add(number); saved++;
          setResults((r) => [...r, { line, ok: true, message: `Capítulo ${number}: ${pages.length} páginas` }]);
        } catch (e) {
          setResults((r) => [...r, { line, ok: false, message: e instanceof Error ? e.message : "Falha." }]);
        }
      }
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
  return (
    <section className="mb-6 space-y-3 border-b border-border pb-5" aria-label="Publicação por link JSON">
      <h3 className="flex items-center gap-2 font-display text-lg font-bold"><Link2 className="h-5 w-5 text-primary" /> Capítulos por link JSON (MediocreScan)</h3>
      <Textarea rows={4} disabled={busy} value={text} onChange={(e) => setText(e.target.value)} placeholder="https://cdn.mediocrescan.com/obras/750/capitulos/1/....json (um link por linha)" aria-label="Links JSON dos capítulos" />
      <Button disabled={busy || !text.trim()} onClick={() => void run()}>{busy ? "Publicando…" : "Publicar capítulos"}</Button>
      {results.length ? <div className="divide-y divide-border text-sm">{results.map((r, i) => (
        <div key={i} className="flex flex-wrap justify-between gap-2 py-1.5"><span className="min-w-0 break-all text-muted-foreground">{r.line}</span><span className={r.ok ? "text-primary" : "text-destructive"}>{r.message}</span></div>
      ))}</div> : null}
    </section>
  );
}
