import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { getEmergencyWork } from "@/lib/emergency.functions";

export const Route = createFileRoute("/emergencia/obra/$slug")({
  staticData: { sitemap: false },
  loader: async ({ params }) => {
    const r = await getEmergencyWork({ data: { slug: params.slug } });
    if (r.databaseUp) throw redirect({ to: "/" });
    return r;
  },
  head: ({ loaderData }) => {
    const title = loaderData && !loaderData.databaseUp && loaderData.work ? `${loaderData.work.title} — Better Mangá` : "Obra — Better Mangá";
    const description = "Leitura no modo de emergência do Better Mangá.";
    return { meta: [
      { title }, { name: "description", content: description },
      { property: "og:title", content: title }, { property: "og:description", content: description },
      { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ] };
  },
  component: EmergencyWork,
});

function EmergencyWork() {
  const data = Route.useLoaderData();
  if (data.databaseUp || !data.work) {
    return <p className="py-16 text-center text-sm text-muted-foreground">Obra não encontrada na cópia. <Link to="/emergencia" className="text-primary">Voltar</Link></p>;
  }
  const w = data.work;
  return (
    <article>
      <div className="flex flex-col gap-4 sm:flex-row">
        <div className="aspect-[2/3] w-40 shrink-0 overflow-hidden rounded-md bg-surface-2">
          {w.cover_url ? <img src={w.cover_url} alt={w.title} width={160} height={240} className="h-full w-full object-cover" /> : null}
        </div>
        <div className="min-w-0">
          <h1 className="text-2xl font-bold">{w.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{[w.kind, w.status, ...(w.genres ?? []).slice(0, 4)].filter(Boolean).join(" · ")}</p>
          {w.synopsis ? <p className="mt-3 max-w-2xl whitespace-pre-line text-sm leading-relaxed text-muted-foreground">{w.synopsis}</p> : null}
        </div>
      </div>
      <h2 className="mt-6 mb-2 text-lg font-semibold">Capítulos ({data.chapters.length})</h2>
      <ul className="divide-y divide-border overflow-hidden rounded-md border border-border">
        {data.chapters.map((c) => (
          <li key={c.id}>
            <Link to="/emergencia/ler/$id" params={{ id: c.id }} className="flex justify-between gap-3 px-3 py-2.5 text-sm hover:bg-surface-2">
              <span className="font-medium">Capítulo {c.number}{c.title ? ` — ${c.title}` : ""}</span>
              <span className="shrink-0 text-xs text-muted-foreground">{new Date(c.created_at).toLocaleDateString("pt-BR")}</span>
            </Link>
          </li>
        ))}
      </ul>
    </article>
  );
}
