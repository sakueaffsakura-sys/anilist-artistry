import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { Search, Loader2, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ClassificationReviewItem, type ReviewRow } from "./ClassificationReviewItem";
import { supabase } from "@/integrations/supabase/client";
import { searchAnilist, searchAnilistSmart, type AnilistResult } from "@/lib/anilist.functions";
import { approveWorkClassification } from "@/lib/work-classification.functions";
import { manualClassificationReview } from "@/lib/manual-classification";
import type { ClassificationSnapshot } from "@/lib/work-classification";

type LocalWork = ClassificationSnapshot & { alt_titles: string | null };
export function ManualClassificationPanel() {
  const search = useServerFn(searchAnilist), approve = useServerFn(approveWorkClassification);
  const qc = useQueryClient();
  const [localQuery, setLocalQuery] = useState("");
  const [works, setWorks] = useState<LocalWork[]>([]);
  const [work, setWork] = useState<LocalWork | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<AnilistResult[]>([]);
  const [row, setRow] = useState<ReviewRow | null>(null);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  async function findWorks() {
    setBusy(true); setMessage("");
    try {
      const term = localQuery.trim().replace(/[,%()\\]/g, " ");
      let request = supabase.from("series").select("id,title,kind,genres,age_rating,updated_at,alt_titles").neq("kind", "Novel").order("title").limit(30);
      if (term) request = request.or(`title.ilike.%${term}%,alt_titles.ilike.%${term}%`);
      const { data, error } = await request;
      if (error) throw error;
      setWorks(data ?? []); if (!data?.length) setMessage("Nenhuma obra encontrada.");
    } catch { setMessage("Não foi possível buscar as obras do catálogo."); }
    finally { setBusy(false); }
  }
  async function findResults() {
    const names = [query, ...(work?.alt_titles ?? "").split(/[,;\n|]/)]
      .map((n) => n.trim()).filter((n, i, all) => n.length > 1 && all.findIndex((x) => x.toLowerCase() === n.toLowerCase()) === i).slice(0, 5);
    if (!names.length) return;
    setBusy(true); setMessage(""); setResults([]);
    try {
      const merged = new Map<number, AnilistResult>();
      for (const name of names) {
        try { for (const item of await searchAnilistSmart(name, search)) if (!merged.has(item.anilistId)) merged.set(item.anilistId, item); } catch { /* tenta o próximo nome */ }
        if (merged.size >= 12) break;
      }
      const found = [...merged.values()];
      setResults(found); setMessage(found.length ? `Pesquisado por ${names.length} nome(s): principal e alternativos.` : "Nenhum resultado no AniList pelo nome nem pelos títulos alternativos.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Não foi possível pesquisar no AniList."); }
    finally { setBusy(false); }
  }
  async function save() {
    if (!row?.suggestion || !row.changes || row.status !== "pending" || busy) return;
    setBusy(true);
    try {
      const result = await approve({ data: { work: row.work, suggestion: row.suggestion, mode: "review" } });
      setRow({ ...row, status: result.saved ? "saved" : "conflict", message: result.message });
      if (result.saved) await Promise.all([qc.invalidateQueries({ queryKey: ["admin-series"] }), qc.invalidateQueries({ queryKey: ["series"] }), qc.invalidateQueries({ queryKey: ["all-genres"] })]);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Não foi possível salvar."); }
    finally { setBusy(false); }
  }
  return <div className="space-y-4">
    {!work ? <>
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); void findWorks(); }}>
        <Input aria-label="Obra do catálogo" placeholder="Título ou título alternativo" value={localQuery} onChange={(e) => setLocalQuery(e.target.value)} disabled={busy} />
        <Button type="submit" variant="outline" disabled={busy}><Search className="h-4 w-4" />Buscar</Button>
      </form>
      <ul className="max-h-[40dvh] overflow-y-auto divide-y divide-border">{works.map((item) => <li key={item.id}><Button className="h-auto w-full justify-start whitespace-normal py-3 text-left" variant="ghost" disabled={busy} onClick={() => { setWork(item); setQuery(item.title); setResults([]); setRow(null); setMessage(""); }}><span className="min-w-0 break-words">{item.title}<span className="block text-xs text-muted-foreground">{item.kind} · {item.genres.join(" · ") || "Sem gêneros"}</span></span></Button></li>)}</ul>
    </> : <>
      <Button variant="ghost" size="sm" disabled={busy} onClick={() => { setWork(null); setRow(null); setMessage(""); }}><ArrowLeft className="h-4 w-4" />Outra obra</Button>
      <h3 className="break-words font-semibold">{work.title}</h3>
      {work.alt_titles ? <p className="break-words text-xs text-muted-foreground">{work.alt_titles}</p> : null}
      {!row ? <>
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); void findResults(); }}><Input aria-label="Pesquisa no AniList" value={query} onChange={(e) => setQuery(e.target.value)} disabled={busy} /><Button type="submit" disabled={busy || !query.trim()}><Search className="h-4 w-4" />AniList</Button></form>
        <ul className="max-h-[40dvh] overflow-y-auto divide-y divide-border">{results.map((item) => <li key={item.anilistId} className="space-y-2 py-3"><p className="break-words font-semibold">{item.title}</p><p className="break-words text-xs text-muted-foreground">{item.altTitles}</p><p className="break-words text-sm">{item.suggestedKind} · {item.author || item.artist} · {item.genres.join(" · ")}</p><p className="line-clamp-3 break-words text-xs text-muted-foreground">{item.synopsis}</p><div className="flex flex-wrap gap-2"><Button asChild variant="ghost" size="sm"><a href={`https://anilist.co/manga/${item.anilistId}`} target="_blank" rel="noopener noreferrer">Ver fonte</a></Button><Button size="sm" variant="outline" disabled={busy || item.suggestedKind === "Novel"} onClick={() => setRow({ ...manualClassificationReview(work, item), status: "pending" })}>Escolher resultado</Button></div></li>)}</ul>
      </> : <><ul><ClassificationReviewItem row={row} busy={busy} saving={busy} onApprove={() => void save()} onDismiss={() => setRow(null)} /></ul><Button variant="outline" disabled={busy} onClick={() => setRow(null)}>Escolher outro resultado</Button></>}
    </>}
    {busy ? <p role="status" className="flex items-center gap-2 text-sm"><Loader2 className="h-4 w-4 animate-spin" />Aguarde…</p> : null}
    {message ? <p role="status" className="break-words text-sm text-muted-foreground">{message}</p> : null}
  </div>;
}