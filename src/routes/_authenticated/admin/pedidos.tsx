import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, X, Search } from "lucide-react";
import { toast } from "sonner";
import { AdminShell } from "@/components/AdminShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useRoles, useSession } from "@/hooks/useAuth";
import { fetchWorkRequests, REQUEST_STATUS } from "@/lib/work-requests";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/admin/pedidos")({
  head: () => ({ meta: [{ title: "Pedidos dos leitores — Painel Better Mangá" }, { name: "description", content: "Atenda solicitações de obras e avise os leitores." }, { property: "og:title", content: "Pedidos dos leitores — Better Mangá" }, { property: "og:description", content: "Gerenciamento de pedidos de mangás, comics e novels." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: AdminRequests,
});

function AdminRequests() {
  const { user } = useSession();
  const { isAdmin } = useRoles(user?.id);
  const qc = useQueryClient();
  const [selected, setSelected] = useState("");
  const [search, setSearch] = useState("");
  const [series, setSeries] = useState("");
  const [note, setNote] = useState("");
  const [status, setStatus] = useState("pending");
  const requests = useQuery({ queryKey: ["admin-work-requests", user?.id], enabled: isAdmin, queryFn: () => fetchWorkRequests(), refetchInterval: 60_000 });
  const works = useQuery({ queryKey: ["request-work-search", search], enabled: isAdmin && Boolean(selected), queryFn: async () => {
    const { data, error } = await supabase.from("series").select("id, title, kind").eq("published", true).ilike("title", `%${search}%`).order("title").limit(50);
    if (error) throw error;
    return data;
  } });
  const resolve = useMutation({ mutationFn: async (accept: boolean) => {
    const { error } = await supabase.rpc("resolve_work_request", { _request: selected, _series: accept ? series : undefined, _note: note.trim() });
    if (error) throw new Error("Não foi possível atender o pedido. Atualize a página e tente novamente.");
  }, onSuccess: () => { setSelected(""); setSeries(""); setNote(""); toast.success("Pedido atualizado."); void qc.invalidateQueries({ queryKey: ["admin-work-requests"] }); void qc.invalidateQueries({ queryKey: ["work-requests"] }); void qc.invalidateQueries({ queryKey: ["work-notifications"] }); }, onError: (error) => toast.error(error.message) });
  const rows = (requests.data ?? []).filter((item) => status === "all" || item.status === status);
  const current = requests.data?.find((item) => item.id === selected);
  return <AdminShell title="Pedidos de obras" subtitle="Solicitações dos leitores" adminOnly>
    <div className="mb-5 flex flex-wrap gap-3"><label htmlFor="request-status" className="sr-only">Status dos pedidos</label><select id="request-status" value={status} onChange={(event) => setStatus(event.target.value)} className="rounded-md border border-input bg-background px-3 py-2 text-sm"><option value="pending">Aguardando</option><option value="fulfilled">Adicionados</option><option value="rejected">Não atendidos</option><option value="all">Todos</option></select></div>
    {requests.isPending ? <p className="text-muted-foreground">Carregando…</p> : requests.isError ? <p role="alert" className="text-destructive">Não foi possível carregar os pedidos.</p> : !rows.length ? <p className="py-8 text-muted-foreground">Nenhum pedido nesta categoria.</p> : <div className="divide-y divide-border">{rows.map((item) => <article key={item.id} className="flex flex-wrap items-center justify-between gap-4 py-4"><div className="min-w-0"><h2 className="break-words font-semibold">{item.title}</h2><p className="text-xs text-muted-foreground">{item.profiles?.username ?? "Leitor"} · {item.kind} · {REQUEST_STATUS[item.status as keyof typeof REQUEST_STATUS]}</p>{item.notes ? <p className="mt-2 max-w-xl break-words text-sm text-muted-foreground">{item.notes}</p> : null}</div>{item.status === "pending" ? <Button variant="outline" onClick={() => { setSelected(item.id); setSearch(item.title); setSeries(""); setNote(""); }}>Atender pedido</Button> : null}</article>)}</div>}
    {current ? <section className="mt-8 border-t border-border pt-6"><h2 className="mb-4 font-display text-xl font-bold">Atender: {current.title}</h2><div className="max-w-xl space-y-4"><div className="relative"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input aria-label="Buscar obra publicada" value={search} onChange={(event) => setSearch(event.target.value)} className="pl-9" /></div><label htmlFor="requested-series" className="block text-sm">Obra publicada</label><select id="requested-series" value={series} onChange={(event) => setSeries(event.target.value)} className="w-full rounded-md border border-input bg-background p-3 text-sm"><option value="">Selecione a obra</option>{works.data?.map((item) => <option key={item.id} value={item.id}>{item.title} ({item.kind})</option>)}</select>{works.isPending ? <p className="text-sm text-muted-foreground">Buscando obras…</p> : works.isError ? <p className="text-sm text-destructive">Não foi possível buscar obras.</p> : null}<Textarea aria-label="Resposta ao leitor" placeholder="Resposta ao leitor (opcional)" maxLength={2000} value={note} onChange={(event) => setNote(event.target.value)} /><div className="flex flex-wrap gap-3"><Button disabled={!series || resolve.isPending} onClick={() => resolve.mutate(true)}><Check className="h-4 w-4" />Confirmar e notificar</Button><Button variant="outline" disabled={resolve.isPending} onClick={() => resolve.mutate(false)}><X className="h-4 w-4" />Não atender</Button><Button variant="ghost" onClick={() => setSelected("")}>Cancelar</Button></div></div></section> : null}
  </AdminShell>;
}