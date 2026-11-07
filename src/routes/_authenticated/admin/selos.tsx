import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Lock, Trash2, Unlock, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { AdminShell } from "@/components/AdminShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/admin/selos")({
  staticData: { sitemap: false },
  head: () => ({ meta: [
    { title: "Selos de evento — Better Mangá" },
    { name: "description", content: "Gerencie eventos de selos e entregas para leitores." },
    { property: "og:title", content: "Selos de evento — Better Mangá" },
    { property: "og:description", content: "Gestão de eventos e selos dos leitores." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: BadgesAdmin,
});

function BadgesAdmin() {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [url, setUrl] = useState("");
  const [days, setDays] = useState("7");
  const [chapters, setChapters] = useState("0");
  const [busy, setBusy] = useState(false);
  const upload = async (file: File) => {
    setBusy(true);
    try {
      const path = `badges/${crypto.randomUUID()}-${file.name.replace(/[^\w.-]/g, "_")}`;
      const { error } = await supabase.storage.from("manga").upload(path, file, { contentType: file.type });
      if (error) throw error;
      const { data, error: e2 } = await supabase.storage.from("manga").createSignedUrl(path, 60 * 60 * 24 * 365 * 10);
      if (e2 || !data) throw e2;
      setUrl(data.signedUrl);
      if (!name) setName(file.name.replace(/\.\w+$/, ""));
      toast.success("Imagem enviada");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Falha no upload"); } finally { setBusy(false); }
  };
  const [grant, setGrant] = useState<Record<string, string>>({});

  const { data: events } = useQuery({
    queryKey: ["admin-badge-events"],
    queryFn: async () => {
      const { data, error } = await supabase.from("badge_events").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      const { data: owners } = await supabase.from("profile_badges").select("event_id").not("event_id", "is", null);
      const counts = new Map<string, number>();
      for (const o of owners ?? []) counts.set(o.event_id!, (counts.get(o.event_id!) ?? 0) + 1);
      return data.map((e) => ({ ...e, owners: counts.get(e.id) ?? 0 }));
    },
  });
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["admin-badge-events"] });
    qc.invalidateQueries({ queryKey: ["badge-events-active"] });
  };

  const create = useMutation({
    mutationFn: async () => {
      if (!name.trim() || !url.trim()) throw new Error("Informe nome e imagem");
      const { error } = await supabase.from("badge_events").insert({ name: name.trim(), description: desc.trim() || null, image_url: url.trim(),
        required_chapters: Math.max(0, parseInt(chapters) || 0),
        ends_at: Number(days) > 0 ? new Date(Date.now() + Number(days) * 86400000).toISOString() : null });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Evento criado e aberto!"); setName(""); setDesc(""); setUrl(""); setChapters("0"); setDays("7"); refresh(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });
  const toggle = useMutation({
    mutationFn: async (e: { id: string; active: boolean }) => {
      const { error } = await supabase.from("badge_events").update({ active: e.active }).eq("id", e.id);
      if (error) throw error;
    },
    onSuccess: (_d, v) => { toast.success(v.active ? "Evento reaberto" : "Evento encerrado — ninguém mais pode pegar"); refresh(); },
  });
  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("badge_events").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Selo excluído (removido de todos)"); refresh(); },
  });
  const give = useMutation({
    mutationFn: async (ev: { id: string; name: string; image_url: string }) => {
      const username = (grant[ev.id] ?? "").trim();
      const { data: p } = await supabase.from("profiles").select("id").ilike("username", username).maybeSingle();
      if (!p) throw new Error("Usuário não encontrado");
      const { error } = await supabase.from("profile_badges").insert({ user_id: p.id, name: ev.name, image_url: ev.image_url, event_id: ev.id, position: 0 });
      if (error) throw new Error(error.code === "23505" ? "Usuário já tem esse selo" : error.message);
    },
    onSuccess: (_d, v) => { toast.success("Selo entregue!"); setGrant((g) => ({ ...g, [v.id]: "" })); refresh(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });

  return (
    <AdminShell title="Selos de evento" subtitle="Crie selos, abra/encerre eventos e entregue selos a usuários." adminOnly>
      <div className="mb-6 grid gap-3 rounded-lg border border-border bg-card p-4 md:grid-cols-2">
        <label className="text-sm">Nome<Input placeholder="ex: NATAL 2026" value={name} onChange={(e) => setName(e.target.value)} /></label>
        <label className="text-sm">Descrição (opcional)<Input value={desc} onChange={(e) => setDesc(e.target.value)} /></label>
        <label className="text-sm">Imagem do selo (link)<Input placeholder="https://..." value={url} onChange={(e) => setUrl(e.target.value)} /></label>
        <label className="text-sm">Ou enviar arquivo<Input type="file" accept="image/*" disabled={busy} onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} /></label>
        <label className="text-sm">Duração do evento (dias, 0 = sem fim)<Input type="number" min={0} value={days} onChange={(e) => setDays(e.target.value)} /></label>
        <label className="text-sm">Capítulos que precisa ler<Input type="number" min={0} value={chapters} onChange={(e) => setChapters(e.target.value)} /></label>
        <div className="flex items-center gap-3 md:col-span-2">
          {url ? <img src={url} alt="prévia" className="h-12 w-12 object-contain" /> : null}
          <Button onClick={() => create.mutate()} disabled={create.isPending || busy}>Criar evento</Button>
        </div>
      </div>
      <div className="grid gap-3">
        {(events ?? []).map((ev) => (
          <div key={ev.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card p-3">
            <img src={ev.image_url} alt={ev.name} className="h-12 w-12 object-contain" />
            <div className="min-w-40 flex-1">
              <p className="font-semibold">{ev.name}</p>
              <p className="text-xs text-muted-foreground">
                {ev.active && (!ev.ends_at || new Date(ev.ends_at) > new Date()) ? `Aberto${ev.ends_at ? ` até ${new Date(ev.ends_at).toLocaleString("pt-BR")}` : ""}` : "Encerrado"} · {ev.required_chapters} capítulos · {ev.owners} donos
              </p>
            </div>
            <Input className="w-44" placeholder="username" value={grant[ev.id] ?? ""} onChange={(e) => setGrant((g) => ({ ...g, [ev.id]: e.target.value }))} />
            <Button size="sm" variant="secondary" onClick={() => give.mutate(ev)}><UserPlus className="h-4 w-4" /> Dar</Button>
            <Button size="sm" variant={ev.active ? "outline" : "default"} onClick={() => toggle.mutate({ id: ev.id, active: !ev.active })}>
              {ev.active ? <><Lock className="h-4 w-4" /> Encerrar</> : <><Unlock className="h-4 w-4" /> Reabrir</>}
            </Button>
            <Button size="icon" variant="ghost" onClick={() => confirm("Excluir selo de todos?") && remove.mutate(ev.id)}><Trash2 className="h-4 w-4" /></Button>
          </div>
        ))}
        {events?.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum selo criado ainda.</p> : null}
      </div>
    </AdminShell>
  );
}
