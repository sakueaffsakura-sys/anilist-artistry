import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { extractWork, normalizeChapterContent, text } from "@/lib/mediocre-api";
import { EmptyState, JsonViewer } from "@/components/mediocre/MediocreViews";
import { ChapterReader, RetryError, ShowcaseLayout, SkeletonGrid, useMediocrePublic } from "@/components/mediocre/MediocreShowcase";

export const Route = createFileRoute("/mediocre/capitulo/$id")({
  head: ({ params }) => ({ meta: [{ title: `Capítulo ${params.id} — MediocreScan Obras` }, { name: "description", content: "Leitura de capítulo carregado da API MediocreScan." }, { property: "og:title", content: `Capítulo ${params.id} — MediocreScan Obras` }, { property: "og:description", content: "Ler capítulo." }, { property: "og:type", content: "article" }, { name: "twitter:card", content: "summary" }] }),
  component: ShowcaseChapter,
});

type Row = Record<string, unknown>;

function ShowcaseChapter() {
  const { id } = Route.useParams();
  const valid = /^\d{1,9}$/.test(id) && Number(id) > 0;
  const q = useMediocrePublic({ operation: "conteudo_capitulo", capituloId: Number(id) }, valid);
  const payload = (q.data ?? {}) as { capitulo?: Row; conteudo?: unknown };
  const meta = payload.capitulo ?? {};
  const obrId = typeof meta["obr_id"] === "number" ? meta["obr_id"] : null;
  const work = useMediocrePublic({ operation: "obra", obraId: obrId ?? 1 }, obrId !== null);
  const list = (extractWork(work.data)?.["capitulos"] as Row[] | undefined ?? []).filter((c) => typeof c["cap_id"] === "number").sort((a, b) => Number(a["cap_num"]) - Number(b["cap_num"]));
  const idx = list.findIndex((c) => c["cap_id"] === Number(id));
  const prev = idx > 0 ? list[idx - 1] : undefined;
  const next = idx >= 0 && idx < list.length - 1 ? list[idx + 1] : undefined;
  const blocks = normalizeChapterContent(payload.conteudo);

  const nav = (
    <div className="flex flex-wrap items-center justify-between gap-2">
      {obrId ? <Button asChild variant="outline" size="sm"><Link to="/mediocre/obra/$id" params={{ id: String(obrId) }}><ArrowLeft className="mr-1 h-4 w-4" />Voltar à obra</Link></Button> : <span />}
      <div className="flex gap-2">
        <Button asChild={Boolean(prev)} variant="outline" size="sm" disabled={!prev}>{prev ? <Link to="/mediocre/capitulo/$id" params={{ id: String(prev["cap_id"]) }}><ChevronLeft className="h-4 w-4" />Anterior</Link> : <span><ChevronLeft className="h-4 w-4" />Anterior</span>}</Button>
        <Button asChild={Boolean(next)} variant="outline" size="sm" disabled={!next}>{next ? <Link to="/mediocre/capitulo/$id" params={{ id: String(next["cap_id"]) }}>Próximo<ChevronRight className="h-4 w-4" /></Link> : <span>Próximo<ChevronRight className="h-4 w-4" /></span>}</Button>
      </div>
    </div>
  );

  return (
    <ShowcaseLayout>
      <nav className="text-xs text-muted-foreground"><Link to="/mediocre" className="hover:text-primary">MediocreScan Obras</Link> / Ler capítulo</nav>
      {!valid ? <EmptyState message="ID de capítulo inválido." />
        : q.isLoading ? <SkeletonGrid />
        : q.error ? <RetryError message={q.error.message} onRetry={() => void q.refetch()} />
        : (
          <>
            <h2 className="font-display text-xl font-semibold">{text((meta["obra"] as Row | undefined)?.["obr_nome"])} · Capítulo {text(meta["cap_num"])}</h2>
            {nav}
            {blocks.some((b) => b.type !== "unknown") ? <ChapterReader blocks={blocks} /> : <EmptyState message="O formato retornado não foi reconhecido. Veja o JSON abaixo." />}
            {nav}
            <JsonViewer data={payload} fileName={`conteudo-capitulo-${id}.json`} />
          </>
        )}
    </ShowcaseLayout>
  );
}
