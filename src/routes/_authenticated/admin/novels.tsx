import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpenText, BookText, Eye, FilePlus2, Pencil, Plus, Save, Search, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AdminShell } from "@/components/AdminShell";
import { ConfirmDelete } from "@/components/ConfirmDelete";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { uniqueSlug } from "@/lib/series-import";
import { coverUrl, formatChapter } from "@/lib/media";
import { useSession } from "@/hooks/useAuth";
import { useServerFn } from "@tanstack/react-start";
import { extractChapter, importNovelChapter, prepareChapterText } from "@/lib/novel-import.functions";

export const Route = createFileRoute("/_authenticated/admin/novels")({
  staticData: { sitemap: false },
  head: () => ({
    meta: [
      { title: "Novels — Painel Better Mangá" },
      { name: "description", content: "Cadastre novels e publique capítulos em texto." },
      { property: "og:title", content: "Novels — Painel Better Mangá" },
      { property: "og:description", content: "Gestão de novels e capítulos em texto." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminNovels,
});

type NovelRow = {
  id: string;
  slug: string;
  title: string;
  cover_url: string | null;
  status: string;
  chapters: { id: string; number: number; title: string | null; content: string | null; published: boolean; created_at: string }[];
};

function AdminNovels() {
  const { user } = useSession();
  const queryClient = useQueryClient();
  const [openId, setOpenId] = useState<string | null>(null);

  const novels = useQuery({
    queryKey: ["admin-novels"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("series")
        .select("id, slug, title, cover_url, status, chapters(id, number, title, content, published, created_at)")
        .eq("kind", "Novel")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as NovelRow[];
    },
  });

  const [form, setForm] = useState({
    title: "",
    synopsis: "",
    coverUrl: "",
    bannerUrl: "",
    author: "",
    genres: "",
    status: "Em andamento",
  });
  const set = (key: keyof typeof form, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const createNovel = useMutation({
    mutationFn: async () => {
      const title = form.title.trim();
      if (!title) throw new Error("Informe o título da novel.");
      const { error } = await supabase.from("series").insert({
        slug: await uniqueSlug(title, ""),
        title,
        synopsis: form.synopsis,
        cover_url: form.coverUrl,
        banner_url: form.bannerUrl,
        author: form.author,
        genres: form.genres.split(",").map((g) => g.trim()).filter(Boolean),
        status: form.status,
        kind: "Novel",
        published: true,
        created_by: user?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Novel criada!");
      setForm({ title: "", synopsis: "", coverUrl: "", bannerUrl: "", author: "", genres: "", status: "Em andamento" });
      queryClient.invalidateQueries({ queryKey: ["admin-novels"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao criar novel"),
  });

  const removeNovel = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.from("series").delete().eq("id", id).eq("kind", "Novel").select("id");
      if (error) throw error;
      if (!data?.length) throw new Error("Sem permissão para apagar esta novel. Somente administradores podem apagar.");
    },
    onSuccess: () => {
      toast.success("Novel apagada.");
      setOpenId(null);
      queryClient.invalidateQueries({ queryKey: ["admin-novels"] });
      queryClient.invalidateQueries({ queryKey: ["series"] });
      queryClient.invalidateQueries({ queryKey: ["catalog"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Não foi possível apagar a novel."),
  });

  const novelList = novels.data ?? [];
  const selectedNovel = novelList.find((novel) => novel.id === openId) ?? novelList[0];
  const chapterTotal = novelList.reduce((total, novel) => total + novel.chapters.length, 0);
  const publishedTotal = novelList.reduce(
    (total, novel) => total + novel.chapters.filter((chapter) => chapter.published).length,
    0,
  );

  return (
    <AdminShell title="Novels" subtitle="Cadastre novels e publique capítulos em texto.">
      <div className="grid min-w-0 gap-5 xl:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="min-w-0 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg border border-border bg-surface p-4">
              <p className="text-[10px] font-bold uppercase text-muted-foreground">Novels</p>
              <p className="mt-1 font-display text-2xl font-bold text-primary">{novelList.length}</p>
            </div>
            <div className="rounded-lg border border-border bg-surface p-4">
              <p className="text-[10px] font-bold uppercase text-muted-foreground">Publicados</p>
              <p className="mt-1 font-display text-2xl font-bold text-primary">{publishedTotal}<span className="text-sm text-muted-foreground">/{chapterTotal}</span></p>
            </div>
          </div>

          <section className="overflow-hidden rounded-lg border border-border bg-surface">
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-border px-4 py-3">
              <div className="flex min-w-0 items-center gap-2">
                <BookText className="h-4 w-4 shrink-0 text-primary" />
                <h2 className="truncate font-display text-sm font-bold">Novels cadastradas</h2>
              </div>
              <span className="shrink-0 text-xs text-muted-foreground">{novelList.length}</span>
            </div>
            <div className="max-h-72 space-y-1 overflow-y-auto p-2 xl:max-h-80">
              {novelList.length === 0 && !novels.isLoading ? (
                <p className="px-3 py-8 text-center text-xs text-muted-foreground">Nenhuma novel cadastrada.</p>
              ) : null}
              {novelList.map((novel) => {
                const active = selectedNovel?.id === novel.id;
                return (
                  <div key={novel.id} className={`grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-md border p-2 transition-colors ${active ? "border-primary/50 bg-primary/10" : "border-transparent hover:border-border hover:bg-surface-2/50"}`}>
                    <Button type="button" variant="ghost" className="contents" onClick={() => setOpenId(novel.id)}>
                      <img src={coverUrl(novel.cover_url)} alt="" className="h-14 w-10 shrink-0 rounded object-cover" />
                      <span className="min-w-0 text-left">
                        <span className={`block truncate text-sm font-bold ${active ? "text-primary" : "text-foreground"}`}>{novel.title}</span>
                        <span className="block truncate text-[11px] text-muted-foreground">{novel.status} · {novel.chapters.length} cap.</span>
                      </span>
                    </Button>
                    <Button asChild type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0" title="Ver página">
                      <Link to="/obra/$slug" params={{ slug: novel.slug }}><Eye className="h-4 w-4" /></Link>
                    </Button>
                  </div>
                );
              })}
            </div>
          </section>

          <details className="group rounded-lg border border-border bg-surface">
            <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 font-display text-sm font-bold">
              <span className="flex items-center gap-2"><Plus className="h-4 w-4 text-primary" /> Nova novel</span>
              <span className="text-lg text-muted-foreground transition-transform group-open:rotate-45">+</span>
            </summary>
            <form
              className="grid gap-3 border-t border-border p-4 sm:grid-cols-2 xl:grid-cols-1"
              onSubmit={(e) => {
                e.preventDefault();
                createNovel.mutate();
              }}
            >
              <Field label="Título" required value={form.title} onChange={(v) => set("title", v)} />
              <Field label="Autor" value={form.author} onChange={(v) => set("author", v)} />
              <Field label="URL da capa" value={form.coverUrl} onChange={(v) => set("coverUrl", v)} placeholder="https://…" />
              <Field label="URL do banner" value={form.bannerUrl} onChange={(v) => set("bannerUrl", v)} placeholder="https://…" />
              <Field label="Gêneros (vírgula)" value={form.genres} onChange={(v) => set("genres", v)} placeholder="Ação, Fantasia" />
              <div className="space-y-1.5">
                <Label>Status</Label>
                <select value={form.status} onChange={(e) => set("status", e.target.value)} className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm">
                  {["Em andamento", "Completo", "Hiato", "Cancelado", "Em breve"].map((s) => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div className="space-y-1.5 sm:col-span-2 xl:col-span-1">
                <Label>Sinopse</Label>
                <Textarea value={form.synopsis} onChange={(e) => set("synopsis", e.target.value)} className="min-h-24 bg-background" />
              </div>
              <Button type="submit" disabled={createNovel.isPending} className="font-semibold sm:col-span-2 xl:col-span-1">
                {createNovel.isPending ? "Criando…" : "Criar novel"}
              </Button>
            </form>
          </details>
        </aside>

        <main className="min-w-0">
          {selectedNovel ? (
            <section className="overflow-hidden rounded-lg border border-border bg-surface shadow-[var(--shadow-card)]">
              <header className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-border px-4 py-3 sm:px-5">
                <div className="flex min-w-0 items-center gap-3">
                  <img src={coverUrl(selectedNovel.cover_url)} alt="" className="h-12 w-9 shrink-0 rounded object-cover" />
                  <div className="min-w-0">
                    <p className="truncate font-display text-base font-bold">{selectedNovel.title}</p>
                    <p className="truncate text-xs text-muted-foreground">{selectedNovel.chapters.length} capítulos · {selectedNovel.status}</p>
                  </div>
                </div>
                <ConfirmDelete
                  title={`Apagar a novel "${selectedNovel.title}"?`}
                  description="Todos os capítulos, comentários e progresso de leitura dela serão apagados permanentemente."
                  onConfirm={() => removeNovel.mutate(selectedNovel.id)}
                >
                  <Button variant="outline" size="sm" className="shrink-0 text-destructive hover:text-destructive">
                    <Trash2 className="h-4 w-4" /><span className="hidden sm:inline">Apagar</span>
                  </Button>
                </ConfirmDelete>
                <Button asChild variant="outline" size="sm" className="shrink-0">
                  <Link to="/obra/$slug" params={{ slug: selectedNovel.slug }}><Eye className="h-4 w-4" /><span className="hidden sm:inline">Ver página</span></Link>
                </Button>
              </header>
              <ChapterForm key={selectedNovel.id} novel={selectedNovel} />
            </section>
          ) : (
            <div className="grid min-h-96 place-items-center rounded-lg border border-dashed border-border bg-surface/50 p-8 text-center">
              <div><BookOpenText className="mx-auto h-9 w-9 text-primary" /><p className="mt-3 text-sm text-muted-foreground">Crie uma novel para começar a publicar capítulos.</p></div>
            </div>
          )}
        </main>
      </div>
    </AdminShell>
  );
}

function ChapterForm({ novel }: { novel: NovelRow }) {
  const queryClient = useQueryClient();
  const nextNumber = Math.max(0, ...novel.chapters.map((c) => Number(c.number))) + 1;
  const [editingId, setEditingId] = useState<string | null>(null);
  const [number, setNumber] = useState(String(nextNumber));
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [published, setPublished] = useState(false);
  const [search, setSearch] = useState("");
  const [showPreview, setShowPreview] = useState(false);
  const [importUrl, setImportUrl] = useState("");
  const [importing, setImporting] = useState(false);
  const importFn = useServerFn(importNovelChapter);
  function applyImport(r: { title: string | null; number: string | null; content: string }) {
    if (r.content.length < 10) {
      toast.error("Nenhum texto encontrado.");
      return;
    }
    setContent(r.content);
    if (r.title) setTitle(r.title);
    if (r.number) setNumber(r.number);
    setShowPreview(false);
    toast.success("Texto do capítulo importado!");
  }
  async function runImport() {
    setImporting(true);
    try {
      const r = await importFn({ data: { url: importUrl.trim() } });
      if (r.ok) applyImport(r);
      else toast.error(r.error);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao importar.");
    } finally {
      setImporting(false);
    }
  }
  const [bulk, setBulk] = useState<{ done: number; total: number } | null>(null);
  const [bulkPublish, setBulkPublish] = useState(false);
  async function runBulk(files: File[]) {
    const taken = new Set(novel.chapters.map((c) => Number(c.number)));
    let ok = 0;
    const skipped: string[] = [];
    setBulk({ done: 0, total: files.length });
    const sorted = [...files].sort((a, b) => a.name.localeCompare(b.name, "pt-BR", { numeric: true }));
    for (let i = 0; i < sorted.length; i++) {
      const file = sorted[i]!;
      try {
        const raw = await file.text();
        const isHtml = /<\/?(p|div|html|body)[\s>]/i.test(raw);
        void isHtml; const r = prepareChapterText(raw);
        const fromName = file.name.match(/(\d+(?:[.,]\d+)?)/)?.[1]?.replace(",", ".");
        const num = Number(r.number ?? fromName);
        if (!Number.isFinite(num) || r.content.length < 10) { skipped.push(`${file.name} (sem número ou texto)`); continue; }
        if (taken.has(num)) { skipped.push(`${file.name} (cap. ${formatChapter(num)} já existe)`); continue; }
        const { error } = await supabase.from("chapters").insert({ series_id: novel.id, number: num, title: r.title, content: r.content, pages: [], published: bulkPublish });
        if (error) { skipped.push(`${file.name} (${error.message})`); continue; }
        taken.add(num);
        ok++;
      } catch {
        skipped.push(`${file.name} (erro ao ler)`);
      } finally {
        setBulk({ done: i + 1, total: sorted.length });
      }
    }
    setBulk(null);
    refresh();
    if (ok) toast.success(`${ok} capítulo(s) cadastrado(s)!`);
    if (skipped.length) toast.error(`Ignorados: ${skipped.slice(0, 5).join("; ")}${skipped.length > 5 ? "..." : ""}`);
  }
  const draftKey = `better-manga:novel-draft:${novel.id}`;

  const resetEditor = () => {
    setEditingId(null);
    setNumber(String(Math.max(nextNumber, 1)));
    setTitle("");
    setContent("");
    setPublished(false);
    setShowPreview(false);
  };

  useEffect(() => {
    if (editingId) return;
    const saved = window.localStorage.getItem(draftKey);
    if (!saved) return;
    try {
      const draft = JSON.parse(saved) as { number?: string; title?: string; content?: string; published?: boolean };
      setNumber(draft.number || String(nextNumber));
      setTitle(draft.title || "");
      setContent(draft.content || "");
      setPublished(Boolean(draft.published));
    } catch {
      window.localStorage.removeItem(draftKey);
    }
  }, [draftKey, editingId, nextNumber]);

  useEffect(() => {
    if (editingId) return;
    const timer = window.setTimeout(() => {
      if (title.trim() || content.trim()) {
        window.localStorage.setItem(draftKey, JSON.stringify({ number, title, content, published }));
      } else {
        window.localStorage.removeItem(draftKey);
      }
    }, 500);
    return () => window.clearTimeout(timer);
  }, [content, draftKey, editingId, number, published, title]);

  const wordCount = content.trim() ? content.trim().split(/\s+/).length : 0;
  const readingMinutes = wordCount ? Math.max(1, Math.ceil(wordCount / 220)) : 0;
  const paragraphs = content.split(/\n{2,}|\r?\n/).map((part) => part.trim()).filter(Boolean);

  const visibleChapters = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("pt-BR");
    return [...novel.chapters]
      .sort((a, b) => Number(b.number) - Number(a.number))
      .filter((chapter) => !term || `capitulo ${chapter.number} ${chapter.title ?? ""}`.toLocaleLowerCase("pt-BR").includes(term));
  }, [novel.chapters, search]);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["admin-novels"] });
    queryClient.invalidateQueries({ queryKey: ["series", novel.slug] });
  };

  const publish = useMutation({
    mutationFn: async () => {
      const num = Number(number);
      if (!Number.isFinite(num) || num < 0) throw new Error("Número de capítulo inválido.");
      const prepared = prepareChapterText(content);
      if (prepared.content.length < 10) throw new Error("Escreva o texto do capítulo.");
      if (novel.chapters.some((chapter) => Number(chapter.number) === num && chapter.id !== editingId)) {
        throw new Error(`O capítulo ${formatChapter(num)} já existe.`);
      }
      const values = {
        series_id: novel.id,
        number: num,
        title: title.trim() || prepared.title || null,
        content: prepared.content,
        pages: [],
        published,
      };
      const { error } = editingId
        ? await supabase.from("chapters").update(values).eq("id", editingId).eq("series_id", novel.id)
        : await supabase.from("chapters").insert(values);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(published ? "Capítulo publicado!" : "Rascunho salvo!");
      window.localStorage.removeItem(draftKey);
      resetEditor();
      refresh();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao publicar"),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("chapters").delete().eq("id", id).eq("series_id", novel.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Capítulo excluído.");
      resetEditor();
      refresh();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao excluir capítulo"),
  });

  const editChapter = (chapter: NovelRow["chapters"][number]) => {
    setEditingId(chapter.id);
    setNumber(String(chapter.number));
    setTitle(chapter.title ?? "");
    setContent(chapter.content ?? "");
    setPublished(chapter.published);
    setShowPreview(false);
  };

  return (
    <div className="grid min-w-0 gap-4 p-3 sm:p-4 lg:grid-cols-[230px_minmax(0,1fr)]">
      <aside className="min-w-0 rounded-lg border border-border bg-background/60 p-3 lg:max-h-[680px]">
        <div className="mb-3 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
          <div className="min-w-0"><h3 className="truncate font-display text-sm font-bold">Capítulos</h3><p className="text-[10px] text-muted-foreground">Selecione para editar</p></div>
          <Button type="button" size="icon" className="h-8 w-8 shrink-0" onClick={resetEditor} aria-label="Novo capítulo" title="Novo capítulo"><FilePlus2 className="h-4 w-4" /></Button>
        </div>
        <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
          <div className="relative min-w-0">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar capítulo" className="pl-9" />
          </div>
        </div>
        <div className="mt-3 max-h-56 space-y-2 overflow-y-auto pr-1 lg:max-h-[570px]">
          {visibleChapters.map((chapter) => (
            <div key={chapter.id} className={`rounded-md border p-3 ${editingId === chapter.id ? "border-primary bg-primary/10" : "border-border bg-surface/70"}`}>
              <div className="flex min-w-0 items-start justify-between gap-2">
                <button type="button" onClick={() => editChapter(chapter)} className="min-w-0 flex-1 text-left">
                  <span className="block truncate text-sm font-bold">Cap. {formatChapter(chapter.number)}</span>
                  <span className="block truncate text-xs text-muted-foreground">{chapter.title || "Sem título"}</span>
                </button>
                <span className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase ${chapter.published ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"}`}>
                  {chapter.published ? "Publicado" : "Rascunho"}
                </span>
              </div>
              <div className="mt-2 flex justify-end gap-1">
                <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => editChapter(chapter)} aria-label="Editar capítulo" title="Editar capítulo">
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <ConfirmDelete title={`Excluir capítulo ${formatChapter(chapter.number)}?`} description="O texto e os comentários ligados a este capítulo serão apagados permanentemente." onConfirm={() => remove.mutate(chapter.id)}>
                  <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-destructive" aria-label="Excluir capítulo" title="Excluir capítulo">
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </ConfirmDelete>
              </div>
            </div>
          ))}
          {visibleChapters.length === 0 ? <p className="py-8 text-center text-xs text-muted-foreground">Nenhum capítulo encontrado.</p> : null}
        </div>
      </aside>

      <form
        className="flex min-w-0 flex-col overflow-hidden rounded-lg border border-border bg-background/60"
        onSubmit={(e) => {
          e.preventDefault();
          publish.mutate();
        }}
      >
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-border px-4 py-3 sm:px-5">
          <div className="min-w-0">
            <h3 className="truncate font-display text-base font-bold">{editingId ? `Editando capítulo ${formatChapter(Number(number))}` : "Novo capítulo"}</h3>
            <p className="truncate text-[11px] text-muted-foreground">Salvamento automático ativo neste aparelho</p>
          </div>
          <Button type="button" variant="ghost" size="sm" className="shrink-0" onClick={() => setShowPreview((shown) => !shown)}>
            <Eye className="h-4 w-4" /> <span className="hidden sm:inline">{showPreview ? "Editar texto" : "Pré-visualizar"}</span>
          </Button>
        </div>
        <div className="grid grid-cols-1 gap-3 px-4 pt-4 sm:grid-cols-[120px_minmax(0,1fr)] sm:px-5">
          <div className="space-y-1.5">
            <Label>Número</Label>
            <Input value={number} onChange={(e) => setNumber(e.target.value)} inputMode="decimal" className="bg-background" />
          </div>
          <div className="space-y-1.5">
            <Label>Título (opcional)</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} className="bg-background" />
          </div>
        </div>
        <div className="mt-3 flex flex-1 flex-col space-y-1.5 px-4 sm:px-5">
          <div className="flex flex-col gap-2 rounded-md border border-border bg-surface/60 p-2 sm:flex-row">
            <Input
              value={importUrl}
              onChange={(e) => setImportUrl(e.target.value)}
              placeholder="Cole o link do capítulo para importar o texto"
              className="bg-background"
            />
            <Button type="button" variant="outline" disabled={importing || !importUrl.trim()} onClick={runImport} className="shrink-0">
              {importing ? "Importando..." : "Importar do link"}
            </Button>
          </div>
          <div className="space-y-2 rounded-md border border-border bg-surface/60 p-2">
            <Textarea
              value={htmlPaste}
              onChange={(e) => setHtmlPaste(e.target.value)}
              placeholder="Cole aqui o código HTML da página do capítulo (Ctrl+A, Ctrl+C na página salva)"
              className="min-h-[90px] resize-y bg-background font-mono text-[11px]"
              maxLength={2000000}
            />
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] text-muted-foreground">O sistema tira só o texto do capítulo e preenche número, título e texto.</p>
              <Button
                type="button"
                variant="outline"
                className="shrink-0"
                disabled={!htmlPaste.trim()}
                onClick={() => {
                  const r = prepareChapterText(htmlPaste);
                  if (r.content.length < 10) { toast.error("Não encontrei texto de capítulo nesse HTML."); return; }
                  applyImport(r);
                  setHtmlPaste("");
                }}
              >
                Extrair texto
              </Button>
            </div>
          </div>
          <div className="flex flex-col gap-2 rounded-md border border-dashed border-primary/40 bg-primary/5 p-2 sm:flex-row sm:items-center">
            <p className="min-w-0 flex-1 text-[11px] text-muted-foreground">
              {bulk ? `Cadastrando ${bulk.done}/${bulk.total}...` : "Envie várias páginas salvas (.html ou .txt) para cadastrar vários capítulos de uma vez."}
            </p>
            <label className={`inline-flex shrink-0 cursor-pointer items-center justify-center rounded-md border border-border bg-background px-3 py-2 text-sm font-medium hover:bg-surface ${bulk ? "pointer-events-none opacity-50" : ""}`}>
              Enviar vários arquivos
              <input type="file" multiple accept=".html,.htm,.txt,text/html,text/plain" className="hidden" onChange={(e) => { const f = Array.from(e.target.files ?? []); e.target.value = ""; if (f.length) runBulk(f); }} />
            </label>
          </div>
          <label className="flex items-center gap-2 text-[11px] text-muted-foreground"><input type="checkbox" checked={bulkPublish} onChange={(e) => setBulkPublish(e.target.checked)} /> Publicar direto os capítulos enviados em lote</label>
          <p className="text-[11px] text-muted-foreground">Também pode colar o HTML da página salva no campo de texto: ele é convertido automaticamente.</p>
          <Label className="sr-only">Texto do capítulo</Label>
          {showPreview ? (
            <article className="min-h-[420px] flex-1 rounded-md border border-border bg-surface px-5 py-8 text-[17px] leading-8 text-foreground/90 sm:px-10 lg:min-h-[520px]">
              {paragraphs.length ? paragraphs.map((paragraph, index) => <p key={index} className="mb-5 text-justify last:mb-0">{paragraph}</p>) : <p className="text-center text-sm text-muted-foreground">A prévia aparecerá aqui.</p>}
            </article>
          ) : (
            <Textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              onPaste={(e) => {
                const html = e.clipboardData.getData("text/plain");
                if (/<\/?(p|div|br|h[1-6])[\s>/]/i.test(html)) {
                  e.preventDefault();
                  applyImport(prepareChapterText(html));
                }
              }}
              placeholder="Cole ou escreva o texto aqui. Separe os parágrafos com uma linha em branco."
              className="min-h-[420px] flex-1 resize-y border-0 bg-transparent px-1 py-5 text-base leading-8 shadow-none focus-visible:ring-0 sm:px-4 lg:min-h-[520px]"
              maxLength={500000}
            />
          )}
          <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-border py-3 text-[11px] text-muted-foreground">
            <span>{content.length.toLocaleString("pt-BR")} caracteres</span>
            <span>{wordCount.toLocaleString("pt-BR")} palavras</span>
            <span>{readingMinutes} min de leitura</span>
          </div>
        </div>
        <div className="grid gap-3 border-t border-border bg-surface-2/25 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:px-5">
          <label className="flex cursor-pointer items-center gap-3 text-sm">
            <input type="checkbox" checked={published} onChange={(e) => setPublished(e.target.checked)} className="h-4 w-4 accent-primary" />
            <span><b>{published ? "Publicar agora" : "Salvar como rascunho"}</b><small className="block text-muted-foreground">{published ? "O capítulo ficará visível aos leitores." : "Somente a equipe poderá acessá-lo."}</small></span>
          </label>
          <Button type="submit" disabled={publish.isPending || content.trim().length < 10} className="font-semibold">
            {editingId ? <Save className="mr-2 h-4 w-4" /> : <Send className="mr-2 h-4 w-4" />}
            {publish.isPending ? "Salvando…" : editingId ? "Salvar alterações" : published ? "Publicar capítulo" : "Salvar rascunho"}
          </Button>
        </div>
      </form>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  required,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input value={value} required={required} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} className="bg-background" />
    </div>
  );
}
