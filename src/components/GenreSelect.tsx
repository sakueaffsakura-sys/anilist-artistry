import { useId, useState } from "react";
import { Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { useGenres } from "@/hooks/use-genres";
import { GENRES, normalizeGenres } from "@/lib/work-genres";

export function GenreSelect({ value, onChange }: { value: string[]; onChange: (value: string[]) => void }) {
  const id = useId();
  const [query, setQuery] = useState("");
  const selected = normalizeGenres(value);
  const genres = useGenres();
  const options = normalizeGenres([...(genres.data ?? GENRES), ...selected]).filter((genre) =>
    genre.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().includes(query.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase()),
  );
  return (
    <fieldset className="min-w-0 space-y-2">
      <legend className="text-sm font-medium">Gêneros <span className="text-muted-foreground">({selected.length})</span></legend>
      {selected.length > 0 ? <div className="flex flex-wrap gap-1.5">{selected.map((genre) => (
        <Button key={genre} type="button" variant="outline" size="sm" className="h-auto max-w-full gap-1 py-1 text-xs" aria-label={`Remover ${genre}`} onClick={() => onChange(selected.filter((item) => item !== genre))}>
          <span className="min-w-0 break-words whitespace-normal">{genre}</span><X className="h-3 w-3 shrink-0" />
        </Button>
      ))}</div> : null}
      <div className="relative"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input aria-label="Buscar gêneros" placeholder="Buscar gêneros…" value={query} onChange={(event) => setQuery(event.target.value)} className="bg-background pl-9" /></div>
      <div className="grid max-h-52 grid-cols-1 gap-1 overflow-y-auto rounded-md border border-border bg-background p-2 sm:grid-cols-2">
        {options.map((genre, index) => <label key={genre} htmlFor={`${id}-${index}`} className="flex cursor-pointer items-center gap-2 rounded px-2 py-2 text-sm hover:bg-surface-2">
          <Checkbox id={`${id}-${index}`} checked={selected.includes(genre)} onCheckedChange={(checked) => onChange(checked === true ? [...selected, genre] : selected.filter((item) => item !== genre))} />
          <span className="min-w-0 break-words">{genre}</span>
        </label>)}
        {options.length === 0 ? <p className="px-2 py-3 text-sm text-muted-foreground">Nenhum gênero encontrado.</p> : null}
      </div>
    </fieldset>
  );
}