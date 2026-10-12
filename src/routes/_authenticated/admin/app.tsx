import { useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Eye, EyeOff, Upload } from "lucide-react";
import { toast } from "sonner";
import { AdminShell } from "@/components/AdminShell";
import { AppMinimumEditor } from "@/components/AppMinimumEditor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { useRoles, useSession } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { appReleaseSchema, validateApk } from "@/lib/app-versions";
import { uploadApk } from "@/lib/apk-upload";

export const Route = createFileRoute("/_authenticated/admin/app")({
  staticData: { sitemap: false },
  head: () => ({ meta: [
    { title: "Versões Android — Painel Better Mangá" },
    { name: "description", content: "Envie APKs e gerencie as atualizações do Better Mangá." },
    { property: "og:title", content: "Versões Android — Painel Better Mangá" },
    { property: "og:description", content: "Gestão de versões e atualizações do aplicativo." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }), component: AppAdmin,
});

function AppAdmin() {
  const { user } = useSession();
  const { isAdmin } = useRoles(user?.id);
  const qc = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [version, setVersion] = useState("");
  const [code, setCode] = useState("");
  const [minimum, setMinimum] = useState("");
  const [notes, setNotes] = useState("");
  const [required, setRequired] = useState(true);
  const [progress, setProgress] = useState(0);
  const [uploadedPath, setUploadedPath] = useState<string | null>(null);
  const endpoint = useQuery({ queryKey: ["admin-app-version-status"], enabled: isAdmin, retry: false, queryFn: async () => {
    const response = await fetch("/api/public/version", { cache: "no-store" });
    if (!response.ok) throw new Error(response.status === 503
      ? "Atualização indisponível: a URL do APK não pôde ser gerada (503)"
      : `Atualização indisponível: a consulta falhou (${response.status})`);
    return response.json() as Promise<{ latest_apk_version: number }>;
  } });
  const releases = useQuery({ queryKey: ["admin-app-releases"], enabled: isAdmin, queryFn: async () => {
    const { data, error } = await supabase.from("app_releases").select("*").order("version_code", { ascending: false });
    if (error) throw error; return data;
  } });
  const save = useMutation({ mutationFn: async () => {
    if (!isAdmin || !file) throw new Error("Escolha um APK e confirme seu acesso administrativo.");
    validateApk(file);
    const result = appReleaseSchema.safeParse({ version_name: version, version_code: Number(code), minimum_version_code: required ? Number(code) : Number(minimum), notes, published: true });
    if (!result.success) throw new Error(result.error.issues[0]?.message ?? "Confira a versão informada.");
    const highest = releases.data?.[0]?.version_code ?? 0;
    if (result.data.version_code <= highest) throw new Error("Use um código maior que o das versões já enviadas.");
    const priorMinimum = Math.max(1, ...(releases.data ?? []).filter((r) => r.published).map((r) => r.minimum_version_code));
    if (result.data.minimum_version_code < priorMinimum) throw new Error("A versão mínima não pode liberar novamente versões já bloqueadas.");
    const path = uploadedPath ?? await uploadApk(file, setProgress);
    setUploadedPath(path);
    const { error } = await supabase.from("app_releases").insert({ ...result.data, apk_path: path });
    if (error) throw new Error("APK enviado, mas a versão não foi salva. Tente novamente sem reenviar o arquivo.");
  }, onSuccess: () => { setFile(null); setUploadedPath(null); setProgress(0); setVersion(""); setCode(""); setMinimum(""); setNotes(""); if (fileInput.current) fileInput.current.value = ""; void qc.invalidateQueries({ queryKey: ["admin-app-releases"] }); void qc.invalidateQueries({ queryKey: ["admin-app-version-status"] }); toast.success("Versão publicada."); }, onError: (error) => toast.error(error.message) });
  const toggle = useMutation({ mutationFn: async (row: { id: string; published: boolean }) => {
    const { data, error } = await supabase.from("app_releases").update({ published: !row.published }).eq("id", row.id).select("id");
    if (error || !data?.length) throw new Error("Não foi possível alterar a versão.");
  }, onSuccess: () => { void qc.invalidateQueries({ queryKey: ["admin-app-releases"] }); void qc.invalidateQueries({ queryKey: ["admin-app-version-status"] }); }, onError: (error) => toast.error(error.message) });
  async function download(path: string) {
    const { data, error } = await supabase.storage.from("app-releases").createSignedUrl(path, 3600);
    if (error || !data) { toast.error("Download indisponível."); return; }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }
  return <AdminShell title="Versões do app" subtitle="Android" adminOnly>
    <div role="status" className="mb-5 border-b border-border pb-4 text-sm">
      {endpoint.isPending ? <p className="text-muted-foreground">Verificando atualização…</p> : endpoint.isError
        ? <p className="text-destructive">{endpoint.error.message}</p>
        : <p className="text-primary">Atualização: OK{endpoint.data?.latest_apk_version === 0 ? " · Nenhum APK publicado; download ainda não validado." : ""}</p>}
      <Button type="button" variant="ghost" size="sm" disabled={endpoint.isFetching} onClick={() => void endpoint.refetch()}>Verificar novamente</Button>
    </div>
    <form onSubmit={(event) => { event.preventDefault(); save.mutate(); }} className="space-y-5 border-b border-border pb-6">
      <fieldset disabled={save.isPending || !isAdmin || releases.isPending || releases.isError} className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2"><Label htmlFor="version-name">Nome da versão</Label><Input id="version-name" placeholder="2.0.0" value={version} maxLength={40} onChange={(event) => setVersion(event.target.value)} required /></div>
        <div className="space-y-2"><Label htmlFor="version-code">Código da versão</Label><Input id="version-code" type="number" min={(releases.data?.[0]?.version_code ?? 0) + 1} step="1" value={code} onChange={(event) => setCode(event.target.value)} required /></div>
        <label className="flex items-center gap-2 sm:col-span-2"><Checkbox checked={required} onCheckedChange={(value) => setRequired(value === true)} disabled={save.isPending} />Exigir esta versão e bloquear as anteriores</label>
        {!required ? <div className="space-y-2"><Label htmlFor="minimum-version">Código mínimo aceito</Label><Input id="minimum-version" type="number" min="1" step="1" value={minimum} onChange={(event) => setMinimum(event.target.value)} required /></div> : null}
        <div className="space-y-2 sm:col-span-2"><Label htmlFor="release-notes">Novidades</Label><Textarea id="release-notes" value={notes} maxLength={5000} onChange={(event) => setNotes(event.target.value)} /></div>
        <div className="space-y-2 sm:col-span-2"><Label htmlFor="apk-file">Arquivo APK</Label><Input ref={fileInput} id="apk-file" type="file" accept=".apk" onChange={(event) => { setFile(event.target.files?.[0] ?? null); setUploadedPath(null); setProgress(0); }} /></div>
      </fieldset>
      {save.isPending ? <div><progress aria-label="Progresso do envio" value={progress} max={100} className="h-2 w-full accent-primary" /><p className="mt-2 text-sm text-muted-foreground">{progress}% · {progress === 100 ? "Salvando versão…" : "Enviando APK…"}</p></div> : null}
      <p className="break-words text-sm text-muted-foreground">Teste antes de publicar: abra /api/public/version?version_code=&lt;versão anterior&gt; e confirme update_required = true e apk_download_url preenchido.</p>
      <Button type="submit" disabled={save.isPending || !file || !isAdmin || releases.isPending || releases.isError}><Upload className="h-4 w-4" />{save.isPending ? "Enviando…" : "Publicar nova versão"}</Button>
    </form>
    {releases.isError ? <div className="py-6"><p className="text-destructive">Não foi possível carregar as versões.</p><Button variant="outline" onClick={() => void releases.refetch()}>Tentar novamente</Button></div> : null}
    {releases.isPending ? <p className="py-6 text-muted-foreground">Carregando…</p> : <div className="mt-6 overflow-hidden rounded-lg border border-border bg-surface">{(releases.data ?? []).map((row) => <div key={row.id} className="flex items-center gap-3 border-b border-border p-4 last:border-0"><div className="min-w-0 flex-1"><p className="break-words font-bold">{row.version_name} <span className="text-xs text-primary">{row.published ? "Publicada" : "Oculta"}</span></p><p className="text-xs text-muted-foreground">Código {row.version_code} · Mínimo {row.minimum_version_code}</p><p className="mt-2 whitespace-pre-wrap break-words text-sm text-muted-foreground">{row.notes}</p></div><AppMinimumEditor release={row} disabled={!isAdmin || toggle.isPending} /><Button variant="ghost" size="icon" title="Baixar APK" onClick={() => void download(row.apk_path)}><Download className="h-4 w-4" /></Button><Button variant="ghost" size="icon" title={row.published ? "Ocultar versão" : "Publicar versão"} disabled={toggle.isPending} onClick={() => toggle.mutate(row)}>{row.published ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}</Button></div>)}{releases.data?.length === 0 ? <p className="p-8 text-center text-muted-foreground">Nenhuma versão enviada.</p> : null}</div>}
  </AdminShell>;
}
