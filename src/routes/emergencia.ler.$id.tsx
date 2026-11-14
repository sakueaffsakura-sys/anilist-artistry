import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { getEmergencyChapter } from "@/lib/emergency.functions";
import { UUID_RE } from "@/lib/emergency";
import { parseNovelContent } from "@/lib/novel-content";

export const Route = createFileRoute("/emergencia/ler/$id")({
  staticData: { sitemap: false },
  loader: async ({ params }) => {
    if (!UUID_RE.test(params.id)) return { databaseUp: false as const, chapter: null, work: null, prev: null, next: null };
    const r = await getEmergencyChapter({ data: { id: params.id } });
    if (r.databaseUp) throw redirect({ to: "/" });
    return r;
  },
  head: ({ loaderData }) => {
    const title = loaderData && !loaderData.databaseUp && loaderData.work && loaderData.chapter ? `${loaderData.work.title} — Capítulo ${loaderData.chapter.number}` : "Capítulo — Better Mangá";
    const description = "Leitura no modo de emergência do Better Mangá.";
    return { meta: [
      { title }, { name: "description", content: description },
      { property: "og:title", content: title }, { property: "og:description", content: description },
      { property: "og:type", content: "article" }, { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ] };
  },
  component: EmergencyReader,
});

function EmergencyReader() {
  const data = Route.useLoaderData();
  if (data.databaseUp || !data.chapter || !data.work) {
    return <p className="py-16 text-center text-sm text-muted-foreground">Capítulo não encontrado na cópia. <Link to="/emergencia" className="text-primary">Voltar</Link></p>;
  }
  const { chapter, work, prev, next } = data;
  const nav = (
    <div className="flex items-center justify-between gap-2">
      {prev ? <Button asChild variant="secondary" size="sm"><Link to="/emergencia/ler/$id" params={{ id: prev.id }}>Anterior</Link></Button> : <span />}
      <Button asChild variant="ghost" size="sm"><Link to="/emergencia/obra/$slug" params={{ slug: work.slug }}>Capítulos</Link></Button>
      {next ? <Button asChild size="sm"><Link to="/emergencia/ler/$id" params={{ id: next.id }}>Próximo</Link></Button> : <span />}
    </div>
  );
  const blocks = chapter.content ? parseNovelContent(chapter.content) : [];
  return (
    <article className="mx-auto max-w-3xl">
      <h1 className="text-lg font-semibold">{work.title} — Capítulo {chapter.number}</h1>
      {chapter.title ? <p className="text-sm text-muted-foreground">{chapter.title}</p> : null}
      <div className="my-4">{nav}</div>
      {chapter.pages.length ? (
        <div className="-mx-4 sm:mx-0">
          {chapter.pages.map((src, i) => (
            <img key={`${src}-${i}`} src={src} alt={`Página ${i + 1}`} loading={i < 2 ? "eager" : "lazy"} className="block w-full" style={{ minHeight: i < 2 ? undefined : "40vh" }} />
          ))}
        </div>
      ) : blocks.length ? (
        <div className="space-y-4 text-base leading-relaxed">
          {blocks.map((b, i) => b.type === "image" ? <img key={i} src={b.src} alt="" loading="lazy" className="mx-auto max-w-full rounded-md" /> : <p key={i}>{b.text}</p>)}
        </div>
      ) : (
        <p className="py-10 text-center text-sm text-muted-foreground">Este capítulo não tem páginas na cópia.</p>
      )}
      <div className="my-6">{nav}</div>
    </article>
  );
}
