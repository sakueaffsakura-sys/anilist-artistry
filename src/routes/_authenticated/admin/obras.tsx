import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronDown, Eye, EyeOff, GalleryHorizontal, KeyRound, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AdminShell } from "@/components/AdminShell";
import { ConfirmDelete } from "@/components/ConfirmDelete";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { coverUrl, timeAgo } from "@/lib/media";
import { getMediaSettings, saveMediaSettings } from "@/lib/media.functions";
import { useRoles, useSession } from "@/hooks/useAuth";
import { WorkClassificationButton } from "@/components/WorkClassificationButton";
import { AgeRatingBadge } from "@/components/AgeRatingBadge";
function CloudinaryKeys() {
  const getS = useServerFn(getMediaSettings);
  const saveS = useServerFn(saveMediaSettings);
  const [open, setOpen] = useState(false);
  const [cfg, setCfg] = useState({ cloud_name: "", api_key: "", api_secret: "", folder: "bettermanga" });
  const [hasSecret, setHasSecret] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getS()
      .then((s) => {
        setCfg((c) => ({ ...c, cloud_name: s.cloud_name, api_key: s.api_key, folder: s.folder }));
        setHasSecret(s.hasSecret);
      })
      .catch(() => {});
  }, [getS]);

  const save = async () => {
    setSaving(true);
    try {
      await saveS({ data: cfg });
      if (cfg.api_secret) setHasSecret(true);
      setCfg((c) => ({ ...c, api_secret: "" }));
      toast.success("Chaves do Cloudinary salvas.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mb-5 rounded-2xl border border-border bg-surface">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-3 p-4 text-left"
      >
        <span className="flex items-center gap-2 font-semibold">
          <KeyRound className="h-4 w-4 text-primary" /> Chaves do Cloudinary
          {hasSecret ? (
            <span className="rounded-full bg-primary/15 px-2 py-px text-[10px] font-bold text-primary">Configurado</span>
          ) : null}
        </span>
        <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open ? (
        <div className="grid gap-2 border-t border-border p-4 sm:grid-cols-2">
          <Input placeholder="Cloud name" value={cfg.cloud_name} onChange={(e) => setCfg({ ...cfg, cloud_name: e.target.value })} />
          <Input placeholder="API Key" value={cfg.api_key} onChange={(e) => setCfg({ ...cfg, api_key: e.target.value })} />
          <Input
            type="password"
            placeholder={hasSecret ? "API Secret (salvo — preencha só para trocar)" : "API Secret"}
            value={cfg.api_secret}
            onChange={(e) => setCfg({ ...cfg, api_secret: e.target.value })}
          />
          <Input placeholder="Pasta" value={cfg.folder} onChange={(e) => setCfg({ ...cfg, folder: e.target.value })} />
          <div className="flex items-center gap-3 sm:col-span-2">
            <Button onClick={save} disabled={saving} className="font-semibold">
              {saving ? "Salvando…" : "Salvar chaves"}
            </Button>
            <p className="text-xs text-muted-foreground">
              Encontre em console.cloudinary.com → Settings → API Keys. O secret fica guardado só no servidor.
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export const Route = createFileRoute("/_authenticated/admin/obras")({
  staticData: { sitemap: false },
  head: () => ({
    meta: [
      { title: "Gerenciar obras — Better Mangá" },
      { name: "description", content: "Edite, publique, despublique ou apague obras do catálogo." },
      { property: "og:title", content: "Gerenciar obras — Better Mangá" },
      { property: "og:description", content: "Gestão do catálogo de obras." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ObrasAdmin,
});

function ObrasAdmin() {
  const { user } = useSession();
  const { isStaff, isAdmin } = useRoles(user?.id);
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | "pub" | "draft" | "slide">("all");

  const series = useQuery({
    queryKey: ["admin-series"],
    enabled: isStaff,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("series")
        .select("id, slug, title, cover_url, kind, status, published, in_slider, views, rating, updated_at, age_rating, chapters(id)")
        .neq("kind", "Novel")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const rows = useMemo(
    () =>
      (series.data ?? []).filter(
        (r) =>
          r.title.toLowerCase().includes(q.toLowerCase()) &&
          (filter === "all" || (filter === "slide" ? r.in_slider : filter === "pub" ? r.published : !r.published)),
      ),
    [series.data, q, filter],
  );

  const toggle = useMutation({
    mutationFn: async (r: { id: string; published: boolean }) => {
      const { error } = await supabase.from("series").update({ published: !r.published }).eq("id", r.id);
      if (error) throw error;
    },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["admin-series"] }); void qc.invalidateQueries({ queryKey: ["series"] }); void qc.invalidateQueries({ queryKey: ["admin-work-requests"] }); },
    onError: () => toast.error("Não foi possível alterar."),
  });

  const slide = useMutation({
    mutationFn: async (r: { id: string; in_slider: boolean }) => {
      const { error } = await supabase.from("series").update({ in_slider: !r.in_slider }).eq("id", r.id);
      if (error) throw error;
      return !r.in_slider;
    },
    onSuccess: (on) => {
      toast.success(on ? "Obra adicionada ao slide." : "Obra removida do slide.");
      qc.invalidateQueries({ queryKey: ["admin-series"] });
      qc.invalidateQueries({ queryKey: ["series", "slider"] });
    },
    onError: () => toast.error("Não foi possível alterar o slide."),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("series").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Obra apagada.");
      qc.invalidateQueries({ queryKey: ["admin-series"] });
      qc.invalidateQueries({ queryKey: ["series"] });
    },
    onError: () => toast.error("Não foi possível apagar."),
  });

  return (
    <AdminShell
      title="Obras"
      subtitle={`${series.data?.length ?? 0} obras no catálogo`}
      actions={
        <div className="flex flex-wrap items-center gap-2">
        <Button asChild className="font-semibold">
          <Link to="/admin/nova">
            <Plus className="mr-2 h-4 w-4" /> Nova obra
          </Link>
        </Button>
        {isAdmin ? <WorkClassificationButton /> : null}
        </div>
      }
    >
      {isAdmin ? <CloudinaryKeys /> : null}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar obra…" className="h-11 bg-surface pl-9" />
        </div>
        <div className="flex rounded-xl border border-border bg-surface p-1">
          {([
            ["all", "Todas"],
            ["pub", "Publicadas"],
            ["draft", "Rascunhos"],
            ["slide", "No slide"],
          ] as const).map(([k, l]) => (
            <button
              key={k}
              onClick={() => setFilter(k)}
              className={`rounded-lg px-4 py-1.5 text-sm font-semibold ${filter === k ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
            >
              {l}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-5 overflow-hidden rounded-2xl border border-border bg-surface">
        {rows.map((r) => (
          <div key={r.id} className="flex items-center gap-4 border-b border-border p-3 last:border-0 hover:bg-surface-2/50">
            <img src={coverUrl(r.cover_url)} alt={r.title} className="h-20 w-14 shrink-0 rounded-lg object-cover" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="truncate font-bold">{r.title}</p>
                <span
                  className={`shrink-0 rounded-full px-2 py-px text-[10px] font-bold ${
                    r.published ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"
                  }`}
                >
                  {r.published ? "Publicada" : "Rascunho"}
                </span>
                {r.in_slider ? (
                  <span className="shrink-0 rounded-full bg-accent px-2 py-px text-[10px] font-bold text-accent-foreground">No slide</span>
                ) : null}
                <AgeRatingBadge value={r.age_rating} size="sm" />
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {r.kind} · {r.status} · {r.chapters?.length ?? 0} capítulos · {r.views} views · {timeAgo(r.updated_at)}
              </p>
            </div>
            <Button
              variant={r.in_slider ? "default" : "outline"}
              size="sm"
              className="font-semibold"
              title={r.in_slider ? "Remover do slide" : "Colocar no slide"}
              disabled={slide.isPending}
              onClick={() => slide.mutate(r)}
            >
              <GalleryHorizontal className="h-3.5 w-3.5 sm:mr-1.5" />
              <span className="hidden sm:inline">{r.in_slider ? "Tirar do slide" : "Pôr no slide"}</span>
            </Button>
            <Button variant="ghost" size="icon" title={r.published ? "Despublicar" : "Publicar"} onClick={() => toggle.mutate(r)}>
              {r.published ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4 text-muted-foreground" />}
            </Button>
            <Button asChild variant="outline" size="sm" className="border-primary/50 font-semibold text-primary hover:bg-primary/10">
              <Link to="/admin/$id" params={{ id: r.id }} title="Publicar novo capítulo">
                <Plus className="mr-1 h-3.5 w-3.5" /> Novo capítulo
              </Link>
            </Button>
            <Button asChild variant="ghost" size="icon" title="Editar obra">
              <Link to="/admin/$id" params={{ id: r.id }}>
                <Pencil className="h-4 w-4" />
              </Link>
            </Button>
            {isAdmin ? (
              <ConfirmDelete
                title={`Apagar "${r.title}"?`}
                description="A obra e todos os capítulos serão apagados permanentemente."
                onConfirm={() => remove.mutate(r.id)}
              >
                <Button variant="ghost" size="icon" title="Apagar obra">
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </ConfirmDelete>
            ) : null}
          </div>
        ))}
        {rows.length === 0 ? <p className="p-10 text-center text-sm text-muted-foreground">Nenhuma obra encontrada.</p> : null}
      </div>
    </AdminShell>
  );
}
