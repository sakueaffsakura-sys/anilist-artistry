import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { createIngestToken } from "@/lib/mediocre-ingest.functions";

type Code = { value: string; longLived: boolean };

/** Codes valid for more than 2 days were made for the GitHub automation. */
const isAutomation = (t: { created_at: string; expires_at: string }) =>
  new Date(t.expires_at).getTime() - new Date(t.created_at).getTime() > 2 * 86_400_000;

function CopyBox({ text, label }: { text: string; label: string }) {
  return (
    <div className="flex gap-2">
      <code className="flex-1 break-all rounded bg-muted p-2 text-xs">{text}</code>
      <Button size="icon" variant="outline" aria-label={label} onClick={() => { void navigator.clipboard.writeText(text); toast.success("Copiado."); }}><Copy className="h-4 w-4" /></Button>
    </div>
  );
}

/**
 * Two ways around the server IP block: the GitHub Actions automation (runs on GitHub's servers on a
 * schedule) and "Importar pelo meu aparelho" (the admin's own device). Both send to /api/public/mediocre-ingest.
 */
export function DeviceIngest() {
  const create = useServerFn(createIngestToken);
  const [code, setCode] = useState<Code | null>(null);
  const list = useQuery({
    queryKey: ["mediocre-ingest-tokens"],
    queryFn: async () => (await supabase.from("mediocre_ingest_tokens").select("id, created_at, expires_at, revoked_at, last_used_at, works_received, chapters_added, errors").order("created_at", { ascending: false }).limit(8)).data ?? [],
    refetchInterval: 15_000,
  });
  const m = useMutation({
    mutationFn: (longLived: boolean) => create({ data: { longLived } }),
    onSuccess: (r, longLived) => { setCode({ value: r.token, longLived }); void list.refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const revoke = useMutation({
    mutationFn: async (id: string) => { await supabase.from("mediocre_ingest_tokens").update({ revoked_at: new Date().toISOString() }).eq("id", id); },
    onSuccess: () => void list.refetch(),
  });
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const cmd = code && !code.longLived ? `SITE=${origin} CODIGO_ENVIO=${code.value} MEDIOCRE_TOKEN=SUA_CHAVE node mediocre-puxar.mjs --buscar "nome da obra"` : "";
  const auto = (list.data ?? []).filter((t) => isAutomation(t) && !t.revoked_at && new Date(t.expires_at).getTime() > Date.now());
  const lastRun = auto.map((t) => t.last_used_at).filter((v): v is string => Boolean(v)).sort().pop() ?? null;

  return (
    <section className="grid gap-5 rounded-lg border p-4">
      <div className="grid gap-3">
        <div>
          <h2 className="font-semibold">Automação pelo GitHub {auto.length ? "· ativa" : "· desligada"}</h2>
          <p className="text-sm text-muted-foreground">Os servidores do GitHub buscam na MediocreScan (de outro IP, que não está bloqueado) e enviam para cá sozinhos, a cada hora: a fila de publicação, as obras novas que ainda não foram enviadas e os capítulos novos das obras já publicadas. Uma obra por vez, até o fim, 2 capítulos a cada 20 segundos; se a MediocreScan travar, pausa 1 minuto e continua.{lastRun ? ` Último envio: ${new Date(lastRun).toLocaleString("pt-BR")}.` : ""}</p>
        </div>
        <ol className="list-decimal grid gap-1 pl-5 text-sm">
          <li>Clique em "Gerar código da automação" e copie o código.</li>
          <li>No GitHub, abra o repositório → Settings → Secrets and variables → Actions → New repository secret e crie:
            <ul className="list-disc pl-5">
              <li><code>CODIGO_ENVIO</code> = o código gerado aqui</li>
              <li><code>MEDIOCRE_TOKEN</code> = sua chave da MediocreScan</li>
              <li><code>SITE</code> = <code>{origin || "https://bettermanga.net"}</code></li>
            </ul>
          </li>
          <li>Em Actions → "MediocreScan automação" → Run workflow para testar na hora (dá para informar IDs de obras).</li>
        </ol>
        <Button size="sm" className="w-fit" disabled={m.isPending} onClick={() => m.mutate(true)}>{m.isPending && m.variables === true ? "Gerando…" : "Gerar código da automação (1 ano)"}</Button>
        {code?.longLived && (
          <div className="grid gap-1">
            <p className="text-xs text-muted-foreground">Copie agora; o código não será mostrado de novo. Para desligar a automação, revogue o código abaixo.</p>
            <CopyBox text={code.value} label="Copiar código" />
          </div>
        )}
      </div>

      <div className="grid gap-3 border-t pt-4">
        <div>
          <h2 className="font-semibold">Importar pelo meu aparelho</h2>
          <p className="text-sm text-muted-foreground">Seu computador (ou celular com Termux e Node) busca na MediocreScan e envia para cá. Sua chave fica só no aparelho; as obras chegam como rascunho.</p>
        </div>
        <ol className="list-decimal grid gap-1 pl-5 text-sm">
          <li><a className="underline" href="/downloads/mediocre-puxar.mjs" download>Baixe o programa auxiliar</a> e instale o Node.js.</li>
          <li>Gere um código de envio (vale 24 h).</li>
          <li>Rode o comando no mesmo diretório trocando SUA_CHAVE pela sua chave. Depois use os IDs: <code>node mediocre-puxar.mjs 123 456</code>.</li>
        </ol>
        <Button size="sm" variant="outline" className="w-fit" disabled={m.isPending} onClick={() => m.mutate(false)}>{m.isPending && m.variables === false ? "Gerando…" : "Gerar código de envio (24 h)"}</Button>
        {code && !code.longLived && (
          <div className="grid gap-1">
            <p className="text-xs text-muted-foreground">Copie agora; o código não será mostrado de novo.</p>
            <CopyBox text={cmd} label="Copiar comando" />
          </div>
        )}
      </div>

      {!!list.data?.length && (
        <ul className="grid gap-1 text-xs">
          {list.data.map((t) => {
            const active = !t.revoked_at && new Date(t.expires_at).getTime() > Date.now();
            return (
              <li key={t.id} className="flex flex-wrap items-center gap-2 rounded border p-2">
                <span className="font-medium">{isAutomation(t) ? "Automação" : "Aparelho"}</span>
                <span>{new Date(t.created_at).toLocaleString("pt-BR")}</span>
                <span>· {t.works_received} obras · {t.chapters_added} capítulos · {t.errors} erros</span>
                {t.last_used_at && <span className="text-muted-foreground">· último uso {new Date(t.last_used_at).toLocaleString("pt-BR")}</span>}
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
