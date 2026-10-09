import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { eligibleForSection, type HomeSectionKey, type SectionMode, type ShelfWork } from "@/lib/home-sections";
import { coverUrl } from "@/lib/media";

export interface HomeSectionEditorProps {
  section: HomeSectionKey;
  title: string;
  mode: SectionMode;
  ids: string[];
  works: ShelfWork[];
  saving: boolean;
  onSave: (mode: SectionMode, ids: string[]) => void;
}

export function HomeSectionEditor({ section, title, mode: savedMode, ids: savedIds, works, saving, onSave }: HomeSectionEditorProps) {
  const [mode, setMode] = useState<SectionMode>(savedMode);
  const [ids, setIds] = useState(savedIds);
  const [search, setSearch] = useState("");
  const eligible = useMemo(() => works.filter((row) => eligibleForSection(section, row.kind)), [section, works]);
  const chosen = ids.map((id) => eligible.find((row) => row.id === id));
  const matches = eligible.filter((row) => !ids.includes(row.id) && row.title.toLocaleLowerCase().includes(search.toLocaleLowerCase())).slice(0, 30);
  function move(index: number, offset: number) {
    const target = index + offset;
    if (target < 0 || target >= ids.length) return;
    const copy = [...ids];
    const current = copy[index];
    const other = copy[target];
    if (!current || !other) return;
    copy[index] = other;
    copy[target] = current;
    setIds(copy);
  }
  return <section className="border-t border-border py-6">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="font-display text-lg font-bold">{title}</h2>
      <ToggleGroup type="single" value={mode} variant="outline" onValueChange={(value) => { if (value === "automatic" || value === "manual") setMode(value); }} aria-label={`Modo de ${title}`}>
        <ToggleGroupItem value="automatic">Automático</ToggleGroupItem>
        <ToggleGroupItem value="manual">Escolher obras</ToggleGroupItem>
      </ToggleGroup>
    </div>
    {mode === "automatic" ? <p className="mt-4 text-sm text-muted-foreground">{section === "trending" ? "Tendências do AniList" : "Popularidade do AniList"} · até 12 obras publicadas. Sem dados do AniList, a ordem usa leituras do site.</p> : <div className="mt-4 grid gap-5 md:grid-cols-2">
      <div>
        <p className="mb-2 text-sm text-muted-foreground">Selecionadas · {ids.length}/12</p>
        <ol className="space-y-2">
          {ids.map((id, index) => <li key={id} className="flex min-w-0 items-center gap-2 border-b border-border py-2">
            <span className="w-5 shrink-0 text-xs text-primary">{index + 1}</span>
            <span className="min-w-0 flex-1 truncate text-sm">{chosen[index]?.title ?? "Obra indisponível"}</span>
            <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" title="Mover para cima" aria-label={`Mover ${chosen[index]?.title ?? id} para cima`} disabled={index === 0} onClick={() => move(index, -1)}><ArrowUp className="h-4 w-4" /></Button>
            <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" title="Mover para baixo" aria-label={`Mover ${chosen[index]?.title ?? id} para baixo`} disabled={index === ids.length - 1} onClick={() => move(index, 1)}><ArrowDown className="h-4 w-4" /></Button>
            <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" title="Remover da seção" aria-label={`Remover ${chosen[index]?.title ?? id}`} onClick={() => setIds(ids.filter((value) => value !== id))}><X className="h-4 w-4" /></Button>
          </li>)}
        </ol>
        {!ids.length ? <p className="py-5 text-sm text-muted-foreground">Nenhuma obra selecionada.</p> : null}
      </div>
      <div>
        <div className="relative"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input aria-label={`Buscar obras para ${title}`} placeholder="Buscar no catálogo" value={search} onChange={(event) => setSearch(event.target.value)} className="pl-9" /></div>
        <div className="mt-3 max-h-80 overflow-y-auto">
          {matches.map((row) => <Button key={row.id} variant="ghost" disabled={ids.length >= 12} className="mb-1 h-auto w-full justify-start gap-3 py-2 text-left" onClick={() => setIds([...ids, row.id])}>
            <img src={coverUrl(row.cover_url)} alt="" loading="lazy" className="h-12 w-9 shrink-0 rounded object-cover" />
            <span className="min-w-0"><span className="block truncate text-sm">{row.title}</span><span className="text-xs text-muted-foreground">{row.kind}</span></span>
          </Button>)}
          {!matches.length ? <p className="py-5 text-sm text-muted-foreground">Nenhuma obra encontrada.</p> : null}
        </div>
      </div>
    </div>}
    <Button className="mt-4" disabled={saving} onClick={() => onSave(mode, ids)}>{saving ? "Salvando…" : `Salvar ${title}`}</Button>
  </section>;
}