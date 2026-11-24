import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { fallback, zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";
import { RotateCw } from "lucide-react";
import { SiteFooter, SiteHeader } from "@/components/SiteHeader";
import { UpdateCard, UpdatesViewToggle, useUpdatesView } from "@/components/RecentlyUpdated";
import { Button } from "@/components/ui/button";
import { HOME_FORMATS, HOME_KINDS } from "@/lib/home-formats";
import { fetchSeries } from "@/lib/queries";
import { UPDATES_PAGE_SIZE, formatAccent, splitUpdatesPage, updatesOffset } from "@/lib/updates-page";

const searchSchema = z.object({
  formato: fallback(z.enum(HOME_FORMATS), "Comic").default("Comic"),
  pagina: fallback(z.number().int().min(1).max(500), 1).default(1),
});

export const Route = createFileRoute("/atualizados")({
  staticData: { sitemap: true },
  validateSearch: zodValidator(searchSchema),
  head: () => ({
    meta: [
      { title: "Recentemente atualizados — Better Mangá" },
      {
        name: "description",
        content: "Capítulos novos de mangás, manhwas, manhuas e comics em ordem de lançamento, no Better Mangá.",
      },
      { property: "og:title", content: "Recentemente atualizados — Better Mangá" },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://bettermanga.net/atualizados" },
    ],
    links: [{ rel: "canonical", href: "https://bettermanga.net/atualizados" }],
  }),
  component: UpdatesPage,
});

function UpdatesPage() {
  const { formato, pagina } = Route.useSearch();
  const { view, choose } = useUpdatesView();
  const works = useQuery({
    queryKey: ["series", "updates-page", formato, pagina],
    // Uma obra a mais que a página: se ela vier, existe próxima página.
    queryFn: () =>
      fetchSeries({ kinds: HOME_KINDS[formato], order: "updated_at", pinnedFirst: true, limit: UPDATES_PAGE_SIZE + 1, offset: updatesOffset(pagina) }),
  });
  const { items, hasNext } = splitUpdatesPage(works.data ?? []);
  const novels = formato === "Novel";

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="updates-page" data-accent={formatAccent(formato)}>
        <div className="updates-head">
          <div>
            <h1>Recentemente atualizados</h1>
            <p>Capítulos novos em ordem de lançamento</p>
          </div>
          <nav className="updates-switch" aria-label="Atualizados, continue lendo e novels">
            <Link
              to="/atualizados"
              search={{ formato: novels ? "Comic" : formato, pagina: 1 }}
              data-active={!novels}
              aria-current={novels ? undefined : "page"}
            >
              Atualizados
            </Link>
            <Link to="/historico">Continue lendo</Link>
            <Link
              to="/atualizados"
              search={{ formato: "Novel", pagina: 1 }}
              data-active={novels}
              aria-current={novels ? "page" : undefined}
            >
              Novels
            </Link>
          </nav>
        </div>

        <nav className="updates-tabs" aria-label="Formato das obras">
          {HOME_FORMATS.map((format) => (
            <Link
              key={format}
              to="/atualizados"
              search={{ formato: format, pagina: 1 }}
              className="updates-tab"
              data-active={format === formato}
              aria-current={format === formato ? "page" : undefined}
              preload="intent"
            >
              {format}
            </Link>
          ))}
        </nav>

        <div className="updates-toolbar">
          <UpdatesViewToggle view={view} choose={choose} />
        </div>

        {works.isPending ? (
          <div aria-busy="true" aria-label="Carregando obras" className="update-grid updates-grid" data-view="grid">
            {Array.from({ length: 14 }, (_, index) => (
              <div key={index} aria-hidden="true" className="space-y-2">
                <div className="aspect-[2/3] rounded-xl bg-surface-2 motion-safe:animate-pulse" />
                <div className="h-4 w-4/5 rounded bg-surface-2 motion-safe:animate-pulse" />
              </div>
            ))}
          </div>
        ) : works.isError ? (
          <div role="alert" className="updates-empty">
            <p>Não foi possível carregar as obras. Tente novamente.</p>
            <Button variant="outline" onClick={() => void works.refetch()}><RotateCw className="h-4 w-4" />Tentar novamente</Button>
          </div>
        ) : items.length === 0 ? (
          <div className="updates-empty">
            <p>{pagina > 1 ? "Não há mais obras nesta página." : `Nenhuma obra em ${formato} por enquanto.`}</p>
            {pagina > 1 ? (
              <Link to="/atualizados" search={{ formato, pagina: 1 }} className="updates-pager-link">Voltar à primeira página</Link>
            ) : null}
          </div>
        ) : (
          <div className="update-grid updates-grid" data-view={view}>
            {items.map((item) => (
              <UpdateCard key={item.id} item={item} pinned={item.pinned} />
            ))}
          </div>
        )}

        {pagina > 1 || hasNext ? (
          <nav className="updates-pager" aria-label="Páginas">
            {pagina > 1 ? (
              <Link to="/atualizados" search={{ formato, pagina: pagina - 1 }} className="updates-pager-link">← Anterior</Link>
            ) : (
              <span className="updates-pager-link" aria-disabled="true">← Anterior</span>
            )}
            <span className="updates-pager-page">Página {pagina}</span>
            {hasNext ? (
              <Link to="/atualizados" search={{ formato, pagina: pagina + 1 }} className="updates-pager-link">Próxima →</Link>
            ) : (
              <span className="updates-pager-link" aria-disabled="true">Próxima →</span>
            )}
          </nav>
        ) : null}
      </main>
      <SiteFooter />
    </div>
  );
}
