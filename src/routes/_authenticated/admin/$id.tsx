import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Cloud, ExternalLink, FileImage, Link2, Pencil, Save, Trash2, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { AdminShell } from "@/components/AdminShell";
import { ConfirmDelete } from "@/components/ConfirmDelete";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { coverUrl, formatChapter, slugify, timeAgo } from "@/lib/media";
import { KINDS } from "@/lib/queries";
import { GenreSelect } from "@/components/GenreSelect";
import { normalizeGenres } from "@/lib/work-genres";
import { AGE_RATINGS, ageRatingLabel } from "@/lib/age-ratings";
import { useRoles, useSession } from "@/hooks/useAuth";
import { signCloudinaryUpload } from "@/lib/media.functions";
import { TxtChapterImport } from "@/components/TxtChapterImport";

const TEN_YEARS = 60 * 60 * 24 * 365 * 10;
const STATUSES = ["Em andamento", "Completo", "Hiato", "Cancelado"];

export const Route = createFileRoute("/_authenticated/admin/$id")({
  staticData: { sitemap: false },
  head: () => ({
    meta: [
      { title: "Editar obra e capítulos — Better Mangá" },
      { name: "description", content: "Edite a obra, envie páginas e gerencie os capítulos." },
      { property: "og:title", content: "Editar obra — Better Mangá" },
      { property: "og:description", content: "Gestão de obra e capítulos." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SeriesEditor,
});

type Chapter = { id: string; number: number; title: string | null; pages: unknown; published: boolean; created_at: string };
const pagesOf = (p: unknown) => (Array.isArray(p) ? (p as string[]) : []);

async function uploadFiles(seriesId: string, chapterNumber: string, files: File[], offset = 0) {
  const out: string[] = [];
  const ordered = [...files].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  for (const [i, file] of ordered.entries()) {
    const ext = file.name.split(".").pop() ?? "jpg";
    const path = `${seriesId}/${chapterNumber}/${Date.now()}-${String(offset + i + 1).padStart(3, "0")}.${ext}`;
    const { error } = await supabase.storage.from("manga").upload(path, file, { upsert: true, contentType: file.type });
    if (error) throw error;
    const { data, error: e2 } = await supabase.storage.from("manga").createSignedUrl(path, TEN_YEARS);
    if (e2) throw e2;
    out.push(data.signedUrl);
  }
  return out;
}

function DropZone({ files, setFiles, disabled = false }: { files: File[]; setFiles: (f: File[]) => void; disabled?: boolean }) {
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const handle = async (list: File[]) => {
    if (!list.length || disabled || busy) return;
    setBusy(true);
    setProgress(null);
    try {
      const { extractPages } = await import("@/lib/extract-pages");
      const imgs = await extractPages(list, (done, total) => setProgress({ done, total }));
      if (!imgs.length) throw new Error("Nenhuma imagem encontrada no arquivo.");
      setFiles(imgs);
      toast.success(`${imgs.length} imagem(ns) extraída(s)`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao extrair arquivo");
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };
  const pct = progress && progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : null;
  return (
    <label
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        void handle(Array.from(e.dataTransfer.files));
      }}
      className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-6 text-center transition-colors ${
        over ? "border-primary bg-primary/10" : "border-border bg-background hover:border-primary/60"
      }`}
    >
      <Upload className="h-7 w-7 text-primary" />
      <p className="text-sm font-semibold">
        {busy
          ? progress && progress.total > 0
            ? `Extraindo imagens… ${progress.done}/${progress.total}`
            : "Extraindo imagens…"
          : files.length
            ? `${files.length} imagem(ns) selecionada(s)`
            : "Arraste imagens, .zip ou .pdf ou clique para escolher"}
      </p>
      {busy && (
        <div className="h-2 w-full max-w-xs overflow-hidden rounded-full bg-muted">
          <div
            className={`h-full rounded-full bg-primary transition-all duration-200 ${pct === null ? "animate-pulse" : ""}`}
            style={{ width: `${pct ?? 100}%` }}
          />
        </div>
      )}
      <p className="text-xs text-muted-foreground">ZIP/PDF: as imagens são extraídas e só elas são salvas. Ordem pelo nome (01.jpg, 02.jpg…)</p>
      <input
        type="file"
        accept="image/*,.zip,application/zip,application/x-zip-compressed,.pdf,application/pdf"
        multiple
        className="hidden"
        disabled={busy || disabled}
        onChange={(e) => {
          void handle(Array.from(e.target.files ?? []));
          e.target.value = "";
        }}
      />
    </label>
  );
}

function SeriesEditor() {
  const { id } = Route.useParams();
  const { user } = useSession();
  const { isStaff, isAdmin } = useRoles(user?.id);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [tab, setTab] = useState<"chapters" | "info">("chapters");

  const series = useQuery({
    queryKey: ["admin-series", id],
    enabled: isStaff,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("series")
        .select("*, chapters(id, number, title, pages, published, created_at)")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const obra = series.data;
  const chapters = [...((obra?.chapters ?? []) as Chapter[])].sort((a, b) => Number(b.number) - Number(a.number));
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["admin-series", id] });
    qc.invalidateQueries({ queryKey: ["admin-series"] });
  };

  const removeSeries = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("series").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Obra apagada.");
      qc.invalidateQueries({ queryKey: ["admin-series"] });
      navigate({ to: "/admin/obras" });
    },
    onError: () => toast.error("Não foi possível apagar."),
  });

  return (
    <AdminShell
      title={obra?.title ?? "Carregando…"}
      subtitle={obra ? `${obra.kind} · ${chapters.length} capítulos` : undefined}
      actions={
        <div className="flex gap-2">
          <Button asChild variant="ghost" size="sm">
            <Link to="/admin/obras">
              <ArrowLeft className="mr-1.5 h-4 w-4" /> Obras
            </Link>
          </Button>
          {obra ? (
            <Button asChild variant="outline" size="sm">
              <Link to="/obra/$slug" params={{ slug: obra.slug }}>
                <ExternalLink className="mr-1.5 h-4 w-4" /> Ver no site
              </Link>
            </Button>
          ) : null}
          {isAdmin && obra ? (
            <ConfirmDelete title={`Apagar "${obra.title}"?`} description="A obra e todos os capítulos serão apagados permanentemente." onConfirm={() => removeSeries.mutate()}>
              <Button variant="outline" size="sm" className="border-destructive/50 text-destructive">
                <Trash2 className="mr-1.5 h-4 w-4" /> Apagar obra
              </Button>
            </ConfirmDelete>
          ) : null}
        </div>
      }
    >
      {obra ? (
        <>
          <div className="relative mb-6 overflow-hidden rounded-2xl border border-border">
            <img src={coverUrl(obra.banner_url ?? obra.cover_url)} alt="" className="absolute inset-0 h-full w-full object-cover opacity-25 blur-sm" />
            <div className="relative flex items-center gap-5 bg-gradient-to-r from-background via-background/80 to-transparent p-5">
              <img src={coverUrl(obra.cover_url)} alt={obra.title} className="h-36 w-24 rounded-xl object-cover shadow-lg" />
              <div className="min-w-0">
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${obra.published ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"}`}>
                  {obra.published ? "Publicada" : "Rascunho"}
                </span>
                <h2 className="mt-2 font-display text-2xl font-extrabold">{obra.title}</h2>
                <p className="mt-1 line-clamp-2 max-w-xl text-sm text-muted-foreground">{obra.synopsis}</p>
              </div>
            </div>
          </div>

          <div className="mb-5 inline-flex rounded-xl border border-border bg-surface p-1">
            {([
              ["chapters", "Capítulos"],
              ["info", "Editar obra"],
            ] as const).map(([k, l]) => (
              <button key={k} onClick={() => setTab(k)} className={`rounded-lg px-5 py-2 text-sm font-semibold ${tab === k ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                {l}
              </button>
            ))}
          </div>

          {tab === "info" ? <InfoForm obra={obra} onSaved={refresh} /> : <><TxtChapterImport key={id} seriesId={id} onChange={refresh} /><ChaptersPanel seriesId={id} chapters={chapters} onChange={refresh} isAdmin={isAdmin} /></>}
        </>
      ) : null}
    </AdminShell>
  );
}

type Obra = {
  id: string; title: string; slug: string; alt_titles: string | null; synopsis: string | null; cover_url: string | null;
  banner_url: string | null; kind: string; status: string; author: string | null; artist: string | null; genres: string[]; age_rating: string | null;
  published: boolean; pinned: boolean;
};

function InfoForm({ obra, onSaved }: { obra: Obra; onSaved: () => void }) {
  const [f, setF] = useState({ ...obra, genres: normalizeGenres(obra.genres) });
  useEffect(() => setF({ ...obra, genres: normalizeGenres(obra.genres) }), [obra]);
  const set = (k: keyof typeof f, v: unknown) => setF((p) => ({ ...p, [k]: v }));

  const save = useMutation({
    mutationFn: async () => {
      if (!f.title.trim()) throw new Error("Título obrigatório.");
      const { error } = await supabase
        .from("series")
        .update({
          title: f.title.trim(),
          slug: slugify(f.slug || f.title),
          alt_titles: f.alt_titles || null,
          synopsis: f.synopsis || null,
          cover_url: f.cover_url || null,
          banner_url: f.banner_url || null,
          kind: f.kind,
          status: f.status,
          author: f.author || null,
          artist: f.artist || null,
          genres: normalizeGenres(f.genres),
          age_rating: f.age_rating || null,
          published: f.published,
          pinned: f.pinned,
        })
        .eq("id", obra.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Obra salva!");
      onSaved();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Não foi possível salvar."),
  });

  const field = (label: string, k: keyof typeof f, ph?: string) => (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input value={(f[k] as string) ?? ""} placeholder={ph} onChange={(e) => set(k, e.target.value)} className="bg-background" />
    </div>
  );

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
      className="grid gap-6 lg:grid-cols-[1fr_280px]"
    >
      <div className="space-y-4 rounded-2xl border border-border bg-surface p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          {field("Título", "title")}
          {field("Slug (URL)", "slug")}
        </div>
        {field("Títulos alternativos", "alt_titles")}
        <div className="space-y-1.5">
          <Label>Sinopse</Label>
          <Textarea value={f.synopsis ?? ""} onChange={(e) => set("synopsis", e.target.value)} className="min-h-32 bg-background" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Tipo</Label>
            <select value={f.kind} onChange={(e) => set("kind", e.target.value)} className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm">
              {[...new Set([f.kind, ...KINDS])].map((k) => <option key={k}>{k}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>Status</Label>
            <select value={f.status} onChange={(e) => set("status", e.target.value)} className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm">
              {[...new Set([f.status, ...STATUSES])].map((s) => <option key={s}>{s}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>Classificação de idade</Label>
            <select value={f.age_rating ?? ""} onChange={(e) => set("age_rating", e.target.value || null)} className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm">
              <option value="">Não informada</option>
              {AGE_RATINGS.map((r) => <option key={r} value={r}>{ageRatingLabel(r)}</option>)}
            </select>
          </div>
          {field("Autor", "author")}
          {field("Artista", "artist")}
        </div>
        <GenreSelect value={f.genres} onChange={(genres) => set("genres", genres)} />
        <div className="grid gap-4 sm:grid-cols-2">
          {field("URL da capa", "cover_url", "https://…")}
          {field("URL do banner", "banner_url", "https://…")}
        </div>
      </div>

      <div className="space-y-4">
        <div className="rounded-2xl border border-border bg-surface p-5">
          <p className="text-sm font-bold">Capa</p>
          <img src={coverUrl(f.cover_url)} alt="" className="mt-3 aspect-[2/3] w-full rounded-xl object-cover" />
        </div>
        <div className="space-y-4 rounded-2xl border border-border bg-surface p-5">
          <label className="flex items-center justify-between text-sm font-semibold">
            Publicada <Switch checked={f.published} onCheckedChange={(v) => set("published", v)} />
          </label>
          <label className="flex items-center justify-between text-sm font-semibold">
            Fixar em destaque <Switch checked={f.pinned} onCheckedChange={(v) => set("pinned", v)} />
          </label>
          <Button type="submit" disabled={save.isPending} className="w-full font-semibold">
            <Save className="mr-2 h-4 w-4" /> {save.isPending ? "Salvando…" : "Salvar alterações"}
          </Button>
        </div>
      </div>
    </form>
  );
}

function ChaptersPanel({ seriesId, chapters, onChange, isAdmin }: { seriesId: string; chapters: Chapter[]; onChange: () => void; isAdmin: boolean }) {
  const signC = useServerFn(signCloudinaryUpload);
  const [number, setNumber] = useState("");
  const [numberTouched, setNumberTouched] = useState(false);
  const [title, setTitle] = useState("");
  const [urls, setUrls] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [editing, setEditing] = useState<Chapter | null>(null);

  // Preenche automaticamente o próximo número de capítulo disponível
  useEffect(() => {
    if (numberTouched || editing) return;
    const next = chapters.length ? Math.max(...chapters.map((c) => Number(c.number))) + 1 : 1;
    setNumber(String(next));
  }, [chapters, numberTouched, editing]);
  const [cloudBusy, setCloudBusy] = useState(false);
  const [cloudProgress, setCloudProgress] = useState<{ done: number; total: number } | null>(null);

  const saveCloud = async () => {
    if (cloudBusy || !isAdmin) return;
    if (!files.length) {
      toast.error("Selecione as imagens primeiro (arraste no campo acima).");
      return;
    }
    setCloudBusy(true);
    setCloudProgress({ done: 0, total: files.length });
    const completed = new Set<File>();
    try {
      const sig = await signC();
      const ordered = [...files].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
      const links: string[] = [];
      for (const [i, file] of ordered.entries()) {
        const fd = new FormData();
        fd.append("file", file);
        fd.append("api_key", sig.api_key);
        fd.append("timestamp", String(sig.timestamp));
        fd.append("folder", sig.folder);
        fd.append("signature", sig.signature);
        const res = await fetch(`https://api.cloudinary.com/v1_1/${sig.cloud_name}/image/upload`, { method: "POST", body: fd });
        const json = await res.json().catch(() => null);
        if (!res.ok || !json?.secure_url) throw new Error(json?.error?.message ?? "Falha no upload ao Cloudinary.");
        links.push(json.secure_url as string);
        completed.add(file);
        setUrls((prev) => [...new Set([...prev.split("\n").map((line) => line.trim()).filter(Boolean), json.secure_url as string])].join("\n"));
        setCloudProgress({ done: i + 1, total: ordered.length });
      }
      toast.success(`${links.length} link(s) do Cloudinary adicionado(s).`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível guardar no Cloudinary.");
    } finally {
      setFiles((pending) => pending.filter((file) => !completed.has(file)));
      setCloudBusy(false);
      setCloudProgress(null);
    }
  };

  const publish = useMutation({
    mutationFn: async () => {
      const n = Number(number.replace(",", "."));
      if (!number.trim() || !Number.isFinite(n) || n < 0 || n > 100000) throw new Error("Número do capítulo inválido.");
      if (chapters.some((c) => Number(c.number) === n)) throw new Error(`O capítulo ${formatChapter(n)} já existe.`);
      if (title.length > 150) throw new Error("Título muito longo (máx. 150).");
      const pasted = urls.split("\n").map((l) => l.trim()).filter(Boolean);
      const bad = pasted.find((u) => !/^https?:\/\/\S+$/i.test(u));
      if (bad) throw new Error(`Link inválido: ${bad.slice(0, 60)}`);
      const uploaded = files.length ? await uploadFiles(seriesId, formatChapter(n), files) : [];
      const pages = [...uploaded, ...pasted];
      if (!pages.length) throw new Error("Adicione páginas (upload ou links).");
      const { error } = await supabase.from("chapters").insert({ series_id: seriesId, number: n, title: title.trim() || null, pages });
      if (error) throw error;
      { const { error: dbErr } = await supabase.from("series").update({ updated_at: new Date().toISOString() }).eq("id", seriesId); if (dbErr) throw dbErr; }
    },
    onSuccess: () => {
      toast.success("Capítulo publicado!");
      setNumber("");
      setNumberTouched(false);
      setTitle("");
      setUrls("");
      setFiles([]);
      onChange();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Não foi possível publicar."),
  });

  const remove = useMutation({
    mutationFn: async (cid: string) => {
      const { error } = await supabase.from("chapters").delete().eq("id", cid);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Capítulo apagado.");
      onChange();
    },
    onError: () => toast.error("Não foi possível apagar."),
  });

  const togglePub = useMutation({
    mutationFn: async (c: Chapter) => {
      const { error } = await supabase.from("chapters").update({ published: !c.published }).eq("id", c.id);
      if (error) throw error;
    },
    onSuccess: onChange,
  });

  return (
    <div className="grid gap-6 xl:grid-cols-[400px_1fr]">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (cloudBusy || publish.isPending) return;
          publish.mutate();
        }}
        className="h-fit space-y-4 rounded-2xl border border-border bg-surface p-5"
      >
        <h3 className="flex items-center gap-2 font-display text-lg font-extrabold">
          <Upload className="h-5 w-5 text-primary" /> Novo capítulo
        </h3>
        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label>Número</Label>
            <Input required value={number} onChange={(e) => { setNumberTouched(true); setNumber(e.target.value); }} placeholder={String((chapters[0]?.number ?? 0) + 1)} inputMode="decimal" className="bg-background" />
          </div>
          <div className="col-span-2 space-y-1.5">
            <Label>Título (opcional)</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} className="bg-background" />
          </div>
        </div>
        <DropZone files={files} setFiles={setFiles} disabled={cloudBusy || publish.isPending} />
        <Button
          type="button"
          variant="outline"
          disabled={!isAdmin || !files.length || cloudBusy || publish.isPending}
          onClick={() => void saveCloud()}
          title={!isAdmin ? "Somente administradores podem enviar ao Cloudinary" : undefined}
          className="w-full whitespace-normal font-semibold"
        >
          <Cloud className="mr-2 h-4 w-4 shrink-0" />
          {cloudBusy ? `Guardando… ${cloudProgress?.done ?? 0}/${cloudProgress?.total ?? 0}` : "Guardar imagens no Cloudinary"}
        </Button>
        {cloudBusy && cloudProgress ? (
          <progress className="h-2 w-full accent-primary" value={cloudProgress.done} max={cloudProgress.total} aria-label="Envio ao Cloudinary" />
        ) : null}
        <div className="space-y-1.5">
          <Label className="flex items-center gap-1.5"><Link2 className="h-3.5 w-3.5" /> Ou links das páginas (um por linha)</Label>
          <Textarea value={urls} disabled={cloudBusy || publish.isPending} onChange={(e) => setUrls(e.target.value)} className="min-h-24 bg-background font-mono text-xs" placeholder={"https://…/01.jpg\nhttps://…/02.jpg"} />
        </div>
        <Button type="submit" disabled={cloudBusy || publish.isPending || !number.trim()} className="w-full font-semibold">
          {publish.isPending ? "Enviando…" : "Publicar capítulo"}
        </Button>
      </form>

      <div className="overflow-hidden rounded-2xl border border-border bg-surface">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h3 className="font-display text-lg font-extrabold">Capítulos</h3>
          <span className="text-xs text-muted-foreground">{chapters.length} no total</span>
        </div>
        <div className="max-h-[640px] overflow-y-auto">
          {chapters.map((c) => (
            <div key={c.id} className="flex items-center gap-4 border-b border-border px-5 py-3.5 last:border-0 hover:bg-surface-2/50">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-surface-2 text-sm font-bold">{formatChapter(c.number)}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">
                  Capítulo {formatChapter(c.number)}
                  {c.title ? <span className="ml-2 font-normal text-muted-foreground">{c.title}</span> : null}
                </p>
                <p className="flex items-center gap-2 text-xs text-muted-foreground">
                  <FileImage className="h-3 w-3" /> {pagesOf(c.pages).length} páginas · {timeAgo(c.created_at)}
                  {!c.published ? <span className="rounded bg-muted px-1.5 font-bold">Oculto</span> : null}
                </p>
              </div>
              <Switch checked={c.published} onCheckedChange={() => togglePub.mutate(c)} title="Visível no site" />
              <Button variant="ghost" size="icon" title="Editar" onClick={() => setEditing(c)}>
                <Pencil className="h-4 w-4" />
              </Button>
              <ConfirmDelete title={`Apagar capítulo ${formatChapter(c.number)}?`} description="Essa ação não pode ser desfeita." onConfirm={() => remove.mutate(c.id)}>
                <Button variant="ghost" size="icon" title="Apagar">
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </ConfirmDelete>
            </div>
          ))}
          {chapters.length === 0 ? <p className="p-10 text-center text-sm text-muted-foreground">Nenhum capítulo publicado ainda.</p> : null}
        </div>
      </div>

      <ChapterDialog seriesId={seriesId} chapter={editing} onClose={() => setEditing(null)} onSaved={onChange} />
    </div>
  );
}

function ChapterDialog({ seriesId, chapter, onClose, onSaved }: { seriesId: string; chapter: Chapter | null; onClose: () => void; onSaved: () => void }) {
  const [number, setNumber] = useState("");
  const [title, setTitle] = useState("");
  const [pages, setPages] = useState<string[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  useEffect(() => {
    if (!chapter) return;
    setNumber(String(chapter.number));
    setTitle(chapter.title ?? "");
    setPages(pagesOf(chapter.pages));
    setFiles([]);
  }, [chapter]);

  const save = useMutation({
    mutationFn: async () => {
      if (!chapter) return;
      const extra = files.length ? await uploadFiles(seriesId, formatChapter(number), files, pages.length) : [];
      const all = [...pages.map((p) => p.trim()).filter(Boolean), ...extra];
      const { error } = await supabase.from("chapters").update({ number: Number(number), title: title.trim() || null, pages: all }).eq("id", chapter.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Capítulo atualizado!");
      onSaved();
      onClose();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Não foi possível salvar."),
  });

  return (
    <Dialog open={Boolean(chapter)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar capítulo</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label>Número</Label>
            <Input value={number} onChange={(e) => setNumber(e.target.value)} />
          </div>
          <div className="col-span-2 space-y-1.5">
            <Label>Título</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Páginas ({pages.length}) — links editáveis</Label>
          <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
            {pages.map((p, i) => (
              <div key={i} className="flex items-center gap-2">
                <img src={p} alt="" className="h-12 w-9 shrink-0 rounded object-cover" />
                <span className="w-6 text-xs text-muted-foreground">{i + 1}</span>
                <Input value={p} onChange={(e) => setPages(pages.map((x, j) => (j === i ? e.target.value : x)))} className="font-mono text-xs" />
                <Button variant="ghost" size="icon" onClick={() => setPages(pages.filter((_, j) => j !== i))}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
          <Button variant="outline" size="sm" onClick={() => setPages([...pages, ""])}>
            <Link2 className="mr-1.5 h-3.5 w-3.5" /> Adicionar link
          </Button>
        </div>
        <DropZone files={files} setFiles={setFiles} />
        <Button disabled={save.isPending} onClick={() => save.mutate()} className="w-full font-semibold">
          <Save className="mr-2 h-4 w-4" /> {save.isPending ? "Salvando…" : "Salvar capítulo"}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
