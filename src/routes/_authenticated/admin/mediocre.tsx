import { useState, type FormEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { RefreshCw, Search } from "lucide-react";
import { AdminShell } from "@/components/AdminShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useRoles, useSession } from "@/hooks/useAuth";
import { queryMediocreApi } from "@/lib/mediocre-api.functions";
import { extractList, extractWork, mediocreFileName, type MediocreRequest } from "@/lib/mediocre-api";
import { ChapterList, EmptyState, ErrorState, JsonViewer, LoadingState, WorkDetails, WorkGrid } from "@/components/mediocre/MediocreViews";

export const Route = createFileRoute("/_authenticated/admin/mediocre")({
  staticData: { sitemap: false },
  head: () => ({ meta: [{ title: "MediocreScan API — Painel Better Mangá" }, { name: "description", content: "Consulte obras, atualizações e capítulos da API MediocreScan." }, { property: "og:title", content: "MediocreScan API — Better Mangá" }, { property: "og:description", content: "Painel de obras, atualizações e capítulos." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: MediocrePanel,
});

const TABS = [
  { id: "home", label: "Início" },
  { id: "recentes", label: "Atualizadas recentemente" },
  { id: "recentes_ia", label: "Atualizadas com IA" },
  { id: "capitulos_usuario", label: "Capítulos do usuário" },
  { id: "obra", label: "Consultar obra por ID" },
] as const;
type Tab = (typeof TABS)[number]["id"];

function MediocrePanel() {
  const { user } = useSession();
  const { isAdmin } = useRoles(user?.id);
  const [tab, setTab] = useState<Tab>("home");
  const [idInput, setIdInput] = useState("20564");
  const [obraId, setObraId] = useState(20564);
  const call = useServerFn(queryMediocreApi);
  const req: MediocreRequest = tab === "obra" ? { operation: "obra", obraId } : { operation: tab };

  // In-memory cache (5 min) keyed by operation; TanStack Query dedupes concurrent calls.
  const q = useQuery({
    queryKey: ["mediocre-api", req.operation, req.obraId ?? null],
    enabled: isAdmin,
    staleTime: 5 * 60_000,
    retry: false,
    refetchOnWindowFocus: false,
    queryFn: () => call({ data: req }),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (/^\d{1,9}$/.test(idInput) && Number(idInput) > 0) setObraId(Number(idInput));
  };

  return (
    <AdminShell>
      <div className="space-y-5">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">MediocreScan API</h1>
            <p className="text-sm text-muted-foreground">Painel de obras, atualizações e capítulos</p>
          </div>
          <Button variant="outline" size="sm" disabled={q.isFetching || !isAdmin} onClick={() => q.refetch()}><RefreshCw className={`mr-1 h-4 w-4 ${q.isFetching ? "animate-spin" : ""}`} />Atualizar</Button>
        </header>

        <nav className="flex gap-2 overflow-x-auto pb-1" aria-label="Consultas">
          {TABS.map((t) => (
            <Button key={t.id} size="sm" variant={tab === t.id ? "default" : "outline"} className="shrink-0" onClick={() => setTab(t.id)} aria-pressed={tab === t.id}>{t.label}</Button>
          ))}
        </nav>

        {tab === "obra" && (
          <form onSubmit={submit} className="flex max-w-sm gap-2">
            <Input inputMode="numeric" value={idInput} onChange={(e) => setIdInput(e.target.value.replace(/\D/g, ""))} aria-label="ID da obra" />
            <Button type="submit" disabled={q.isFetching}><Search className="mr-1 h-4 w-4" />Consultar</Button>
          </form>
        )}

        {!isAdmin ? <ErrorState message="Somente administradores podem usar esta consulta." />
          : q.isLoading ? <LoadingState />
          : q.error ? <ErrorState message="Não foi possível conectar à API." />
          : q.data && !q.data.ok ? <ErrorState message={q.data.error.message} />
          : q.data?.ok ? <Result tab={tab} data={q.data.data} fileName={mediocreFileName(req)} /> : null}
      </div>
    </AdminShell>
  );
}

function Result({ tab, data, fileName }: { tab: Tab; data: unknown; fileName: string }) {
  let body;
  if (tab === "obra") {
    const work = extractWork(data);
    body = work ? <WorkDetails work={work} /> : <EmptyState message="Formato não reconhecido. Veja o JSON abaixo (modo diagnóstico)." />;
  } else {
    const list = extractList(data);
    if (!list) body = <EmptyState message="Não foi possível identificar uma lista. Veja o JSON abaixo (modo diagnóstico)." />;
    else body = tab === "capitulos_usuario" ? <ChapterList chapters={list} /> : <WorkGrid rows={list} showIa={tab === "recentes_ia"} />;
  }
  return <div className="space-y-4">{body}<JsonViewer data={data} fileName={fileName} /></div>;
}
