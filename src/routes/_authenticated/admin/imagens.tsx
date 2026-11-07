import { useEffect, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Cloud, Copy, HardDrive, KeyRound, Upload } from "lucide-react";
import { toast } from "sonner";
import { AdminShell } from "@/components/AdminShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { getMediaSettings, saveMediaSettings, signCloudinaryUpload } from "@/lib/media.functions";

export const Route = createFileRoute("/_authenticated/admin/imagens")({
  staticData: { sitemap: false },
  head: () => ({ meta: [
    { title: "Imagens — Painel Better Mangá" },
    { name: "description", content: "Guarde imagens no site ou no Cloudinary e copie os links." },
    { property: "og:title", content: "Imagens — Painel Better Mangá" },
    { property: "og:description", content: "Armazenamento de imagens do painel." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: ImagesAdmin,
});

type Dest = "site" | "cloudinary";

function ImagesAdmin() {
  const getS = useServerFn(getMediaSettings);
  const saveS = useServerFn(saveMediaSettings);
  const sign = useServerFn(signCloudinaryUpload);
  const [dest, setDest] = useState<Dest>("site");
  const [cfg, setCfg] = useState({ cloud_name: "", api_key: "", api_secret: "", folder: "bettermanga" });
  const [hasSecret, setHasSecret] = useState(false);
  const [links, setLinks] = useState<string[]>([]);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getS().then((s) => { setCfg((c) => ({ ...c, cloud_name: s.cloud_name, api_key: s.api_key, folder: s.folder })); setHasSecret(s.hasSecret); }).catch(() => {});
  }, [getS]);

  const save = async () => {
    try { await saveS({ data: cfg }); if (cfg.api_secret) setHasSecret(true); setCfg((c) => ({ ...c, api_secret: "" })); toast.success("Chaves salvas"); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Erro"); }
  };

  const uploadAll = async (files: File[]) => {
    if (!files.length) return;
    const out: string[] = [];
    setProgress({ done: 0, total: files.length });
    try {
      const sig = dest === "cloudinary" ? await sign() : null;
      for (const file of files) {
        try {
          if (sig) {
            const fd = new FormData();
            fd.append("file", file); fd.append("api_key", sig.api_key); fd.append("timestamp", String(sig.timestamp));
            fd.append("signature", sig.signature); fd.append("folder", sig.folder);
            const r = await fetch(`https://api.cloudinary.com/v1_1/${sig.cloud_name}/image/upload`, { method: "POST", body: fd });
            const j = await r.json();
            if (!r.ok) throw new Error(j?.error?.message ?? `HTTP ${r.status}`);
            out.push(j.secure_url);
          } else {
            const path = `library/${crypto.randomUUID()}-${file.name.replace(/[^\w.-]/g, "_")}`;
            const { error } = await supabase.storage.from("manga").upload(path, file, { contentType: file.type });
            if (error) throw error;
            const { data, error: e2 } = await supabase.storage.from("manga").createSignedUrl(path, 60 * 60 * 24 * 365 * 10);
            if (e2 || !data) throw e2;
            out.push(data.signedUrl);
          }
        } catch (e) { toast.error(`${file.name}: ${e instanceof Error ? e.message : "falhou"}`); }
        setProgress((p) => p && { ...p, done: p.done + 1 });
      }
      setLinks(out);
      toast.success(`${out.length} imagem(ns) guardada(s)`);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Erro"); }
    finally { setProgress(null); }
  };

  const copyAll = () => { navigator.clipboard.writeText(links.join("\n")); toast.success("Links copiados"); };

  return (
    <AdminShell adminOnly title="Imagens" subtitle="Guarde imagens no próprio site ou no Cloudinary e pegue os links de todas.">
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-border bg-surface p-5">
          <h2 className="mb-3 flex items-center gap-2 font-semibold"><KeyRound className="h-4 w-4" />Chaves do Cloudinary</h2>
          <div className="grid gap-2">
            <Input placeholder="Cloud name" value={cfg.cloud_name} onChange={(e) => setCfg({ ...cfg, cloud_name: e.target.value })} />
            <Input placeholder="API Key" value={cfg.api_key} onChange={(e) => setCfg({ ...cfg, api_key: e.target.value })} />
            <Input type="password" placeholder={hasSecret ? "API Secret (salvo — preencha só para trocar)" : "API Secret"} value={cfg.api_secret} onChange={(e) => setCfg({ ...cfg, api_secret: e.target.value })} />
            <Input placeholder="Pasta" value={cfg.folder} onChange={(e) => setCfg({ ...cfg, folder: e.target.value })} />
            <Button onClick={save}>Salvar chaves</Button>
            <p className="text-xs text-muted-foreground">Encontre em console.cloudinary.com → Settings → API Keys. O secret fica guardado só no servidor.</p>
          </div>
        </div>
        <div className="rounded-lg border border-border bg-surface p-5">
          <h2 className="mb-3 font-semibold">Guardar imagens</h2>
          <div className="mb-3 flex gap-2">
            <Button variant={dest === "site" ? "default" : "outline"} onClick={() => setDest("site")}><HardDrive className="mr-1 h-4 w-4" />Próprio site</Button>
            <Button variant={dest === "cloudinary" ? "default" : "outline"} onClick={() => setDest("cloudinary")}><Cloud className="mr-1 h-4 w-4" />Cloudinary</Button>
          </div>
          <Button className="w-full" disabled={!!progress} onClick={() => fileRef.current?.click()}>
            <Upload className="mr-1 h-4 w-4" />{progress ? `Enviando ${progress.done}/${progress.total}…` : "Selecionar imagens"}
          </Button>
          <input ref={fileRef} type="file" multiple accept="image/*" hidden onChange={(e) => { void uploadAll([...(e.target.files ?? [])]); e.target.value = ""; }} />
        </div>
      </div>
      {links.length > 0 && (
        <div className="mt-6 rounded-lg border border-border bg-surface p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold">Links das imagens guardadas ({links.length})</h2>
            <Button size="sm" onClick={copyAll}><Copy className="mr-1 h-4 w-4" />Copiar todos</Button>
          </div>
          <textarea readOnly className="h-48 w-full rounded-lg border border-border bg-background p-3 font-mono text-xs" value={links.join("\n")} />
          <div className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-8">
            {links.map((l) => <img key={l} src={l} alt="" className="aspect-square w-full rounded object-cover" />)}
          </div>
        </div>
      )}
    </AdminShell>
  );
}
