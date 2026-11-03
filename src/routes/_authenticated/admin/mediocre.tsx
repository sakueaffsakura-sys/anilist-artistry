import { useState, type FormEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { getImportedMediocreIds, importMediocreWorkFn, syncMediocreNow } from "@/lib/mediocre-import.functions";
import { useServerFn } from "@tanstack/react-start";
import { Check, RefreshCw, Search, X } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { AdminShell } from "@/components/AdminShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useRoles, useSession } from "@/hooks/useAuth";
import { getMediocreTokenStatus, queryMediocreApi, saveMediocreToken } from "@/lib/mediocre-api.functions";
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
  const req: MediocreRequest = tab === "obra" || tab === "capitulos_usuario" ? { operation: tab, obraId } : { operation: tab };

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
    <AdminShell title="MediocreScan API" subtitle="Painel de obras, atualizações e capítulos" adminOnly>
      <div className="space-y-5">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">MediocreScan API</h1>
            <p className="text-sm text-muted-foreground">Painel de obras, atualizações e capítulos</p>
          </div>
          <Button variant="outline" size="sm" disabled={q.isFetching || !isAdmin} onClick={() => q.refetch()}><RefreshCw className={`mr-1 h-4 w-4 ${q.isFetching ? "animate-spin" : ""}`} />Atualizar</Button>
        </header>

        {isAdmin && <TokenSettings />}
        {isAdmin && <SyncButton />}

        <nav className="flex gap-2 overflow-x-auto pb-1" aria-label="Consultas">
          {TABS.map((t) => (
            <Button key={t.id} size="sm" variant={tab === t.id ? "default" : "outline"} className="shrink-0" onClick={() => setTab(t.id)} aria-pressed={tab === t.id}>{t.label}</Button>
          ))}
        </nav>

        {(tab === "obra" || tab === "capitulos_usuario") && (
          <form onSubmit={submit} className="flex max-w-sm gap-2">
            <Input inputMode="numeric" value={idInput} onChange={(e) => setIdInput(e.target.value.replace(/\D/g, ""))} aria-label="ID da obra" />
            <Button type="submit" disabled={q.isFetching}><Search className="mr-1 h-4 w-4" />Consultar</Button>
          </form>
        )}

        {!isAdmin ? <ErrorState message="Somente administradores podem usar esta consulta." />
          : q.isLoading ? <LoadingState />
          : q.error ? <ErrorState message="Não foi possível conectar à API." />
          : q.data && q.data.ok === false ? <ErrorState message={q.data.error.message} />
          : q.data?.ok ? <Result tab={tab} data={JSON.parse(q.data.json) as unknown} fileName={mediocreFileName(req)} /> : null}
      </div>
    </AdminShell>
  );
}

function Result({ tab, data, fileName }: { tab: Tab; data: unknown; fileName: string }) {
  let body;
  if (tab === "obra") {
    const work = extractWork(data);
    body = work ? <><ImportButton obraId={Number(work["obr_id"])} /><WorkDetails work={work} /></> : <EmptyState message="Formato não reconhecido. Veja o JSON abaixo (modo diagnóstico)." />;
  } else {
    const list = extractList(data);
    if (!list) body = <EmptyState message="Não foi possível identificar uma lista. Veja o JSON abaixo (modo diagnóstico)." />;
    else body = tab === "capitulos_usuario" ? <ChapterList chapters={list} /> : <PublishableGrid rows={list} showIa={tab === "recentes_ia"} />;
  }
  return <div className="space-y-4">{body}<JsonViewer data={data} fileName={fileName} /></div>;
}

function ImportButton({ obraId }: { obraId: number }) {
  const run = useServerFn(importMediocreWorkFn);
  const m = useMutation({
    mutationFn: () => run({ data: { obraId } }),
    onSuccess: (r) => toast.success(`${r.created ? "Obra criada" : "Obra atualizada"}: ${r.added} capítulos adicionados${r.skipped ? `, ${r.skipped} sem conteúdo` : ""}${r.remaining ? `. Faltam ${r.remaining}; clique de novo para continuar.` : "."}`),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Não foi possível importar."),
  });
  if (!Number.isSafeInteger(obraId) || obraId <= 0) return null;
  return <Button onClick={() => m.mutate()} disabled={m.isPending}>{m.isPending ? "Adicionando…" : "Adicionar ao Better Mangá"}</Button>;
}

const rowId = (r: Record<string, unknown>) => Number(r["obr_id"] ?? r["id"]);

/** Cards marked published (check) or not yet (blue X); "Publicar todas" skips the published ones. */
function PublishableGrid({ rows, showIa }: { rows: Record<string, unknown>[]; showIa: boolean }) {
  const ids = [...new Set(rows.map(rowId).filter((n) => Number.isSafeInteger(n) && n > 0))];
  const check = useServerFn(getImportedMediocreIds);
  const qc = useQueryClient();
  const key = ["mediocre-imported", ids.join(",")];
  const imported = useQuery({ queryKey: key, queryFn: () => check({ data: { ids } }), staleTime: 30_000 });
  const have = new Set(imported.data ?? []);
  const run = useServerFn(importMediocreWorkFn);
  const [prog, setProg] = useState<{ done: number; fail: number; total: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const pending = ids.filter((id) => !have.has(id));
  const start = async () => {
    if (!pending.length) { toast.info("Todas desta página já estão publicadas."); return; }
    if (!confirm(`Publicar ${pending.length} obras novas? ${ids.length - pending.length} já publicadas serão ignoradas.`)) return;
    setBusy(true); let done = 0, fail = 0; setProg({ done, fail, total: pending.length });
    for (const id of pending) {
      try { await run({ data: { obraId: id } }); done++; qc.setQueryData<number[]>(key, (old) => [...(old ?? []), id]); } catch { fail++; }
      setProg({ done, fail, total: pending.length });
    }
    setBusy(false);
    void imported.refetch();
    toast.success(`${done} obras publicadas${fail ? `, ${fail} com erro` : ""}.`);
  };
  const badgeFor = (r: Record<string, unknown>) => {
    if (!imported.data) return null;
    const ok = have.has(rowId(r));
    return (
      <span key={String(ok)} className={`mediocre-status ${ok ? "mediocre-status-ok" : "mediocre-status-new"}`} title={ok ? "Já publicada" : "Ainda não publicada"} aria-label={ok ? "Já publicada" : "Ainda não publicada"}>
        {ok ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}
      </span>
    );
  };
  return (
    <>
      {ids.length > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={start} disabled={busy || imported.isLoading}>{busy ? "Publicando…" : `Publicar novas (${pending.length})`}</Button>
          <span className="text-sm text-muted-foreground">{imported.data ? `${ids.length - pending.length} já publicadas` : "Verificando…"}{prog ? ` · ${prog.done + prog.fail}/${prog.total} · ${prog.fail} erros` : ""}</span>
        </div>
      )}
      <WorkGrid rows={rows} showIa={showIa} badgeFor={badgeFor} />
    </>
  );
}

function SyncButton() {
  const run = useServerFn(syncMediocreNow);
  const m = useMutation({
    mutationFn: () => run(),
    onSuccess: (r) => toast.success(`${r.checked} obras verificadas, ${r.added} capítulos novos.`),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao atualizar."),
  });
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border p-3 text-sm">
      <span className="text-muted-foreground">Capítulos novos são copiados sozinhos a cada 10 minutos para as obras já publicadas.</span>
      <Button size="sm" variant="outline" onClick={() => m.mutate()} disabled={m.isPending}>{m.isPending ? "Verificando…" : "Verificar agora"}</Button>
    </div>
  );
}

function TokenSettings() {
  const status = useServerFn(getMediocreTokenStatus);
  const save = useServerFn(saveMediocreToken);
  const s = useQuery({ queryKey: ["mediocre-token"], queryFn: () => status() });
  const [token, setToken] = useState("");
  const [refresh, setRefresh] = useState("");
  const m = useMutation({
    mutationFn: () => save({ data: { token, refreshToken: refresh } }),
    onSuccess: () => { setToken(""); setRefresh(""); void s.refetch(); toast.success("Token atualizado."); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao salvar."),
  });
  return (
    <details className="rounded-lg border p-3">
      <summary className="cursor-pointer text-sm font-semibold">Configuração do token {s.data?.hasToken ? `· salvo ${s.data.updatedAt ? new Date(s.data.updatedAt).toLocaleString("pt-BR") : ""}` : "· usando token padrão"}</summary>
      <form className="mt-3 grid gap-2" onSubmit={(e) => { e.preventDefault(); m.mutate(); }}>
        <Input type="password" autoComplete="off" placeholder="Novo token (Authorization)" value={token} onChange={(e) => setToken(e.target.value)} />
        <Input type="password" autoComplete="off" placeholder="Refresh token (opcional)" value={refresh} onChange={(e) => setRefresh(e.target.value)} />
        <p className="text-xs text-muted-foreground">O token fica guardado só no servidor e nunca é mostrado de volta. Se a API falhar, o site usa a última cópia salva.</p>
        <Button type="submit" disabled={!token || m.isPending} className="w-fit">{m.isPending ? "Salvando…" : "Salvar token"}</Button>
      </form>
    </details>
  );
}
