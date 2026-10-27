import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Ban, BookmarkPlus, BookOpen, CheckCircle2, Sparkles, Star, Trash2 } from "lucide-react";
import { coverUrl } from "@/lib/media";
import { KINDS } from "@/lib/queries";
import { Button } from "@/components/ui/button";

export const FORMATS = ["Todos", ...KINDS];

export function PageTitle({
  icon,
  title,
  subtitle,
  right,
}: {
  icon: ReactNode;
  title: string;
  subtitle: string;
  right?: ReactNode;
}) {
  return (
    <div className="mb-8 flex items-start justify-between gap-4">
      <div>
        <h1 className="flex items-center gap-3 font-display text-3xl font-extrabold">
          <span className="text-primary">{icon}</span>
          {title}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
      </div>
      {right}
    </div>
  );
}

export function Chips({
  value,
  onChange,
  options = FORMATS,
}: {
  value: string;
  onChange: (v: string) => void;
  options?: string[];
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => (
        <Button variant="ghost" size="sm"
          key={opt}
          aria-pressed={value === opt}
          onClick={() => onChange(opt)}
          className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
            value === opt
              ? "border-primary bg-primary/15 text-primary"
              : "border-border bg-surface-2 text-foreground/80 hover:border-primary/50"
          }`}
        >
          {opt}
        </Button>
      ))}
    </div>
  );
}

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
    <Button variant="ghost"
      aria-pressed={active}
      onClick={onClick}
      className={`flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors ${
        active
          ? "bg-primary text-primary-foreground"
          : "bg-surface-2 text-foreground/80 hover:bg-surface-2/70 hover:text-foreground"
      }`}
    >
      {icon}
      {label}
      {typeof count === "number" && count > 0 ? (
        <span
          className={`rounded-full px-1.5 text-[11px] ${
            active ? "bg-background/25" : "bg-background/60"
          }`}
        >
          {count > 99 ? "99+" : count}
        </span>
      ) : null}
    </Button>
  );
}

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
    <div className="group relative overflow-hidden rounded-lg border border-border bg-surface">
      <Link to="/obra/$slug" params={{ slug }} className="block">
        <div className="relative aspect-[2/3]">
          <img src={coverUrl(cover)} alt={title} className="h-full w-full object-cover" loading="lazy" />
          <span className="cover-fade" />
          <div className="absolute left-2 top-2 flex flex-col items-start gap-1">
            <span className="flex items-center gap-2 rounded-md bg-background/85 px-1.5 py-0.5 text-[11px] font-bold backdrop-blur">
              <span className="flex items-center gap-0.5 text-gold">
                <Star className="h-3 w-3 fill-gold" />
                {Number(rating).toFixed(1).replace(".", ",")}
              </span>
              <span className="flex items-center gap-0.5">
                <BookOpen className="h-3 w-3" />
                {chapters}
              </span>
            </span>
            <span className="rounded-md border border-primary/60 bg-background/85 px-1.5 py-0.5 text-[11px] font-bold text-primary">
              {kind}
            </span>
          </div>
          <div className="absolute inset-x-2 bottom-2">
            <div className="h-1.5 overflow-hidden rounded-full bg-muted/60">
              <div className="h-full rounded-full bg-primary" style={{ width: `${progress}%` }} />
            </div>
            <p className="mt-1 text-right text-[11px] font-bold">{progress}%</p>
          </div>
        </div>
      </Link>
      <div className="border-t border-border p-3">
        <Link to="/obra/$slug" params={{ slug }} className="line-clamp-2 min-h-10 text-sm font-bold leading-5 hover:text-primary">{title}</Link>
        {resumeChapter !== undefined ? <Button asChild variant="secondary" size="sm" className="mt-3 w-full text-xs"><Link to="/obra/$slug/$chapter" params={{ slug, chapter: String(resumeChapter) }}><BookOpen className="h-3.5 w-3.5" /> Cap. {resumeChapter}</Link></Button> : null}
      </div>
      {onRemove ? (
        <Button variant="ghost" size="icon"
          onClick={onRemove}
          aria-label={`Remover ${title}`}
          title={`Remover ${title}`}
          className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-full bg-background/80 text-muted-foreground backdrop-blur hover:text-destructive"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      ) : null}
    </div>
  );
}

export const STATUSES = [
  { key: "interessado", label: "Interessado", icon: Sparkles },
  { key: "lendo", label: "Lendo", icon: BookOpen },
  { key: "lido", label: "Lido", icon: CheckCircle2 },
  { key: "dropado", label: "Dropado", icon: Ban },
  { key: "planejo", label: "Planejo Ler", icon: BookmarkPlus },
] as const;
