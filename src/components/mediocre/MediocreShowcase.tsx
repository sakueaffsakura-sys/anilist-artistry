import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { SiteHeader, SiteFooter } from "@/components/SiteHeader";
import { Button } from "@/components/ui/button";
import { queryMediocrePublic } from "@/lib/mediocre-api.functions";
import { pick, text, workImage, type ContentBlock, type MediocreRequest } from "@/lib/mediocre-api";

/** Public data hook: 5-minute cache, deduplicated by TanStack Query, no automatic retries. */
export function useMediocrePublic(req: MediocreRequest, enabled = true) {
  return useQuery({
    queryKey: ["mediocre-public", req.operation, req.obraId ?? null, req.capituloId ?? null],
    enabled,
    staleTime: 5 * 60_000,
    retry: false,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const r = await queryMediocrePublic({ data: req });
      if (!r.ok) throw new Error(r.error.message);
      return JSON.parse(r.json) as unknown;
    },
  });
}

export function ShowcaseLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-6xl space-y-6 px-4 py-8">
        <div>
          <h1 className="font-display text-3xl font-bold">MediocreScan Obras</h1>
          <p className="text-sm text-muted-foreground">Explore obras, novels, capítulos e conteúdos disponíveis na API.</p>
        </div>
        {children}
        <p className="border-t border-border pt-4 text-xs text-muted-foreground">Os dados exibidos são carregados de uma API externa. A disponibilidade e os direitos do conteúdo pertencem aos respectivos responsáveis.</p>
      </main>
      <SiteFooter />
    </div>
  );
}

export function RetryError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
      <span>{message}</span>
      <Button size="sm" variant="outline" onClick={onRetry}><RefreshCw className="mr-1 h-4 w-4" />Tentar novamente</Button>
    </div>
  );
}

export function SkeletonGrid() {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5" aria-label="Carregando obras..." role="status">
      {Array.from({ length: 10 }, (_, i) => <div key={i} className="aspect-[2/3] animate-pulse rounded-xl bg-muted" />)}
    </div>
  );
}

type Row = Record<string, unknown>;

export function PublicWorkCard({ row, showIa }: { row: Row; showIa?: boolean | undefined }) {
  const id = text(pick(row, "obr_id", "id"));
  const name = text(pick(row, "obr_nome", "nome")) ?? "Sem título";
  const img = workImage(row);
  const fmt = typeof row["formato"] === "string" ? row["formato"] : null;
  const caps = text(pick(row, "total_capitulos", "total_capitulos_ativos"));
  const ia = showIa && (row["obr_ia"] === true || row["ia"] === true);
  if (!id) return null;
  return (
    <Link to="/mediocre/obra/$id" params={{ id }} className="group block space-y-2">
      <div className="relative aspect-[2/3] overflow-hidden rounded-xl bg-muted">
        {img && <img src={img} alt={name} loading="lazy" className="h-full w-full object-cover transition-transform group-hover:scale-105" />}
        {ia && <span className="absolute left-2 top-2 rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold text-primary-foreground">IA</span>}
      </div>
      <h3 className="line-clamp-2 text-sm font-semibold">{name}</h3>
      <p className="text-xs text-muted-foreground">{[fmt, caps ? `${caps} capítulos` : null].filter(Boolean).join(" · ")}</p>
    </Link>
  );
}

export function ChapterReader({ blocks }: { blocks: ContentBlock[] }) {
  return (
    <div className="mx-auto max-w-3xl">
      {blocks.map((b, i) =>
        b.type === "image" ? <img key={i} src={b.url} alt={`Página ${i + 1}`} loading={i < 3 ? "eager" : "lazy"} className="block w-full" />
        : b.type === "text" ? <div key={i} className="space-y-4 py-4 text-base leading-relaxed">{b.text.split(/\n{2,}|\r\n\r\n/).map((p, j) => <p key={j} className="whitespace-pre-line">{p}</p>)}</div>
        : null,
      )}
    </div>
  );
}
