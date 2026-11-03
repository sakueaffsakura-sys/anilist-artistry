import { createFileRoute, Link } from "@tanstack/react-router";
import { extractWork, text } from "@/lib/mediocre-api";
import { EmptyState, JsonViewer, WorkDetails } from "@/components/mediocre/MediocreViews";
import { RetryError, ShowcaseLayout, SkeletonGrid, useMediocrePublic } from "@/components/mediocre/MediocreShowcase";

export const Route = createFileRoute("/mediocre/obra/$id")({
  head: ({ params }) => ({ meta: [{ title: `Obra ${params.id} — MediocreScan Obras` }, { name: "description", content: "Detalhes da obra e lista de capítulos carregados da API MediocreScan." }, { property: "og:title", content: `Obra ${params.id} — MediocreScan Obras` }, { property: "og:description", content: "Detalhes e capítulos da obra." }, { property: "og:type", content: "article" }, { name: "twitter:card", content: "summary" }] }),
  component: ShowcaseWork,
});

function ShowcaseWork() {
  const { id } = Route.useParams();
  const valid = /^\d{1,9}$/.test(id) && Number(id) > 0;
  const q = useMediocrePublic({ operation: "obra", obraId: Number(id) }, valid);
  const work = extractWork(q.data);
  const chapters = work && Array.isArray(work["capitulos"]) ? (work["capitulos"] as Array<Record<string, unknown>>).filter((c) => typeof c["cap_id"] === "number").sort((a, b) => Number(a["cap_num"]) - Number(b["cap_num"])) : [];
  return (
    <ShowcaseLayout>
      <nav className="text-xs text-muted-foreground"><Link to="/mediocre" className="hover:text-primary">MediocreScan Obras</Link> / Detalhes da obra</nav>
      {!valid ? <EmptyState message="ID de obra inválido." />
        : q.isLoading ? <SkeletonGrid />
        : q.error ? <RetryError message={q.error.message} onRetry={() => void q.refetch()} />
        : !work ? <EmptyState message="O formato retornado não foi reconhecido." />
        : (
          <>
            <WorkDetails work={{ ...work, capitulos: undefined }} />
            <section className="space-y-2">
              <h2 className="font-display text-xl font-semibold">Capítulos ({chapters.length})</h2>
              {!chapters.length ? <EmptyState message="Nenhum capítulo nesta obra." /> : (
                <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {chapters.map((c) => (
                    <li key={String(c["cap_id"])}>
                      <Link to="/mediocre/capitulo/$id" params={{ id: String(c["cap_id"]) }} className="block rounded-lg border border-border bg-card p-3 text-sm hover:border-primary">
                        <span className="font-semibold">Capítulo {text(c["cap_num"])}</span>
                        {text(c["cap_nome"]) && text(c["cap_nome"]) !== text(c["cap_num"]) && <span className="text-muted-foreground"> · {text(c["cap_nome"])}</span>}
                        {c["cap_ia"] === true && <span className="ml-2 rounded-full bg-primary/15 px-2 text-[10px] font-bold text-primary">IA</span>}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <JsonViewer data={q.data} fileName={`obra-${id}.json`} />
          </>
        )}
    </ShowcaseLayout>
  );
}
