import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { createIngestToken } from "@/lib/mediocre-ingest.functions";

/** "Importar pelo meu aparelho": the admin's device fetches MediocreScan and uploads drafts here. */
export function DeviceIngest() {
  const create = useServerFn(createIngestToken);
  const [code, setCode] = useState<string | null>(null);
  const list = useQuery({
    queryKey: ["mediocre-ingest-tokens"],
    queryFn: async () => (await supabase.from("mediocre_ingest_tokens").select("id, created_at, expires_at, revoked_at, last_used_at, works_received, chapters_added, errors").order("created_at", { ascending: false }).limit(5)).data ?? [],
    refetchInterval: 15_000,
  });
  const m = useMutation({ mutationFn: () => create(), onSuccess: (r) => { setCode(r.token); void list.refetch(); }, onError: (e) => toast.error(e.message) });
  const revoke = useMutation({
    mutationFn: async (id: string) => { await supabase.from("mediocre_ingest_tokens").update({ revoked_at: new Date().toISOString() }).eq("id", id); },
    onSuccess: () => void list.refetch(),
  });
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const cmd = code ? `SITE=${origin} CODIGO_ENVIO=${code} MEDIOCRE_TOKEN=SUA_CHAVE node mediocre-puxar.mjs --buscar "nome da obra"` : "";
  return (
    <section className="grid gap-3 rounded-lg border p-4">
      <div>
        <h2 className="font-semibold">Importar pelo meu aparelho</h2>
        <p className="text-sm text-muted-foreground">Funciona mesmo com o servidor bloqueado: seu computador (ou celular com Termux e Node) busca na MediocreScan e envia para cá. Sua chave fica só no aparelho; as obras chegam como rascunho.</p>
      </div>
      <ol className="list-decimal pl-5 text-sm grid gap-1">
        <li><a className="underline" href="/downloads/mediocre-puxar.mjs" download>Baixe o programa auxiliar</a> e instale o Node.js.</li>
        <li>Gere um código de envio (vale 24 h).</li>
        <li>Rode o comando no mesmo diretório trocando SUA_CHAVE pela sua chave. Depois use os IDs: <code>node mediocre-puxar.mjs 123 456</code>.</li>
      </ol>
      <Button size="sm" className="w-fit" disabled={m.isPending} onClick={() => m.mutate()}>{m.isPending ? "Gerando…" : "Gerar código de envio"}</Button>
      {code && (
        <div className="grid gap-1">
          <p className="text-xs text-muted-foreground">Copie agora; o código não será mostrado de novo.</p>
          <div className="flex gap-2">
            <code className="flex-1 break-all rounded bg-muted p-2 text-xs">{cmd}</code>
            <Button size="icon" variant="outline" aria-label="Copiar comando" onClick={() => { void navigator.clipboard.writeText(cmd); toast.success("Copiado."); }}><Copy className="h-4 w-4" /></Button>
          </div>
        </div>
      )}
      {!!list.data?.length && (
        <ul className="grid gap-1 text-xs">
          {list.data.map((t) => {
            const active = !t.revoked_at && new Date(t.expires_at).getTime() > Date.now();
            return (
              <li key={t.id} className="flex flex-wrap items-center gap-2 rounded border p-2">
                <span>{new Date(t.created_at).toLocaleString("pt-BR")}</span>
                <span>· {t.works_received} obras · {t.chapters_added} capítulos · {t.errors} erros</span>
                <span className="text-muted-foreground">{active ? "ativo" : t.revoked_at ? "revogado" : "expirado"}</span>
                {active && <Button size="sm" variant="ghost" onClick={() => revoke.mutate(t.id)}>Revogar</Button>}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
