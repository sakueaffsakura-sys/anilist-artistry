import { useMemo, useState } from "react";
import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { Input } from "@/components/ui/input";
import { getEmergencyIndex } from "@/lib/emergency.functions";
import { searchBackupWorks } from "@/lib/emergency";

export const Route = createFileRoute("/emergencia/")({
  staticData: { sitemap: false },
  head: () => ({ meta: [
    { title: "Modo de emergência — Better Mangá" },
    { name: "description", content: "Leia as obras do Better Mangá enquanto o sistema volta ao normal." },
    { property: "og:title", content: "Modo de emergência — Better Mangá" },
    { property: "og:description", content: "As obras continuam disponíveis para leitura durante a instabilidade." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
    { name: "robots", content: "noindex" },
  ] }),
  loader: async () => {
    const r = await getEmergencyIndex();
    if (r.databaseUp) throw redirect({ to: "/" });
    return r;
  },
  component: EmergencyHome,
});

function EmergencyHome() {
  const data = Route.useLoaderData();
  const [term, setTerm] = useState("");
  const works = useMemo(() => searchBackupWorks(data.works, term), [data.works, term]);
  if (!data.works.length) {
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <h1 className="text-xl font-semibold">Voltamos em breve</h1>
        <p className="mt-2 text-sm text-muted-foreground">O sistema está fora do ar e a cópia das obras ainda não está disponível. Tente de novo em alguns minutos.</p>
      </div>
    );
  }
  return (
    <section>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Obras</h1>
          {data.generated_at ? <p className="text-xs text-muted-foreground">Cópia de {new Date(data.generated_at).toLocaleString("pt-BR")}</p> : null}
        </div>
        <Input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Buscar obra" aria-label="Buscar obra" className="w-full max-w-xs" />
      </div>
      <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
        {works.slice(0, 300).map((w) => (
          <li key={w.id}>
            <Link to="/emergencia/obra/$slug" params={{ slug: w.slug }} className="group block">
              <div className="aspect-[2/3] overflow-hidden rounded-md bg-surface-2">
                {w.cover_url ? <img src={w.cover_url} alt={w.title} loading="lazy" width={200} height={300} className="h-full w-full object-cover" /> : null}
              </div>
              <p className="mt-1.5 line-clamp-2 text-sm font-medium group-hover:text-primary">{w.title}</p>
              <p className="text-xs text-muted-foreground">{w.chapter_count} capítulos</p>
            </Link>
          </li>
        ))}
      </ul>
      {works.length > 300 ? <p className="mt-4 text-sm text-muted-foreground">Use a busca para encontrar outras obras.</p> : null}
    </section>
  );
}
