import { useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye, EyeOff, Link2, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { AdminShell } from "@/components/AdminShell";
import { FramedAvatar } from "@/components/FramedAvatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/admin/molduras")({
  staticData: { sitemap: false },
  head: () => ({ meta: [
    { title: "Molduras — Painel Better Mangá" },
    { name: "description", content: "Gerencie as molduras de perfil do Better Mangá." },
    { property: "og:title", content: "Molduras — Painel Better Mangá" },
    { property: "og:description", content: "Gestão das molduras de perfil do Better Mangá." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: FramesAdmin,
});

function FramesAdmin() {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const { data: frames } = useQuery({
    queryKey: ["admin-frames"],
    queryFn: async () => {
      const { data, error } = await supabase.from("avatar_frames").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["admin-frames"] });
    qc.invalidateQueries({ queryKey: ["avatar-frames"] });
  };

  const add = async (image_url: string, n?: string): Promise<void> => {
    const { error } = await supabase.from("avatar_frames").insert({ name: (n ?? name).trim() || "Moldura", image_url });
    if (error) { toast.error(error.message); return; }
    toast.success("Moldura adicionada!");
    setName(""); setUrl(""); refresh();
  };

  const upload = async (file: File) => {
    setBusy(true);
    try {
      const path = `frames/${crypto.randomUUID()}-${file.name.replace(/[^\w.-]/g, "_")}`;
      const { error } = await supabase.storage.from("manga").upload(path, file, { contentType: file.type });
      if (error) throw error;
      const { data, error: e2 } = await supabase.storage.from("manga").createSignedUrl(path, 60 * 60 * 24 * 365 * 10);
      if (e2 || !data) throw e2;
      await add(data.signedUrl, name || file.name.replace(/\.\w+$/, ""));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha no upload");
    } finally { setBusy(false); }
  };

  const toggle = useMutation({
    mutationFn: async (f: { id: string; active: boolean }) => {
      const { error } = await supabase.from("avatar_frames").update({ active: !f.active }).eq("id", f.id);
      if (error) throw error;
    },
    onSuccess: refresh,
  });
  const rename = async (id: string, n: string) => {
    { const { error: dbErr } = await supabase.from("avatar_frames").update({ name: n }).eq("id", id); if (dbErr) throw dbErr; }
    refresh();
  };
  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("avatar_frames").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Removida"); refresh(); },
  });

  return (
    <AdminShell adminOnly title="Molduras" subtitle="Disponibilize molduras para os perfis — GIF, APNG e WebP animados continuam animados.">
      <div className="rounded-lg border border-border bg-surface p-5">
        <div className="grid gap-3 md:grid-cols-[1fr_2fr_auto_auto]">
          <Input placeholder="Nome da moldura" value={name} onChange={(e) => setName(e.target.value)} />
          <Input placeholder="Link da imagem (https://...png / .gif / .webp)" value={url} onChange={(e) => setUrl(e.target.value)} />
          <Button disabled={!/^https?:\/\//.test(url)} onClick={() => add(url.trim())}><Link2 className="mr-1 h-4 w-4" />Adicionar link</Button>
          <Button variant="outline" disabled={busy} onClick={() => fileRef.current?.click()}><Upload className="mr-1 h-4 w-4" />{busy ? "Enviando…" : "Enviar arquivo"}</Button>
          <input ref={fileRef} type="file" accept="image/png,image/gif,image/webp,image/apng" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); e.target.value = ""; }} />
        </div>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {(frames ?? []).map((f) => (
          <div key={f.id} className={`rounded-lg border border-border bg-surface p-4 ${f.active ? "" : "opacity-50"}`}>
            <div className="grid place-items-center py-3"><FramedAvatar frame={f.image_url} size={90} /></div>
            <Input defaultValue={f.name} className="mt-2 h-8 text-xs" onBlur={(e) => e.target.value !== f.name && rename(f.id, e.target.value)} />
            <div className="mt-2 flex gap-2">
              <Button size="sm" variant="outline" className="flex-1" onClick={() => toggle.mutate(f)}>
                {f.active ? <><Eye className="mr-1 h-3.5 w-3.5" />Ativa</> : <><EyeOff className="mr-1 h-3.5 w-3.5" />Oculta</>}
              </Button>
              <Button size="sm" variant="destructive" onClick={() => confirm("Excluir moldura?") && remove.mutate(f.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
            </div>
          </div>
        ))}
      </div>
    </AdminShell>
  );
}
