import { useState, type FormEvent } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookPlus, Send } from "lucide-react";
import { toast } from "sonner";
import { SiteHeader, SiteFooter } from "@/components/SiteHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useSession } from "@/hooks/useAuth";
import { KINDS } from "@/lib/queries";
import { fetchWorkRequests, REQUEST_STATUS } from "@/lib/work-requests";
import { useServerFn } from "@tanstack/react-start";
import { autoFulfillRequest } from "@/lib/mediocre-import.functions";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/pedidos")({
  staticData: { sitemap: false },
  head: () => ({ meta: [{ title: "Meus pedidos de obras — Better Mangá" }, { name: "description", content: "Solicite mangás, comics e novels e acompanhe seus pedidos." }, { property: "og:title", content: "Meus pedidos — Better Mangá" }, { property: "og:description", content: "Pedidos e acompanhamento de novas obras." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: RequestsPage,
});

function RequestsPage() {
  const { user } = useSession();
  const qc = useQueryClient();
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<string>("Manga");
  const [notes, setNotes] = useState("");
  const query = useQuery({ queryKey: ["work-requests", user?.id], enabled: Boolean(user), queryFn: () => fetchWorkRequests(user?.id) });
  const autoFulfill = useServerFn(autoFulfillRequest);
  const save = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Entre na sua conta.");
      const { data, error } = await supabase.from("work_requests").insert({ user_id: user.id, title: title.trim(), kind, notes: notes.trim() }).select("id, status").single();
      if (error) throw new Error(error.code === "23505" ? "Você já tem um pedido aberto para esta obra." : "Não foi possível enviar seu pedido.");
      if (data.status !== "pending") return { added: true };
      try { return await autoFulfill({ data: { requestId: data.id } }); } catch { return { added: false }; }
    },
    onSuccess: (result) => { setTitle(""); setNotes(""); toast.success(result.added ? "Obra encontrada e adicionada!" : "Pedido enviado!"); void qc.invalidateQueries({ queryKey: ["work-requests"] }); void qc.invalidateQueries({ queryKey: ["work-notifications"] }); },
    onError: (error) => toast.error(error.message),
  });
  function submit(event: FormEvent) { event.preventDefault(); if (title.trim().length >= 2) save.mutate(); }
  return <div className="min-h-screen"><SiteHeader /><main className="mx-auto max-w-5xl px-4 py-10">
    <div className="mb-8 flex items-center gap-3"><BookPlus className="h-8 w-8 text-primary" /><h1 className="font-display text-3xl font-bold">Pedidos de obras</h1></div>
    <div className="grid gap-10 md:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
      <form onSubmit={submit} className="space-y-4"><h2 className="font-display text-xl font-semibold">Solicitar uma obra</h2>
        <div><label htmlFor="request-title" className="mb-2 block text-sm">Nome da obra</label><Input id="request-title" required minLength={2} maxLength={200} value={title} onChange={(event) => setTitle(event.target.value)} /></div>
        <div><label htmlFor="request-kind" className="mb-2 block text-sm">Tipo</label><select id="request-kind" value={kind} onChange={(event) => setKind(event.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">{KINDS.map((item) => <option key={item}>{item}</option>)}</select></div>
        <div><label htmlFor="request-notes" className="mb-2 block text-sm">Detalhes (opcional)</label><Textarea id="request-notes" maxLength={2000} value={notes} onChange={(event) => setNotes(event.target.value)} rows={4} /></div>
        <Button type="submit" disabled={save.isPending || title.trim().length < 2}><Send className="h-4 w-4" />{save.isPending ? "Procurando a obra…" : "Enviar pedido"}</Button>
      </form>
      <section><h2 className="mb-4 font-display text-xl font-semibold">Meus pedidos</h2>{query.isPending ? <p className="text-muted-foreground">Carregando…</p> : query.isError ? <p role="alert" className="text-destructive">Não foi possível carregar seus pedidos.</p> : !query.data?.length ? <p className="text-sm text-muted-foreground">Você ainda não enviou pedidos.</p> : <div className="divide-y divide-border">{query.data.map((item) => <article key={item.id} className="py-5"><div className="flex flex-wrap justify-between gap-2"><h3 className="font-semibold">{item.title}</h3><span className="text-sm text-primary">{REQUEST_STATUS[item.status as keyof typeof REQUEST_STATUS]}</span></div><p className="mt-1 text-xs text-muted-foreground">{item.kind} · {new Date(item.created_at).toLocaleDateString("pt-BR")}</p>{item.admin_note ? <p className="mt-3 text-sm text-muted-foreground">{item.admin_note}</p> : null}{item.series ? <Button asChild variant="outline" size="sm" className="mt-3"><Link to="/obra/$slug" params={{ slug: item.series.slug }}>Ver obra</Link></Button> : null}</article>)}</div>}</section>
    </div>
  </main><SiteFooter /></div>;
}