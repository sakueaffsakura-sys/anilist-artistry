import { useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Image, Film, Save, Upload, ExternalLink, X } from "lucide-react";
import { toast } from "sonner";
import { AdminShell } from "@/components/AdminShell";
import { MaintenanceScreen } from "@/components/MaintenanceScreen";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { getMaintenanceStatus, saveMaintenanceSettings } from "@/lib/maintenance.functions";
import { uploadMaintenanceMedia, maintenanceUploadError } from "@/lib/maintenance-upload";
import { validateMaintenanceMedia } from "@/lib/maintenance-media";

export const Route = createFileRoute("/_authenticated/admin/manutencao")({
  staticData: { sitemap: false },
  loader: () => getMaintenanceStatus(),
  head: () => ({ meta: [
    { title: "Manutenção — Painel Better Mangá" }, { name: "description", content: "Configure o aviso e o fundo da manutenção do Better Mangá." },
    { property: "og:title", content: "Manutenção — Painel Better Mangá" }, { property: "og:description", content: "Controle de manutenção do Better Mangá." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }), component: MaintenanceAdmin,
});

function MaintenanceAdmin() {
  const initial = Route.useLoaderData();
  const [form, setForm] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [fileName, setFileName] = useState("");
  const [uploadError, setUploadError] = useState("");
  const controller = useRef<AbortController | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const save = useServerFn(saveMaintenanceSettings);
  const upload = async (file: File) => {
    try { validateMaintenanceMedia(file); } catch (error) { toast.error(maintenanceUploadError(error)); return; }
    const abort = new AbortController();
    controller.current = abort;
    setBusy(true); setUploading(true); setProgress(0); setFileName(file.name); setUploadError("");
    try {
      const media = await uploadMaintenanceMedia(file, setProgress, abort.signal);
      setForm((f) => ({ ...f, ...media }));
      setProgress(100); toast.success("Fundo enviado. Salve para aplicar.");
    } catch (error) {
      if (abort.signal.aborted) toast.info("Envio cancelado. O fundo anterior foi mantido.");
      else { const message = maintenanceUploadError(error); setUploadError(message); toast.error(message); }
    }
    finally { setBusy(false); setUploading(false); controller.current = null; }
  };
  const submit = async () => {
    setBusy(true);
    try {
      await save({ data: { enabled: form.enabled, title: form.title, message: form.message,
        media_kind: form.media_kind === "video" ? "video" : "image", media_path: form.media_path } });
      toast.success(form.enabled ? "Manutenção ativada. Só administradores podem entrar." : "Configuração salva. Site aberto.");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Não foi possível salvar."); }
    finally { setBusy(false); }
  };
  return <AdminShell adminOnly title="Manutenção" subtitle="Um intervalo para o próximo capítulo." actions={<Button disabled={busy || !form.title.trim()} onClick={submit}><Save className="mr-2 h-4 w-4" />{busy ? "Aguarde…" : "Salvar alterações"}</Button>}>
    <div className="mb-8 flex items-center justify-between gap-4 border-y border-border py-5">
      <div><p className="font-bold">Modo de manutenção</p><p className="mt-1 text-sm text-muted-foreground">{form.enabled ? "Entrada reservada aos administradores" : "Site aberto aos leitores"}</p></div>
      <Switch aria-label="Ativar modo de manutenção" checked={form.enabled} disabled={busy} onCheckedChange={(enabled) => setForm((f) => ({ ...f, enabled }))} />
    </div>
    <div className="grid gap-8 xl:grid-cols-[minmax(240px,1fr)_minmax(0,1.5fr)]">
      <div className="space-y-6">
        <div className="space-y-2"><Label htmlFor="maintenance-title">Título do aviso</Label><Input id="maintenance-title" maxLength={160} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
        <div className="space-y-2"><Label htmlFor="maintenance-message">Sua mensagem</Label><Textarea id="maintenance-message" rows={5} maxLength={2000} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} /></div>
        <div className="space-y-3"><Label>Fundo da tela</Label><div className="flex gap-2">
          <Button disabled={busy} variant={form.media_kind === "image" ? "default" : "outline"} onClick={() => fileInput.current?.click()}><Image className="mr-2 h-4 w-4" />Imagem</Button>
          <Button disabled={busy} variant={form.media_kind === "video" ? "default" : "outline"} onClick={() => fileInput.current?.click()}><Film className="mr-2 h-4 w-4" />Vídeo MP4</Button>
        </div>
        <Button variant="outline" className="w-full" disabled={busy} onClick={() => fileInput.current?.click()}><Upload className="mr-2 h-4 w-4" />Enviar fundo</Button>
        <input ref={fileInput} hidden type="file" accept=".mp4,.jpg,.jpeg,.png,.webp,video/mp4,image/jpeg,image/png,image/webp" onChange={(e) => { const file = e.target.files?.[0]; if (file) void upload(file); e.target.value = ""; }} />
        {uploading ? <div className="space-y-2" role="status"><div className="flex min-w-0 items-center gap-3"><span className="min-w-0 flex-1 truncate text-sm">{fileName}</span><span className="text-sm tabular-nums text-primary">{progress}%</span><Button variant="ghost" size="icon" aria-label="Cancelar envio" onClick={() => controller.current?.abort()}><X className="h-4 w-4" /></Button></div><progress aria-label="Progresso do envio" className="h-1 w-full accent-primary" value={progress} max={100} /></div> : null}
        {uploadError ? <p role="alert" className="text-sm text-destructive">{uploadError}</p> : null}
        <p className="text-xs text-muted-foreground">MP4 até 1 GB · Imagens até 1 GB. O navegador pode exigir um toque para liberar o áudio.</p>
        </div>
        <Button asChild variant="ghost"><a href="/manutencao" target="_blank" rel="noreferrer"><ExternalLink className="mr-2 h-4 w-4" />Abrir tela de manutenção</a></Button>
      </div>
      <div className="min-w-0"><p className="mb-3 text-xs font-bold uppercase text-muted-foreground">Prévia</p><MaintenanceScreen settings={form} preview /></div>
    </div>
  </AdminShell>;
}