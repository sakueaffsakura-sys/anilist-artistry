import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Ban, BookmarkPlus, BookOpen, CheckCircle2, Sparkles, Star, Trash2 } from "lucide-react";
import { coverUrl } from "@/lib/media";
import { Button } from "@/components/ui/button";
import { formatRating } from "@/lib/format";
import { kindLabel, PUBLIC_KINDS } from "@/lib/work-categories";

export const FORMATS = ["Todos", ...PUBLIC_KINDS];

/** Cabeçalho padrão das páginas: título com ícone pequeno, uma linha de apoio e ações à direita. */
export function PageTitle({
  icon,
  title,
  subtitle,
  right,
}: {
  icon?: ReactNode;
  title: string;
  subtitle?: string;
  right?: ReactNode;
}) {
  return (
    <div className="page-head">
      <div className="min-w-0">
        <h1 className="flex items-center gap-2.5">
          {icon ? <span className="text-primary [&_svg]:h-6 [&_svg]:w-6">{icon}</span> : null}
          <span className="min-w-0">{title}</span>
        </h1>
        {subtitle ? <p>{subtitle}</p> : null}
      </div>
      {right ? <div className="flex flex-wrap items-center gap-2">{right}</div> : null}
    </div>
  );
}

/** Filtros em chips (formatos por padrão, com os nomes em português). */
export function Chips({
  value,
  onChange,
  options = FORMATS,
  label = (option: string) => (option === "Todos" ? option : kindLabel(option)),
}: {
  value: string;
  onChange: (v: string) => void;
  options?: string[];
  label?: (option: string) => string;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((opt) => (
        <button type="button" key={opt} aria-pressed={value === opt} onClick={() => onChange(opt)} className="chip chip-sm">
          {label(opt)}
        </button>
      ))}
    </div>
  );
}

/** Aba em chip, com contador opcional. */
export function TabButton({
  active,
  onClick,
  icon,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
  label: string;
  count?: number | undefined;
}) {
  return (
    <button type="button" aria-pressed={active} onClick={onClick} className="chip">
      {icon}
      {label}
      {typeof count === "number" && count > 0 ? (
        <span className={`rounded px-1 text-[11px] font-bold ${active ? "bg-background/20" : "bg-background/50 text-muted-foreground"}`}>
          {count > 99 ? "99+" : count}
        </span>
      ) : null}
    </button>
  );
}

/** Cartão da biblioteca: capa com andamento, título, formato e atalho para o capítulo onde parou. */
export function CollectionCard({
  slug,
  title,
  cover,
  rating,
  chapters,
  kind,
  progress,
  onRemove,
  resumeChapter,
}: {
  slug: string;
  title: string;
  cover: string | null;
  rating: number;
  chapters: number;
  kind: string;
  progress: number;
  onRemove?: () => void;
  resumeChapter?: number | undefined;
}) {
  return (
    <div className="group relative flex min-w-0 flex-col">
      <Link to="/obra/$slug" params={{ slug }} className="series-cover relative block aspect-[2/3] overflow-hidden rounded-md">
        <img src={coverUrl(cover)} alt={title} className="h-full w-full object-cover" loading="lazy" decoding="async" />
        <div className="absolute inset-x-0 bottom-0 series-cover-shade px-1.5 pb-1.5 pt-6">
          <div className="flex items-center gap-1.5">
            <div className="h-1 flex-1 overflow-hidden rounded-full bg-cover-foreground/20">
              <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(progress, 2)}%` }} />
            </div>
            <span className="text-[11px] font-bold text-cover-foreground tabular-nums">{progress}%</span>
          </div>
        </div>
      </Link>
      <h3 className="mt-2 line-clamp-2 text-[13px] font-semibold leading-snug sm:text-sm">
        <Link to="/obra/$slug" params={{ slug }} className="hover:text-primary">{title}</Link>
      </h3>
      <p className="card-meta mt-1">
        {Number(rating) > 0 ? <span className="inline-flex items-center gap-1 font-semibold text-foreground"><Star className="fill-gold text-gold" />{formatRating(rating)}</span> : null}
        <span>{chapters.toLocaleString("pt-BR")} cap.</span>
        <span>{kindLabel(kind)}</span>
      </p>
      {resumeChapter !== undefined ? (
        <Button asChild variant="secondary" size="sm" className="mt-2 w-full">
          <Link to="/obra/$slug/$chapter" params={{ slug, chapter: String(resumeChapter) }}><BookOpen className="h-3.5 w-3.5" /> Continuar no cap. {resumeChapter}</Link>
        </Button>
      ) : null}
      {onRemove ? (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remover ${title}`}
          title={`Remover ${title}`}
          className="absolute right-1.5 top-1.5 grid h-7 w-7 place-items-center rounded-full bg-cover-overlay text-cover-foreground hover:text-destructive"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      ) : null}
    </div>
  );
}

export const STATUSES = [
  { key: "interessado", label: "Interessado", icon: Sparkles },
  { key: "lendo", label: "Lendo", icon: BookOpen },
  { key: "lido", label: "Lido", icon: CheckCircle2 },
  { key: "dropado", label: "Dropado", icon: Ban },
  { key: "planejo", label: "Planejo ler", icon: BookmarkPlus },
] as const;
