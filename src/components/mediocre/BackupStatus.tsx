import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getBackupStatus } from "@/lib/emergency.functions";

/** Shows when the emergency copy on GitHub was last saved. */
export function BackupStatus() {
  const fetchStatus = useServerFn(getBackupStatus);
  const { data, isError } = useQuery({ queryKey: ["backup-status"], queryFn: () => fetchStatus(), staleTime: 60_000 });
  return (
    <section className="rounded-md border border-border bg-surface p-4">
      <h2 className="text-base font-semibold">Cópia de emergência</h2>
      <p className="mt-1 min-h-5 text-sm text-muted-foreground">
        {isError ? "Não foi possível ler a cópia agora."
          : !data ? "Carregando…"
          : !data.configured ? "Ainda não ligada: falta salvar o endereço da cópia no site."
          : data.generated_at ? `Última cópia: ${new Date(data.generated_at).toLocaleString("pt-BR")} · ${data.works} obras · ${data.chapters} capítulos.`
          : "Esperando a primeira cópia da automação no GitHub."}
      </p>
    </section>
  );
}
