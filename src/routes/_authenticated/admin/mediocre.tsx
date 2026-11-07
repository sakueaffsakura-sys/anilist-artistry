import { useState, type FormEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { enqueueMediocreWorks, getImportedMediocreIds, importMediocreWorkFn, syncMediocreNow } from "@/lib/mediocre-import.functions";
import { useServerFn } from "@tanstack/react-start";
import { Check, Copy, Eye, Loader2, RefreshCw, Search, Send, X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useQueryClient } from "@tanstack/react-query";
import { AdminShell } from "@/components/AdminShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useRoles, useSession } from "@/hooks/useAuth";
import { getMediocreTokenStatus, queryMediocreApi, saveMediocreBypass, saveMediocreToken, saveMediocreRelay, testMediocreConnection } from "@/lib/mediocre-api.functions";
import { extractList, extractPagination, extractWork, mediocreFileName, type MediocreRequest } from "@/lib/mediocre-api";
import { DeviceIngest } from "@/components/mediocre/DeviceIngest";
import { MediocreQueue, QUEUE_KEY } from "@/components/mediocre/MediocreQueue";
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
  { id: "buscar", label: "Buscar por nome" },
  { id: "adicionados", label: "Adicionadas recentes" },
  { id: "ranking", label: "Ranking" },
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
  const [formato, setFormato] = useState<number | null>(null);
  const [pagina, setPagina] = useState(1);
  const [buscaInput, setBuscaInput] = useState("");
  const [busca, setBusca] = useState("");
  const [addPagina, setAddPagina] = useState(1);
  const req: MediocreRequest = tab === "obra" || tab === "capitulos_usuario" ? { operation: tab, obraId }
    : tab === "recentes" ? { operation: tab, ...(formato ? { formato } : {}), pagina }
    : tab === "buscar" ? { operation: tab, busca }
    : tab === "adicionados" ? { operation: tab, pagina: addPagina }
    : { operation: tab };

  // In-memory cache (5 min) keyed by operation; TanStack Query dedupes concurrent calls.
  const q = useQuery({
    queryKey: ["mediocre-api", req.operation, req.obraId ?? null, req.formato ?? null, req.pagina ?? null, req.busca ?? null],
    enabled: isAdmin && (tab !== "buscar" || busca.length >= 2),
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
    <AdminShell
      title="MediocreScan"
      subtitle="Obras, atualizações e capítulos da API, prontos para publicar."
      adminOnly
      actions={<Button variant="secondary" size="sm" disabled={q.isFetching || !isAdmin} onClick={() => q.refetch()}><RefreshCw className={`h-4 w-4 ${q.isFetching ? "animate-spin" : ""}`} />Atualizar</Button>}
    >
      <div className="space-y-5">

        {isAdmin && <BlockBanner />}
        {isAdmin && <TokenSettings />}
        {isAdmin && <SyncButton />}
        {isAdmin && <DeviceIngest />}
        {isAdmin && <MediocreQueue />}

        <nav className="flex gap-2 overflow-x-auto pb-1" aria-label="Consultas">
          {TABS.map((t) => (
            <button key={t.id} type="button" className="chip chip-sm" onClick={() => setTab(t.id)} aria-pressed={tab === t.id}>{t.label}</button>
          ))}
        </nav>

        {(tab === "obra" || tab === "capitulos_usuario") && (
          <form onSubmit={submit} className="flex max-w-sm gap-2">
            <Input inputMode="numeric" value={idInput} onChange={(e) => setIdInput(e.target.value.replace(/\D/g, ""))} aria-label="ID da obra" />
            <Button type="submit" disabled={q.isFetching}><Search className="mr-1 h-4 w-4" />Consultar</Button>
          </form>
        )}

        {tab === "buscar" && (
          <form onSubmit={(e) => { e.preventDefault(); const v = buscaInput.replace(/\s+/g, " ").trim(); if (v.length >= 2) setBusca(v.slice(0, 80)); }} className="flex max-w-md gap-2">
            <Input value={buscaInput} maxLength={80} placeholder="Nome da obra" onChange={(e) => setBuscaInput(e.target.value)} aria-label="Nome da obra" />
            <Button type="submit" disabled={q.isFetching || buscaInput.trim().length < 2}><Search className="mr-1 h-4 w-4" />Buscar</Button>
          </form>
        )}
        {tab === "buscar" && !busca && <p className="text-sm text-muted-foreground">Digite pelo menos 2 letras do nome e clique em Buscar.</p>}

        {tab === "adicionados" && isAdmin && (
          <div className="flex items-center gap-2 text-sm">
            <Button size="sm" variant="outline" disabled={q.isFetching || addPagina <= 1} onClick={() => setAddPagina(addPagina - 1)}>Anterior</Button>
            <span>Página {addPagina}</span>
            <Button size="sm" variant="outline" disabled={q.isFetching || addPagina >= 1000} onClick={() => setAddPagina(addPagina + 1)}>Próxima</Button>
          </div>
        )}

        {tab === "recentes" && isAdmin && (
          <PageControls formato={formato} pagina={pagina} busy={q.isFetching}
            pagination={q.data?.ok ? extractPagination(JSON.parse(q.data.json)) : null}
            onFormato={(f) => { setFormato(f); setPagina(1); }} onPagina={setPagina} />
        )}

        {!isAdmin ? <ErrorState message="Somente administradores podem usar esta consulta." />
          : q.isLoading ? <LoadingState />
          : q.error ? <ErrorState message="Não foi possível conectar à API." />
          : q.data && q.data.ok === false ? <ErrorState message={q.data.error.message} />
          : tab === "buscar" && !busca ? null
          : q.data?.ok ? <Result tab={tab} data={JSON.parse(q.data.json) as unknown} fileName={mediocreFileName(req)} /> : null}
      </div>
    </AdminShell>
  );
}

function PageControls({ formato, pagina, busy, pagination, onFormato, onPagina }: {
  formato: number | null; pagina: number; busy: boolean;
  pagination: { page: number; totalPages: number; totalItems: number } | null;
  onFormato: (f: number | null) => void; onPagina: (p: number) => void;
}) {
  const [fmt, setFmt] = useState(formato ? String(formato) : "");
  const [go, setGo] = useState("");
  const total = Math.min(pagination?.totalPages ?? pagina, 1000);
  const applyFmt = (e: FormEvent) => { e.preventDefault(); const n = Number(fmt); onFormato(fmt && n >= 1 && n <= 50 ? n : null); };
  const jump = (e: FormEvent) => { e.preventDefault(); const n = Number(go); if (n >= 1 && n <= total) { onPagina(n); setGo(""); } };
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card/60 p-3 text-sm">
      <form onSubmit={applyFmt} className="flex items-center gap-2">
        <span className="text-muted-foreground">Formato</span>
        <Input className="h-8 w-20" inputMode="numeric" placeholder="Todos" value={fmt} onChange={(e) => setFmt(e.target.value.replace(/\D/g, "").slice(0, 2))} aria-label="Formato" />
        <Button type="submit" size="sm" variant="outline" disabled={busy}>Aplicar</Button>
        {formato && <Button type="button" size="sm" variant="ghost" onClick={() => { setFmt(""); onFormato(null); }}>Todos</Button>}
      </form>
      <div className="flex items-center gap-2">
        <Button size="sm" variant="outline" disabled={busy || pagina <= 1} onClick={() => onPagina(pagina - 1)}>Anterior</Button>
        <span>Página {pagina} de {total}{pagination ? ` · ${pagination.totalItems.toLocaleString("pt-BR")} obras` : ""}</span>
        <Button size="sm" variant="outline" disabled={busy || pagina >= total} onClick={() => onPagina(pagina + 1)}>Próxima</Button>
      </div>
      <form onSubmit={jump} className="flex items-center gap-2">
        <Input className="h-8 w-20" inputMode="numeric" placeholder="Ir para" value={go} onChange={(e) => setGo(e.target.value.replace(/\D/g, "").slice(0, 4))} aria-label="Ir para página" />
        <Button type="submit" size="sm" variant="outline" disabled={busy}>Ir</Button>
      </form>
    </div>
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
  const [busy, setBusy] = useState(false);
  const pending = ids.filter((id) => !have.has(id));
  const enqueue = useServerFn(enqueueMediocreWorks);
  const nameOf = (id: number) => { const r = rows.find((x) => rowId(x) === id); return r ? String(r["obr_nome"] ?? r["nome"] ?? "") || null : null; };
  const addToQueue = async (list: number[]) => {
    setBusy(true);
    try {
      const r = await enqueue({ data: { items: list.map((obraId) => ({ obraId, title: nameOf(obraId) })) } });
      void qc.invalidateQueries({ queryKey: QUEUE_KEY });
      toast.success(r.added ? `${r.added} obra(s) colocadas na fila. Um capítulo por minuto, uma obra por vez.` : "Essas obras já estavam na fila.");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Não foi possível colocar na fila."); }
    finally { setBusy(false); }
  };
  const start = async () => {
    if (!pending.length) { toast.info("Todas desta página já estão publicadas."); return; }
    if (!confirm(`Colocar ${pending.length} obras novas na fila? ${ids.length - pending.length} já publicadas serão ignoradas. Cada capítulo espera 1 minuto; pode fechar a página.`)) return;
    await addToQueue(pending);
  };
  const sending = new Set<number>();
  const [selected, setSelected] = useState<Record<string, unknown> | null>(null);
  const publishOne = async (id: number) => {
    if (!Number.isSafeInteger(id) || id <= 0) return;
    if (have.has(id)) { toast.info("Essa obra já está publicada."); return; }
    await addToQueue([id]);
  };
  const badgeFor = (r: Record<string, unknown>) => {
    if (!imported.data) return null;
    const id = rowId(r);
    const ok = have.has(id);
    if (ok) return (
      <span key="ok" className="mediocre-status mediocre-status-ok z-10" title="Já publicada" aria-label="Já publicada"><Check className="h-4 w-4" /></span>
    );
    const isSending = sending.has(id);
    return (
      <button key="new" type="button" onClick={() => void publishOne(id)} disabled={isSending || busy} className="mediocre-status mediocre-status-new z-10 cursor-pointer" title="Enviar esta obra" aria-label="Enviar esta obra">
        {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
      </button>
    );
  };
  const selId = selected ? rowId(selected) : 0;
  const selName = selected ? String(selected["obr_nome"] ?? selected["nome"] ?? "Obra") : "";
  return (
    <>
      {ids.length > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={start} disabled={busy || imported.isLoading}>{busy ? "Colocando na fila…" : `Colocar novas na fila (${pending.length})`}</Button>
          <span className="text-sm text-muted-foreground">{imported.data ? `${ids.length - pending.length} já publicadas` : "Verificando…"}</span>
        </div>
      )}
      <WorkGrid rows={rows} showIa={showIa} badgeFor={badgeFor} onSelect={setSelected} />
      <Dialog open={!!selected} onOpenChange={(o) => { if (!o) setSelected(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="line-clamp-2">{selName}</DialogTitle>
            <DialogDescription>{have.has(selId) ? "Esta obra já está publicada no Better Mangá." : "Esta obra ainda não foi publicada."} O que deseja fazer?</DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            {have.has(selId)
              ? <Button variant="outline" onClick={() => void publishOne(selId)} disabled><Check className="mr-2 h-4 w-4" />Já publicada</Button>
              : <Button onClick={() => { void publishOne(selId); setSelected(null); }} disabled={sending.has(selId) || busy}><Send className="mr-2 h-4 w-4" />Colocar na fila de publicação</Button>}
            <Button variant="outline" asChild><a href={`/mediocre/obra/${selId}`} target="_blank" rel="noreferrer"><Eye className="mr-2 h-4 w-4" />Visualizar obra</a></Button>
            <Button variant="outline" onClick={() => { void navigator.clipboard.writeText(String(selId)).then(() => toast.success("ID copiado.")); }}><Copy className="mr-2 h-4 w-4" />Copiar ID ({selId})</Button>
            <Button variant="ghost" onClick={() => setSelected(null)}>Cancelar</Button>
          </div>
        </DialogContent>
      </Dialog>
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
  const qc = useQueryClient();
  const s = useQuery({ queryKey: ["mediocre-token"], queryFn: () => status() });
  const [token, setToken] = useState("");
  const [refresh, setRefresh] = useState("");
  const m = useMutation({
    mutationFn: () => save({ data: { token, refreshToken: refresh } }),
    onSuccess: () => { setToken(""); setRefresh(""); void s.refetch(); void qc.invalidateQueries({ queryKey: ["mediocre-api"] }); void qc.invalidateQueries({ queryKey: ["mediocre-imported"] }); toast.success("Token atualizado. Cópias salvas apagadas."); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao salvar."),
  });
  return (
    <details className="rounded-lg border p-3">
      <summary className="cursor-pointer text-sm font-semibold">Configuração do token {s.data?.hasToken ? `· salvo ${s.data.updatedAt ? new Date(s.data.updatedAt).toLocaleString("pt-BR") : ""}` : "· usando token padrão"}</summary>
      <form className="mt-3 grid gap-2" onSubmit={(e) => { e.preventDefault(); m.mutate(); }}>
        <Input type="password" autoComplete="off" placeholder="Novo token (Authorization)" value={token} onChange={(e) => setToken(e.target.value)} />
        <Input type="password" autoComplete="off" placeholder="Refresh token (opcional)" value={refresh} onChange={(e) => setRefresh(e.target.value)} />
        <p className="text-xs text-muted-foreground">O token fica guardado só no servidor e nunca é mostrado de volta. Ao salvar um token novo, todas as cópias salvas da API antiga são apagadas e o site volta a buscar tudo ao vivo.</p>
        <Button type="submit" disabled={!token || m.isPending} className="w-fit">{m.isPending ? "Salvando…" : "Salvar token"}</Button>
      </form>
      <BypassAndTest hasBypass={!!s.data?.hasBypass} onSaved={() => void s.refetch()} />
      <RelaySettings relayUrl={s.data?.relayUrl ?? null} hasSecret={!!s.data?.hasRelaySecret} onSaved={() => void s.refetch()} />
    </details>
  );
}

/** Shows when the API blocked the server IP and the site paused calls. */
function BlockBanner() {
  const status = useServerFn(getMediocreTokenStatus);
  const test = useServerFn(testMediocreConnection);
  const qc = useQueryClient();
  const s = useQuery({ queryKey: ["mediocre-block"], queryFn: () => status(), staleTime: 30_000 });
  const t = useMutation({
    mutationFn: () => test(),
    onSuccess: (r) => { r.ok ? toast.success(r.message) : toast.error(r.message); void s.refetch(); void qc.invalidateQueries({ queryKey: ["mediocre-api"] }); },
  });
  const until = s.data?.blockedUntil ? new Date(s.data.blockedUntil) : null;
  if (!until || until.getTime() <= Date.now()) return null;
  return (
    <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm">
      <p><strong>A MediocreScan bloqueou o IP do servidor.</strong> Pedidos pausados até {until.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })} para não prolongar o bloqueio. Peça à MediocreScan para liberar o servidor do Better Mangá.</p>
      <Button size="sm" variant="outline" disabled={t.isPending} onClick={() => t.mutate()}>{t.isPending ? "Testando…" : "Tentar agora"}</Button>
    </div>
  );
}

function BypassAndTest({ hasBypass, onSaved }: { hasBypass: boolean; onSaved: () => void }) {
  const saveB = useServerFn(saveMediocreBypass);
  const test = useServerFn(testMediocreConnection);
  const [value, setValue] = useState("");
  const b = useMutation({
    mutationFn: () => saveB({ data: { value } }),
    onSuccess: () => { setValue(""); onSaved(); toast.success("Chave de liberação salva."); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao salvar."),
  });
  const t = useMutation({
    mutationFn: () => test(),
    onSuccess: (r) => (r.ok ? toast.success(r.message) : toast.error(r.message)),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Falha no teste."),
  });
  return (
    <div className="mt-4 grid gap-2 border-t pt-3">
      <p className="text-sm font-semibold">Liberação no Cloudflare {hasBypass ? "· chave salva" : ""}</p>
      <p className="text-xs text-muted-foreground">Se o MediocreScan bloquear o servidor do site, crie no Cloudflare do MediocreScan uma regra que libere pedidos com o cabeçalho <code>X-BetterManga-Key</code> igual à chave abaixo. Deixe vazio e salve para remover.</p>
      <form className="flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); b.mutate(); }}>
        <Input type="password" autoComplete="off" className="max-w-sm" placeholder="Chave de liberação" value={value} onChange={(e) => setValue(e.target.value)} />
        <Button type="submit" variant="outline" disabled={b.isPending}>{b.isPending ? "Salvando…" : "Salvar chave"}</Button>
        <Button type="button" onClick={() => t.mutate()} disabled={t.isPending}>{t.isPending ? "Testando…" : "Testar conexão"}</Button>
      </form>
    </div>
  );
}

/** Ponte no cPanel: os pedidos saem de outro servidor quando a MediocreScan bloqueia o do site. */
function RelaySettings({ relayUrl, hasSecret, onSaved }: { relayUrl: string | null; hasSecret: boolean; onSaved: () => void }) {
  const save = useServerFn(saveMediocreRelay);
  const test = useServerFn(testMediocreConnection);
  const [url, setUrl] = useState(relayUrl ?? "");
  const [secret, setSecret] = useState("");
  const gen = () => {
    const bytes = crypto.getRandomValues(new Uint8Array(24));
    setSecret(Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join(""));
  };
  const m = useMutation({
    mutationFn: () => save({ data: { url, secret } }),
    onSuccess: () => { setSecret(""); onSaved(); toast.success(url ? "Ponte salva." : "Ponte removida."); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao salvar."),
  });
  const t = useMutation({
    mutationFn: () => test(),
    onSuccess: (r) => (r.ok ? toast.success(r.message) : toast.error(r.message)),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Falha no teste."),
  });
  return (
    <div className="mt-4 grid gap-2 border-t border-border pt-3">
      <p className="text-sm font-semibold">Ponte pelo cPanel {relayUrl ? (hasSecret ? "· ativa" : "· falta a senha") : "· desligada"}</p>
      <ol className="list-decimal space-y-1 pl-5 text-xs text-muted-foreground">
        <li><a className="text-primary underline" href="/downloads/mediocre-ponte.php" download>Baixe o arquivo da ponte</a> e envie pelo Gerenciador de Arquivos do cPanel (ex.: pasta public_html).</li>
        <li>Clique em "Gerar senha", copie e cole no topo do arquivo, no lugar de COLE_A_SENHA_AQUI.</li>
        <li>Cole aqui o endereço do arquivo (ex.: https://seusite.com/mediocre-ponte.php), salve e clique em "Testar ponte".</li>
      </ol>
      <Input placeholder="https://seusite.com/mediocre-ponte.php" value={url} onChange={(e) => setUrl(e.target.value)} aria-label="Endereço da ponte" />
      <div className="flex flex-wrap gap-2">
        <Input readOnly={false} autoComplete="off" placeholder={hasSecret ? "Senha salva (gere outra para trocar)" : "Senha da ponte"} value={secret} onChange={(e) => setSecret(e.target.value)} className="min-w-0 flex-1" aria-label="Senha da ponte" />
        <Button type="button" variant="outline" size="sm" onClick={gen}>Gerar senha</Button>
        {secret && <Button type="button" variant="outline" size="sm" onClick={() => { void navigator.clipboard.writeText(secret); toast.success("Senha copiada."); }}>Copiar</Button>}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" disabled={m.isPending || (!!url && !hasSecret && !secret)} onClick={() => m.mutate()}>{m.isPending ? "Salvando…" : "Salvar ponte"}</Button>
        <Button type="button" size="sm" variant="outline" disabled={t.isPending || !relayUrl} onClick={() => t.mutate()}>{t.isPending ? "Testando…" : "Testar ponte"}</Button>
      </div>
      <p className="text-xs text-muted-foreground">A senha só aparece agora; depois de salva fica guardada no servidor. Se a ponte falhar, o site tenta o caminho direto.</p>
    </div>
  );
}
