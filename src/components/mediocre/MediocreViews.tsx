import { useState, type ReactNode } from "react";
import { Copy, Download, Code2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { hasIaFlag, pick, tagNames, text, workImage } from "@/lib/mediocre-api";

type Row = Record<string, unknown>;

export function LoadingState() {
  return <p className="rounded-xl border border-border bg-card p-6 text-center text-sm text-muted-foreground" role="status">Carregando dados…</p>;
}
export function ErrorState({ message }: { message: string }) {
  return <p className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive" role="alert">{message}</p>;
}
export function EmptyState({ message = "Nenhum item encontrado." }: { message?: string }) {
  return <p className="rounded-xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">{message}</p>;
}

function Field({ label, value }: { label: string; value: unknown }) {
  const v = text(value);
  if (!v) return null;
  return <div className="text-xs"><span className="text-muted-foreground">{label}: </span><span className="font-medium">{v}</span></div>;
}

function chapterCount(row: Row): string | null {
  const c = row["capitulos"];
  if (Array.isArray(c)) return String(c.length);
  return text(pick(row, "total_capitulos", "total_capitulos_ativos", "qtd_capitulos"));
}

export function WorkCard({ row, showIa, badge }: { row: Row; showIa?: boolean | undefined; badge?: ReactNode }) {
  const img = workImage(row);
  const name = text(pick(row, "obr_nome", "nome", "cap_nome"));
  const tags = tagNames(row["tags"]).slice(0, 4);
  const date = text(pick(row, "data_ultimo_cap", "obr_atualizado_em", "atualizado_em", "cap_lancado_em"));
  return (
    <article className="relative flex gap-3 rounded-xl border border-border bg-card p-3">
      {badge}
      {img ? <img src={img} alt={name ?? "Capa"} loading="lazy" className="aspect-[2/3] w-20 shrink-0 rounded-lg object-cover" /> : <div className="aspect-[2/3] w-20 shrink-0 rounded-lg bg-muted" />}
      <div className="min-w-0 space-y-1">
        <h3 className="line-clamp-2 font-semibold">{name ?? "Sem título"}</h3>
        {showIa && hasIaFlag(row) && <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-bold text-primary"><Sparkles className="h-3 w-3" />IA</span>}
        <Field label="ID" value={pick(row, "obr_id", "id")} />
        <Field label="Formato" value={typeof row["formato"] === "string" ? row["formato"] : null} />
        <Field label="Status" value={pick(row, "obr_status", "status")} />
        <Field label="Capítulos" value={chapterCount(row)} />
        <Field label="Comentários" value={pick(row, "obr_coment_count", "coment_count")} />
        <Field label="Reações" value={pick(row, "obr_reac_count", "reac_count")} />
        <Field label="Data" value={date} />
        {tags.length > 0 && <p className="truncate text-[11px] text-muted-foreground">{tags.join(" · ")}</p>}
      </div>
    </article>
  );
}

export function WorkGrid({ rows, showIa, badgeFor }: { rows: Row[]; showIa?: boolean; badgeFor?: (row: Row) => ReactNode }) {
  if (!rows.length) return <EmptyState />;
  return <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">{rows.map((r, i) => <WorkCard key={String(r["obr_id"] ?? r["cap_id"] ?? i)} row={r} showIa={showIa} badge={badgeFor?.(r)} />)}</div>;
}

const CHAPTER_FIELDS: Array<[string, string]> = [["cap_id", "ID"], ["cap_num", "Número"], ["cap_slug", "Slug"], ["cap_volume", "Volume"], ["cap_tipo", "Tipo"], ["cap_lancado_em", "Lançado"], ["cap_criado_em", "Criado"], ["cap_coment_count", "Comentários"], ["cap_reac_count", "Reações"], ["cap_ia", "IA"]];

export function ChapterList({ chapters }: { chapters: Row[] }) {
  if (!chapters.length) return <EmptyState message="Nenhum capítulo nesta resposta." />;
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">Este endpoint retornou apenas os dados do capítulo. O conteúdo completo não está disponível nesta resposta.</p>
      <ul className="max-h-[480px] divide-y divide-border overflow-auto rounded-xl border border-border bg-card">
        {chapters.map((c, i) => (
          <li key={String(c["cap_id"] ?? i)} className="space-y-1 p-3">
            <p className="text-sm font-semibold">{text(c["cap_nome"]) ?? text(c["obr_nome"]) ?? `Capítulo ${text(c["cap_num"]) ?? ""}`}</p>
            <div className="flex flex-wrap gap-x-4 gap-y-1">{CHAPTER_FIELDS.map(([k, l]) => <Field key={k} label={l} value={c[k]} />)}</div>
            {text(c["cap_desc"]) && <p className="text-xs text-muted-foreground">{text(c["cap_desc"])}</p>}
          </li>
        ))}
      </ul>
    </div>
  );
}

const WORK_FIELDS: Array<[string, string]> = [["obr_id", "ID"], ["obr_status", "Status"], ["obr_ia", "IA"], ["obr_coment_count", "Comentários"], ["obr_reac_count", "Reações"], ["obr_mediocre", "Mediocre"], ["obr_oficial", "Oficial"], ["obr_oficial_site", "Site oficial"], ["obr_novel_id", "Novel ID"], ["primeiro_cap_id", "Primeiro cap."], ["ultimo_cap_id", "Último cap."], ["favoritada", "Favoritada"], ["status_leitura", "Status de leitura"]];

export function WorkDetails({ work }: { work: Row }) {
  const banner = workImage(work, "banner");
  const img = workImage(work);
  const alts = Array.isArray(work["obr_titulos_alternativos"]) ? (work["obr_titulos_alternativos"] as unknown[]).map(text).filter(Boolean) : [];
  const chapters = Array.isArray(work["capitulos"]) ? (work["capitulos"] as unknown[]).filter((c): c is Row => Boolean(c) && typeof c === "object") : null;
  return (
    <section className="space-y-4">
      {banner && <img src={banner} alt="" className="h-32 w-full rounded-xl object-cover md:h-48" />}
      <div className="flex flex-col gap-4 md:flex-row">
        {img && <img src={img} alt={text(work["obr_nome"]) ?? "Capa"} className="aspect-[2/3] w-32 rounded-xl object-cover" />}
        <div className="min-w-0 space-y-2">
          <h2 className="text-xl font-bold">{text(work["obr_nome"]) ?? "Sem título"}</h2>
          {alts.length > 0 && <p className="text-xs text-muted-foreground">{alts.join(" · ")}</p>}
          <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">{WORK_FIELDS.map(([k, l]) => <Field key={k} label={l} value={work[k]} />)}</div>
          {tagNames(work["tags"]).length > 0 && <p className="text-xs">{tagNames(work["tags"]).join(" · ")}</p>}
          {text(work["obr_descricao"]) && <p className="whitespace-pre-line text-sm text-muted-foreground">{text(work["obr_descricao"])}</p>}
        </div>
      </div>
      {chapters && <ChapterList chapters={chapters} />}
    </section>
  );
}

export function JsonViewer({ data, fileName }: { data: unknown; fileName: string }) {
  const [open, setOpen] = useState(false);
  const json = () => JSON.stringify(data, null, 2);
  const download = () => {
    const url = URL.createObjectURL(new Blob([json()], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url; a.download = fileName; a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={() => setOpen((o) => !o)}><Code2 className="mr-1 h-4 w-4" />{open ? "Ocultar JSON" : "Ver JSON"}</Button>
        <Button size="sm" variant="outline" onClick={() => navigator.clipboard.writeText(json()).then(() => toast.success("JSON copiado."), () => toast.error("Não foi possível copiar."))}><Copy className="mr-1 h-4 w-4" />Copiar JSON</Button>
        <Button size="sm" variant="outline" onClick={download}><Download className="mr-1 h-4 w-4" />Baixar JSON</Button>
      </div>
      {open && <pre className="max-h-[480px] overflow-auto rounded-xl border border-border bg-muted p-3 text-[11px]">{json()}</pre>}
    </div>
  );
}
