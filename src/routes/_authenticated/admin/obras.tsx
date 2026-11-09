import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronDown, Eye, EyeOff, GalleryHorizontal, KeyRound, Pencil, Plus, Search, Trash2, Wrench, BookText, ArrowUpRight } from "lucide-react";
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
import { DuplicateWorksPanel } from "@/components/DuplicateWorksPanel";
import { Pager } from "@/components/Pager";
import { ADMIN_PAGE_SIZE, fetchAdminWorks } from "@/lib/admin-lists";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { compactNumber } from "@/lib/format";
import { kindLabel } from "@/lib/work-categories";
function CloudinaryKeys() {
  const getS = useServerFn(getMediaSettings);
  const saveS = useServerFn(saveMediaSettings);
  const [open, setOpen] = useState(false);
  const [cfg, setCfg] = useState({ cloud_name: "", api_key: "", api_secret: "", folder: "bettermanga" });
  const [hasSecret, setHasSecret] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    let active = true;
    getS()
      .then((s) => {
        if (!active) return;
        setCfg((c) => ({ ...c, cloud_name: s.cloud_name, api_key: s.api_key, folder: s.folder }));
        setHasSecret(s.hasSecret);
      })
      .catch(() => {});
    return () => { active = false; };
  }, [getS, open]);

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
    <div className="mb-5 rounded-lg border border-border bg-surface">
      <Button variant="ghost"
        aria-expanded={open}
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
      </Button>
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
  const [tools, setTools] = useState(false);
  const [filter, setFilter] = useState<"all" | "pub" | "draft" | "slide">("all");

  const [page, setPage] = useState(1);
  const term = useDebouncedValue(q);
  const series = useQuery({
    queryKey: ["admin-series", page, term, filter],
    enabled: isStaff,
    queryFn: ({ signal }) => fetchAdminWorks(page, term, filter, signal),
    placeholderData: keepPreviousData,
  });
  const rows = series.data?.rows ?? [];
  const pages = Math.max(1, Math.ceil((series.data?.total ?? 0) / ADMIN_PAGE_SIZE));
  useEffect(() => { if (page > pages && !series.isFetching) setPage(pages); }, [page, pages, series.isFetching]);

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
      subtitle={`${series.data?.total ?? 0} obras no catálogo`}
      actions={
        <div className="no-scrollbar flex max-w-full items-center gap-2 overflow-x-auto">
        <Button asChild className="font-semibold">
          <Link to="/admin/nova">
            <Plus className="mr-2 h-4 w-4" /> Nova obra
          </Link>
        </Button>
        {isAdmin ? <WorkClassificationButton /> : null}
        </div>
      }
    >
      <div className="mb-6 flex flex-wrap items-center gap-2 border-b border-border pb-5">
        <Button asChild variant="outline" size="sm"><Link to="/admin/novels"><BookText className="h-4 w-4" /> Novels <ArrowUpRight className="h-3 w-3" /></Link></Button>
        {isAdmin ? <Button variant="ghost" size="sm" onClick={() => setTools((v) => !v)} aria-expanded={tools}><Wrench className="h-4 w-4" /> Ferramentas <ChevronDown className={`h-3 w-3 ${tools ? "rotate-180" : ""}`} /></Button> : null}
      </div>
      {isAdmin && tools ? <><CloudinaryKeys /><DuplicateWorksPanel /></> : null}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-0 basis-full sm:basis-auto sm:flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} aria-label="Buscar obra no painel" placeholder="Buscar obra…" className="h-11 bg-surface pl-9" />
        </div>
        <div className="flex max-w-full flex-wrap gap-1 rounded-lg border border-border bg-surface p-1">
          {([
            ["all", "Todas"],
            ["pub", "Publicadas"],
            ["draft", "Rascunhos"],
            ["slide", "No slide"],
          ] as const).map(([k, l]) => (
            <Button variant="ghost" size="sm"
              aria-pressed={filter === k}
              key={k}
              onClick={() => { setFilter(k); setPage(1); }}
              className={`rounded-lg px-4 py-1.5 text-sm font-semibold ${filter === k ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
            >
              {l}
            </Button>
          ))}
        </div>
      </div>

      <p role="status" className="mt-4 h-5 text-sm text-muted-foreground">{series.isFetching ? "Carregando obras…" : ""}</p>
      {series.isError ? <div role="alert" className="mt-4 text-sm text-destructive">Não foi possível carregar as obras. <Button variant="outline" onClick={() => void series.refetch()}>Tentar novamente</Button></div> : null}
      <div aria-busy={series.isFetching} className={`admin-work-list mt-5 overflow-hidden rounded-lg border border-border bg-surface${series.isPending ? " min-h-[70vh]" : ""}`}>
        {rows.map((r) => (
          <div key={r.id} className="admin-work-row flex flex-wrap items-center gap-3 border-b border-border p-4 last:border-0 hover:bg-surface-2/50">
            <img src={coverUrl(r.cover_url)} alt={r.title} loading="lazy" decoding="async" className="h-20 w-14 shrink-0 rounded-lg object-cover" />
            <div className="admin-work-info min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <Link to="/admin/$id" params={{ id: r.id }} className="line-clamp-2 basis-full font-bold hover:text-primary">{r.title}</Link>
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
                {kindLabel(r.kind)} · {r.status} · {(r.chapters?.[0]?.count ?? 0).toLocaleString("pt-BR")} capítulos · {compactNumber(r.views ?? 0)} leituras · {timeAgo(r.updated_at)}
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
            <Button variant="ghost" size="icon" title={r.published ? "Despublicar" : "Publicar"} aria-label={r.published ? "Despublicar" : "Publicar"} disabled={toggle.isPending} onClick={() => toggle.mutate(r)}>
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
        {rows.length === 0 && !series.isPending && !series.isError ? <p className="p-10 text-center text-sm text-muted-foreground">Nenhuma obra encontrada.</p> : null}
      </div>
      <Pager page={page} pages={pages} onChange={setPage} />
    </AdminShell>
  );
}
