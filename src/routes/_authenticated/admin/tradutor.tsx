import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Copy, ExternalLink, Languages } from "lucide-react";
import { AdminShell } from "@/components/AdminShell";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { coverUrl, timeAgo } from "@/lib/media";

export const Route = createFileRoute("/_authenticated/admin/tradutor")({
  staticData: { sitemap: false },
  head: () => ({
    meta: [
      { title: "Tradutor de Obras — Painel Better Mangá" },
      { name: "description", content: "Ligue o Tradutor de Obras para receber obras e capítulos traduzidos." },
      { property: "og:title", content: "Tradutor de Obras — Better Mangá" },
      { property: "og:description", content: "Ligação com o Tradutor de Obras." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TradutorPage,
});

/** Site de tradução do administrador; recebe o código de ligação no endereço (#/conexao/CODIGO). */
const TRADUTOR = "https://sakueaffsakura-sys.github.io/tradutor-de-obras/";

type Codigo = { id: string; created_at: string; revoked_at: string | null; last_used_at: string | null; works_received: number; chapters_added: number; errors: number };
type Obra = { id: string; slug: string; title: string; cover_url: string | null; published: boolean; chapter_count_total: number; updated_at: string };

// tradutor_codigos, series.source_tradutor_id e as RPCs vêm da migration 0067 (podem não estar nos tipos gerados).
const db = supabase as unknown as SupabaseClient;

function TradutorPage() {
  const qc = useQueryClient();
  const [code, setCode] = useState<string | null>(null);
  const codes = useQuery({
    queryKey: ["tradutor-codigos"],
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data, error } = await db.from("tradutor_codigos").select("id, created_at, revoked_at, last_used_at, works_received, chapters_added, errors").order("created_at", { ascending: false }).limit(10);
      if (error) throw error;
      return (data ?? []) as Codigo[];
    },
  });
  const works = useQuery({
    queryKey: ["tradutor-obras"],
    queryFn: async () => {
      const { data, error } = await db.from("series").select("id, slug, title, cover_url, published, chapter_count_total, updated_at").not("source_tradutor_id", "is", null).order("updated_at", { ascending: false }).limit(40);
      if (error) throw error;
      return (data ?? []) as Obra[];
    },
  });
  const create = useMutation({
    mutationFn: async () => {
      const { data, error } = await db.rpc("tradutor_gerar_codigo");
      if (error) throw new Error(error.message);
      return String(data);
    },
    onSuccess: (c) => { setCode(c); void qc.invalidateQueries({ queryKey: ["tradutor-codigos"] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const revoke = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from("tradutor_codigos").update({ revoked_at: new Date().toISOString() }).eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => { toast.success("Ligação desfeita."); void qc.invalidateQueries({ queryKey: ["tradutor-codigos"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const active = (codes.data ?? []).filter((c) => !c.revoked_at);
  const lastUse = active.map((c) => c.last_used_at).filter((v): v is string => Boolean(v)).sort().pop() ?? null;
  const status = active.length ? (lastUse ? "Ligado" : "Esperando o Tradutor confirmar") : "Desligado";
  const link = code ? `${TRADUTOR}#/conexao/${code}` : "";

  return (
    <AdminShell adminOnly title="Tradutor de Obras" subtitle="Obras e capítulos traduzidos chegam do Tradutor de Obras">
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="grid content-start gap-3 rounded-lg border border-border bg-surface p-5">
          <h2 className="flex items-center gap-2 font-semibold"><Languages className="h-4 w-4 text-primary" />{status}</h2>
          <p className="text-sm text-muted-foreground">No Tradutor, cada obra tem o botão "Enviar ao Better Mangá": a obra entra aqui (ou é juntada com uma que já existe) e os capítulos chegam publicados ou como rascunho. As páginas ficam no armazenamento do Tradutor; aqui ficam só os links.{lastUse ? ` Último envio: ${new Date(lastUse).toLocaleString("pt-BR")}.` : ""}</p>
          <Button className="w-fit" disabled={create.isPending} onClick={() => create.mutate()}>{create.isPending ? "Gerando…" : active.length ? "Ligar de novo (código novo)" : "Ligar ao Tradutor"}</Button>
          {code ? (
            <div className="grid gap-2">
              <Button asChild className="w-fit"><a href={link} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-4 w-4" /> Abrir o Tradutor e confirmar</a></Button>
              <p className="text-xs text-muted-foreground">Ou copie o código e cole no Tradutor, em Conexões → Seu site Better Mangá. Ele não aparece de novo.</p>
              <div className="flex gap-2">
                <code className="flex-1 break-all rounded bg-muted p-2 text-xs">{code}</code>
                <Button size="icon" variant="outline" aria-label="Copiar código" onClick={() => { void navigator.clipboard.writeText(code); toast.success("Copiado."); }}><Copy className="h-4 w-4" /></Button>
              </div>
            </div>
          ) : null}
          {(codes.data ?? []).length ? (
            <ul className="grid gap-1 text-xs">
              {(codes.data ?? []).map((t) => (
                <li key={t.id} className="flex flex-wrap items-center gap-2 rounded border border-border p-2">
                  <span className="font-medium">{new Date(t.created_at).toLocaleString("pt-BR")}</span>
                  <span>· {t.works_received} obras · {t.chapters_added} capítulos · {t.errors} erros</span>
                  {t.last_used_at ? <span className="text-muted-foreground">· último uso {new Date(t.last_used_at).toLocaleString("pt-BR")}</span> : null}
                  <span className="text-muted-foreground">{t.revoked_at ? "desligado" : "ativo"}</span>
                  {!t.revoked_at ? <Button size="sm" variant="ghost" disabled={revoke.isPending} onClick={() => revoke.mutate(t.id)}>Desligar</Button> : null}
                </li>
              ))}
            </ul>
          ) : null}
        </section>

        <section className="grid content-start gap-3 rounded-lg border border-border bg-surface p-5">
          <h2 className="font-semibold">Obras recebidas ({works.data?.length ?? 0})</h2>
          {works.isPending ? <p className="text-sm text-muted-foreground">Carregando…</p> : null}
          {works.data && !works.data.length ? <p className="text-sm text-muted-foreground">Nenhuma ainda.</p> : null}
          {(works.data ?? []).map((w) => (
            <div key={w.id} className="flex min-w-0 items-center gap-3 border-b border-border pb-3">
              <img src={coverUrl(w.cover_url)} alt={w.title} loading="lazy" decoding="async" className="h-14 w-10 shrink-0 rounded object-cover" />
              <div className="min-w-0 flex-1">
                <Link to="/admin/$id" params={{ id: w.id }} className="line-clamp-1 text-sm font-semibold hover:text-primary">{w.title}</Link>
                <p className="text-xs text-muted-foreground">{w.chapter_count_total} capítulo(s) · {w.published ? "Publicada" : "Rascunho"} · {timeAgo(w.updated_at)}</p>
              </div>
              <Button asChild size="sm" variant="ghost"><Link to="/obra/$slug" params={{ slug: w.slug }}>Ver</Link></Button>
            </div>
          ))}
        </section>
      </div>
    </AdminShell>
  );
}
