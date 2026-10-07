import { useState, type ReactNode } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import {
  ArrowDownWideNarrow,
  BookOpen,
  Check,
  CheckCheck,
  ChevronDown,
  Eye,
  Forward,
  Search,
  Sparkles,
  EyeOff,
  Heart,
  MessageCircle,
  MessageSquare,
  Play,
  RotateCcw,
  Send,
  Star,
} from "lucide-react";
import { toast } from "sonner";
import { SiteFooter, SiteHeader } from "@/components/SiteHeader";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { fetchComments, fetchSeriesBySlug } from "@/lib/queries";
import { coverUrl, formatChapter, timeAgo } from "@/lib/media";
import { useSession } from "@/hooks/useAuth";
import { AddToListButton, StatusButton } from "@/components/SeriesActions";
import { CommentThreads } from "@/components/CommentThreads";
import { CommentComposer, type CommentDraft } from "@/components/CommentComposer";
import { uploadCommentImage } from "@/lib/comments";

export const Route = createFileRoute("/obra/$slug/")({
  staticData: { sitemap: true },
  loader: ({ params, context }) =>
    context.queryClient.ensureQueryData({
      queryKey: ["series", params.slug],
      queryFn: () => fetchSeriesBySlug(params.slug),
    }),
  head: ({ params, loaderData }) => {
    const title = loaderData?.title ?? params.slug.replace(/-/g, " ");
    const description = (loaderData?.synopsis ?? `Leia ${title} online no Better Mangá.`)
      .replace(/<[^>]*>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 160);
    const url = `https://bettermanga.net/obra/${encodeURIComponent(params.slug)}`;
    const image = loaderData?.cover_url?.startsWith("https://") ? loaderData.cover_url : null;
    return {
      meta: [
        { title: `${title} — Better Mangá` },
        { name: "description", content: description },
        { property: "og:title", content: `${title} — Better Mangá` },
        { property: "og:description", content: description },
        { property: "og:type", content: "book" },
        { property: "og:url", content: url },
        { name: "twitter:card", content: image ? "summary_large_image" : "summary" },
        ...(image
          ? [
              { property: "og:image", content: image },
              { name: "twitter:image", content: image },
            ]
          : []),
      ],
      links: [{ rel: "canonical", href: url }],
    };
  },
  component: SeriesPage,
});

function SeriesPage() {
  const { slug } = Route.useParams();
  const { user } = useSession();
  const queryClient = useQueryClient();
  const [order, setOrder] = useState<"asc" | "desc">("desc");
  const [expanded, setExpanded] = useState(false);
  const [replyTo, setReplyTo] = useState<{ id: string; username: string } | null>(null);
  const [chapterSearch, setChapterSearch] = useState("");
  const [commentSort, setCommentSort] = useState<"new" | "old">("new");

  const series = useSuspenseQuery({
    queryKey: ["series", slug],
    queryFn: () => fetchSeriesBySlug(slug),
  });

  const favorite = useQuery({
    queryKey: ["favorite", slug, user?.id],
    enabled: Boolean(user && series.data),
    queryFn: async () => {
      const { data } = await supabase
        .from("favorites")
        .select("series_id")
        .eq("user_id", user!.id)
        .eq("series_id", series.data!.id)
        .maybeSingle();
      return Boolean(data);
    },
  });

  const history = useQuery({
    queryKey: ["history", slug, user?.id],
    enabled: Boolean(user && series.data),
    queryFn: async () => {
      const { data } = await supabase
        .from("reading_history")
        .select("chapter_id, progress, chapters(number)")
        .eq("user_id", user!.id)
        .eq("series_id", series.data!.id);
      return (data ?? []) as unknown as Array<{
        chapter_id: string | null;
        progress: number;
        chapters: { number: number } | null;
      }>;
    },
  });

  const myRating = useQuery({
    queryKey: ["my-rating", slug, user?.id],
    enabled: Boolean(user && series.data),
    queryFn: async () => {
      const { data } = await supabase
        .from("ratings")
        .select("score")
        .eq("user_id", user!.id)
        .eq("series_id", series.data!.id)
        .maybeSingle();
      return data?.score ?? 0;
    },
  });

  const ratingStats = useQuery({
    queryKey: ["rating-stats", series.data?.id],
    enabled: Boolean(series.data),
    queryFn: async () => {
      const { data } = await supabase
        .from("ratings")
        .select("score")
        .eq("series_id", series.data!.id);
      const rows = data ?? [];
      const avg = rows.length
        ? rows.reduce((sum, row) => sum + row.score, 0) / rows.length
        : 0;
      return { count: rows.length, avg };
    },
  });

  const comments = useQuery({
    queryKey: ["comments", series.data?.id],
    enabled: Boolean(series.data),
    queryFn: () => fetchComments(series.data!.id),
  });

  const recommended = useQuery({
    queryKey: ["recommended", series.data?.id],
    enabled: Boolean(series.data && series.data.genres.length),
    queryFn: async () => {
      const { data } = await supabase
        .from("series")
        .select("id, slug, title, cover_url")
        .eq("published", true)
        .overlaps("genres", series.data!.genres)
        .neq("id", series.data!.id)
        .order("views", { ascending: false })
        .limit(6);
      return data ?? [];
    },
  });

  const chapterReads = useQuery({
    queryKey: ["chapter-reads", slug, user?.id],
    enabled: Boolean(user && series.data),
    queryFn: async () => {
      const chapterIds = series.data!.chapters.map((c) => c.id);
      if (chapterIds.length === 0) return new Set<string>();
      const { data } = await supabase
        .from("chapter_reads")
        .select("chapter_id")
        .eq("user_id", user!.id)
        .in("chapter_id", chapterIds);
      return new Set((data ?? []).map((row) => row.chapter_id));
    },
  });

  const chapterCommentCounts = useQuery({
    queryKey: ["chapter-comment-counts", series.data?.id],
    enabled: Boolean(series.data),
    queryFn: async () => {
      const { data } = await supabase
        .from("comments")
        .select("chapter_id")
        .eq("series_id", series.data!.id)
        .not("chapter_id", "is", null);
      const counts = new Map<string, number>();
      for (const row of data ?? []) {
        if (row.chapter_id)
          counts.set(row.chapter_id, (counts.get(row.chapter_id) ?? 0) + 1);
      }
      return counts;
    },
  });

  const toggleFavorite = useMutation({
    mutationFn: async () => {
      if (!user || !series.data) throw new Error("Entre para favoritar.");
      if (favorite.data) {
        const { error } = await supabase
          .from("favorites")
          .delete()
          .eq("user_id", user.id)
          .eq("series_id", series.data.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("favorites")
          .insert({ user_id: user.id, series_id: series.data.id });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["favorite", slug, user?.id] });
      queryClient.invalidateQueries({ queryKey: ["favorites", user?.id] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Erro"),
  });

  const rate = useMutation({
    mutationFn: async (score: number) => {
      if (!user || !series.data) throw new Error("Entre para avaliar.");
      const { error } = await supabase
        .from("ratings")
        .upsert(
          { user_id: user.id, series_id: series.data.id, score },
          { onConflict: "user_id,series_id" },
        );
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-rating", slug, user?.id] });
      queryClient.invalidateQueries({ queryKey: ["rating-stats", series.data?.id] });
      queryClient.invalidateQueries({ queryKey: ["series", slug] });
      toast.success("Avaliação registrada!");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Erro"),
  });

  const postComment = useMutation({
    mutationFn: async (draft: CommentDraft) => {
      if (!user || !series.data) throw new Error("Entre para comentar.");
      const imageUrl = draft.image ? await uploadCommentImage(user.id, draft.image) : null;
      const { error } = await supabase.from("comments").insert({
        series_id: series.data.id,
        user_id: user.id,
        body: draft.body,
        is_spoiler: draft.isSpoiler,
        image_url: imageUrl,
        parent_id: replyTo?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setReplyTo(null);
      queryClient.invalidateQueries({ queryKey: ["comments", series.data?.id] });
      toast.success("Comentário publicado!");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Erro"),
  });

  const toggleRead = useMutation({
    mutationFn: async (chapter: { id: string; isRead: boolean }) => {
      if (!user || !series.data) throw new Error("Entre para marcar como lido.");
      if (chapter.isRead) {
        const { error } = await supabase
          .from("chapter_reads")
          .delete()
          .eq("user_id", user.id)
          .eq("chapter_id", chapter.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("chapter_reads")
          .upsert(
            { user_id: user.id, chapter_id: chapter.id },
            { onConflict: "user_id,chapter_id" },
          );
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["chapter-reads", slug, user?.id] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Erro"),
  });

  const markAll = useMutation({
    mutationFn: async (mode: "read" | "unread") => {
      if (!user || !series.data) throw new Error("Entre para marcar como lido.");
      const chapterIds = series.data.chapters.map((c) => c.id);
      if (chapterIds.length === 0) return;
      if (mode === "unread") {
        const { error } = await supabase
          .from("chapter_reads")
          .delete()
          .eq("user_id", user.id)
          .in("chapter_id", chapterIds);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("chapter_reads")
          .upsert(
            chapterIds.map((chapter_id) => ({ user_id: user.id, chapter_id })),
            { onConflict: "user_id,chapter_id" },
          );
        if (error) throw error;
      }
    },
    onSuccess: (_data, mode) => {
      queryClient.invalidateQueries({ queryKey: ["chapter-reads", slug, user?.id] });
      toast.success(
        mode === "read" ? "Todos marcados como lidos!" : "Leitura desmarcada!",
      );
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Erro"),
  });

  const obra = series.data;
  if (!obra) {
    return (
      <div className="min-h-screen">
        <SiteHeader />
        <div className="mx-auto max-w-5xl px-4 py-16">
          <h1 className="font-display text-2xl font-extrabold">Obra não encontrada</h1>
          <Button asChild className="mt-6">
            <Link to="/">Voltar ao início</Link>
          </Button>
        </div>
      </div>
    );
  }

  const chapters = order === "asc" ? obra.chapters : [...obra.chapters].reverse();
  const readIds = chapterReads.data ?? new Set<string>();
  const lastRead = (history.data ?? [])
    .map((entry) => entry.chapters?.number)
    .filter((n): n is number => typeof n === "number")
    .sort((a, b) => b - a)[0];
  const continueChapter =
    obra.chapters.find((c) => c.number === lastRead) ??
    obra.chapters.find((c) => !readIds.has(c.id)) ??
    obra.chapters[0];

  const firstChapter = obra.chapters.reduce<(typeof obra.chapters)[number] | undefined>((a, b) => (!a || Number(b.number) < Number(a.number) ? b : a), undefined);
  const lastChapter = obra.chapters.reduce<(typeof obra.chapters)[number] | undefined>((a, b) => (!a || Number(b.number) > Number(a.number) ? b : a), undefined);
  const q = chapterSearch.trim().toLowerCase();
  const visibleChapters = q
    ? chapters.filter((c) => formatChapter(c.number).includes(q) || (c.title ?? "").toLowerCase().includes(q))
    : chapters;
  const sortedComments = commentSort === "new" ? (comments.data ?? []) : [...(comments.data ?? [])].reverse();
  const synopsisLong = (obra.synopsis ?? "").length > 320;
  const stats = ratingStats.data ?? { count: 0, avg: 0 };
  const average = stats.count > 0 ? stats.avg : Number(obra.rating) || 0;

  return (
    <div className="min-h-screen">
      <SiteHeader />

      <div className="relative">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-[520px] overflow-hidden">
          <img
            src={coverUrl(obra.banner_url ?? obra.cover_url)}
            alt=""
            className="h-full w-full scale-110 object-cover opacity-30 blur-2xl"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-background/40 via-background/80 to-background" />
        </div>

        <main className="relative z-10 mx-auto max-w-7xl px-4 pb-10 pt-6 md:px-8 md:pt-14">
          <button
            type="button"
            onClick={() => window.history.back()}
            className="mb-6 flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground md:mb-8"
          >
            <ChevronDown className="h-4 w-4 rotate-90" /> Voltar
          </button>
          <div className="flex flex-col items-center gap-6 md:flex-row md:items-start md:gap-12 lg:gap-16">
            {/* Cover */}
            <div className="flex flex-col items-center md:w-[260px] md:shrink-0">
              <div className="mb-2 flex flex-wrap justify-center gap-2 md:hidden">
                <span className="rounded-full border border-border bg-surface-2 px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{obra.kind}</span>
                <span className="rounded-full border border-emerald-400/30 bg-emerald-500/15 px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-emerald-300">{obra.status}</span>
              </div>
              <img
                src={coverUrl(obra.cover_url)}
                alt={obra.title}
                className="aspect-[2/3] w-[240px] rounded-2xl border border-border object-cover shadow-2xl md:w-full md:rounded-xl"
              />
            </div>

            {/* Info */}
            <div className="w-full flex-1 text-center md:text-left">
              <div className="mb-3 hidden flex-wrap items-center gap-3 md:flex">
                <span className="rounded border border-border px-2 py-0.5 text-[10px] font-bold uppercase text-muted-foreground">{obra.kind}</span>
                <span className="rounded border border-emerald-500/30 px-2 py-0.5 text-[10px] font-bold uppercase text-emerald-400">{obra.status}</span>
              </div>
              <h1 className="font-display text-2xl font-black leading-tight md:text-3xl">{obra.title}</h1>
              {obra.alt_titles ? (
                <p className="mt-1 text-xs text-muted-foreground">{obra.alt_titles}</p>
              ) : null}

              <div className="mt-3 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-muted-foreground md:justify-start">
                <span className="inline-flex items-center gap-1.5"><BookOpen className="h-4 w-4" /> {obra.chapters.length} capítulos</span>
                <span className="inline-flex items-center gap-1.5 font-bold text-gold"><Star className="h-4 w-4 fill-gold" /> {average.toFixed(1).replace(".", ",")}</span>
                <span className="inline-flex items-center gap-1.5"><MessageCircle className="h-4 w-4" /> {comments.data?.length ?? 0}</span>
              </div>

              <div className="mt-4 flex flex-wrap justify-center gap-1.5 md:justify-start md:gap-2">
                {obra.genres.map((genre) => (
                  <span key={genre} className="rounded-lg border border-border bg-surface-2/60 px-2.5 py-1 text-xs text-muted-foreground">{genre}</span>
                ))}
              </div>

              {obra.author || obra.artist ? (
                <p className="mt-3 text-sm text-muted-foreground">
                  {obra.author ? `Autor: ${obra.author}` : ""}
                  {obra.author && obra.artist ? " · " : ""}
                  {obra.artist ? `Arte: ${obra.artist}` : ""}
                </p>
              ) : null}

              {obra.synopsis ? (
                <div className="mt-4 text-left">
                  <p className={`whitespace-pre-line text-sm leading-relaxed text-foreground/80 ${expanded ? "" : "line-clamp-4"}`}>
                    {obra.synopsis}
                  </p>
                  {synopsisLong ? (
                    <button onClick={() => setExpanded(!expanded)} className="mt-2 flex items-center gap-1 text-sm font-semibold text-primary">
                      <ChevronDown className={`h-4 w-4 transition-transform ${expanded ? "rotate-180" : ""}`} />
                      {expanded ? "Ver menos" : "Ver mais"}
                    </button>
                  ) : null}
                </div>
              ) : null}

              {/* Actions */}
              <div className="mt-6 flex flex-wrap justify-center gap-2 md:justify-start">
                {obra.chapters.length > 0 ? (
                  <Link
                    to="/obra/$slug/$chapter"
                    params={{ slug: obra.slug, chapter: formatChapter((readIds.size > 0 && continueChapter ? continueChapter : firstChapter!).number) }}
                    className="flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-xs font-black uppercase tracking-wider text-primary-foreground shadow-lg shadow-primary/25 transition hover:brightness-110 active:scale-[0.97]"
                  >
                    <Play className="h-3.5 w-3.5 fill-current" />
                    {readIds.size > 0 && continueChapter ? `Continuar cap. ${formatChapter(continueChapter.number)}` : "Ler primeiro"}
                  </Link>
                ) : null}
                {lastChapter ? (
                  <Link
                    to="/obra/$slug/$chapter"
                    params={{ slug: obra.slug, chapter: formatChapter(lastChapter.number) }}
                    className="flex items-center gap-2 rounded-full bg-foreground/[0.06] px-4 py-2.5 text-xs font-black uppercase tracking-wider text-muted-foreground transition hover:bg-foreground/10 hover:text-foreground active:scale-[0.97]"
                  >
                    <Forward className="h-3.5 w-3.5" /> Ler último
                  </Link>
                ) : null}
              </div>

              <div className="mt-3 flex flex-wrap items-center justify-center gap-2 md:justify-start">
                {user ? (
                  <>
                    <button
                      type="button"
                      onClick={() => toggleFavorite.mutate()}
                      disabled={toggleFavorite.isPending}
                      className={`flex items-center gap-1.5 rounded-full px-4 py-2 text-[11px] font-black uppercase tracking-wider transition disabled:opacity-50 ${
                        favorite.data
                          ? "bg-rose-500 text-white shadow-lg shadow-rose-500/25 hover:bg-rose-400"
                          : "bg-foreground/[0.06] text-muted-foreground hover:bg-foreground/10 hover:text-foreground"
                      }`}
                    >
                      <Heart className={`h-3.5 w-3.5 ${favorite.data ? "fill-current" : ""}`} />
                      {favorite.data ? "Favoritado" : "Favoritar"}
                    </button>
                    <AddToListButton userId={user.id} seriesId={obra.id} />
                    <span className="mx-0.5 hidden h-4 w-px bg-border sm:block" />
                    <StatusButton userId={user.id} seriesId={obra.id} />
                  </>
                ) : (
                  <Link to="/auth" className="flex items-center gap-1.5 rounded-full bg-foreground/[0.06] px-4 py-2 text-[11px] font-black uppercase tracking-wider text-muted-foreground hover:text-foreground">
                    <Heart className="h-3.5 w-3.5" /> Entrar para favoritar
                  </Link>
                )}
              </div>
            </div>
          </div>
        </main>

        <div className="relative z-10 mx-auto max-w-7xl px-4 pb-10 pt-4 md:px-8 md:pt-8">
          <div className="grid grid-cols-1 items-start gap-10 lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-12">
            {/* Chapters */}
            <section className="min-w-0">
              <Tabs defaultValue="chapters">
                <div className="overflow-hidden rounded-2xl border border-border bg-surface/60">
                <TabsList className="h-12 w-full justify-start gap-6 rounded-none border-b border-border bg-transparent px-4 md:px-5">
                  <TabsTrigger value="chapters" className="h-full gap-2 rounded-none border-b-2 border-transparent px-1 data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-primary data-[state=active]:shadow-none"><BookOpen className="h-4 w-4" />Capítulos</TabsTrigger>
                  <TabsTrigger value="information" className="h-full gap-2 rounded-none border-b-2 border-transparent px-1 data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-primary data-[state=active]:shadow-none"><Eye className="h-4 w-4" />Informações</TabsTrigger>
                </TabsList>
                <TabsContent value="information" className="mt-0 p-4 md:p-5">
                  <h2 className="mb-5 font-display text-lg font-bold">{obra.title}</h2>
                  <dl className="divide-y divide-border text-sm">
                    {[
                      ["Tipo", obra.kind],
                      ["Status", obra.status],
                      ["Capítulos", String(obra.chapters.length)],
                      ["Autor", obra.author || "Não informado"],
                      ["Artista", obra.artist || "Não informado"],
                      ["Gêneros", obra.genres.join(", ") || "Não informado"],
                      ["Última atualização", new Date(obra.updated_at).toLocaleDateString("pt-BR")],
                    ].map(([label, value]) => <div key={label} className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-4 py-4"><dt className="text-muted-foreground">{label}</dt><dd className="min-w-0 break-words font-medium">{value}</dd></div>)}
                  </dl>
                </TabsContent>
                <TabsContent value="chapters" className="mt-6">
              <div className="rounded-2xl border border-border bg-surface/60 p-4 md:p-5">
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                   <span className="text-sm text-muted-foreground">{obra.chapters.length} capítulos</span>
                  <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:justify-end">
                    {user ? (
                      <>
                        <ToolbarButton disabled={markAll.isPending || chapters.length === 0} onClick={() => markAll.mutate("read")} icon={<CheckCheck className="h-3.5 w-3.5" />} label="Marcar todos" />
                        <ToolbarButton disabled={markAll.isPending || readIds.size === 0} onClick={() => markAll.mutate("unread")} icon={<RotateCcw className="h-3.5 w-3.5" />} label="Desmarcar todos" />
                      </>
                    ) : null}
                    <ToolbarButton
                      onClick={() => setOrder(order === "asc" ? "desc" : "asc")}
                      icon={<ArrowDownWideNarrow className={`h-3.5 w-3.5 text-primary ${order === "asc" ? "rotate-180" : ""}`} />}
                      label={order === "desc" ? "Recentes" : "Antigos"}
                    />
                  </div>
                </div>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-4 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/60" />
                  <input
                    value={chapterSearch}
                    onChange={(e) => setChapterSearch(e.target.value)}
                    placeholder="Escolher capítulo..."
                    aria-label="Buscar capítulo"
                    className="w-full rounded-md border border-border bg-surface py-3 pl-10 pr-4 text-[13px] outline-none transition placeholder:text-muted-foreground/50 focus:border-primary/40 focus:bg-surface-2"
                  />
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {firstChapter ? <Button asChild className="h-11 gap-2"><Link to="/obra/$slug/$chapter" params={{ slug: obra.slug, chapter: formatChapter(firstChapter.number) }}><Play className="h-4 w-4" />Primeiro capítulo</Link></Button> : null}
                  {lastChapter ? <Button asChild variant="outline" className="h-11 gap-2 border-primary/40 text-primary"><Link to="/obra/$slug/$chapter" params={{ slug: obra.slug, chapter: formatChapter(lastChapter.number) }}><Forward className="h-4 w-4" />Capítulo mais recente</Link></Button> : null}
                </div>
              </div>
              <ul className="mt-4 max-h-[70vh] divide-y divide-border/60 overflow-y-auto rounded-xl border border-border bg-background/40">
                {visibleChapters.map((chapter) => {
                  const isRead = readIds.has(chapter.id);
                  const commentCount = chapterCommentCounts.data?.get(chapter.id) ?? 0;
                  return (
                    <li key={chapter.id} className={`flex items-center gap-4 px-4 py-3.5 transition hover:bg-foreground/[0.02] ${isRead ? "opacity-60 hover:opacity-90" : ""}`}>
                      <Link
                        to="/obra/$slug/$chapter"
                        params={{ slug: obra.slug, chapter: formatChapter(chapter.number) }}
                        className="flex min-w-0 flex-1 items-center gap-4 text-left"
                      >
                         <span className="relative h-14 w-11 shrink-0 overflow-hidden rounded-md bg-surface-2">
                           <img src={coverUrl(obra.cover_url)} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
                           {isRead ? <span className="absolute inset-0 grid place-items-center bg-background/70 text-primary"><Check className="h-[18px] w-[18px]" strokeWidth={2.5} /></span> : null}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className={`block truncate font-medium ${isRead ? "text-emerald-500/90" : ""}`}>
                            Capítulo {formatChapter(chapter.number)}
                            {chapter.title ? <span className="ml-2 font-normal text-muted-foreground">{chapter.title}</span> : null}
                          </span>
                          <span className="mt-1 flex flex-wrap items-center gap-1.5">
                            <span className="text-xs font-medium text-muted-foreground/70">{timeAgo(chapter.created_at)}</span>
                            {isRead ? (
                              <span className="rounded border border-emerald-500/20 bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-emerald-400">Lido</span>
                            ) : null}
                          </span>
                        </span>
                      </Link>
                      {commentCount > 0 ? (
                        <span className="inline-flex items-center gap-1 text-xs tabular-nums text-muted-foreground/60" title="Comentários">
                          <MessageSquare className="h-3.5 w-3.5" /> {commentCount}
                        </span>
                      ) : null}
                      {user ? (
                        <button
                          type="button"
                          disabled={toggleRead.isPending}
                          onClick={() => toggleRead.mutate({ id: chapter.id, isRead })}
                          title={isRead ? "Marcar como não lido" : "Marcar como lido"}
                          aria-label={isRead ? "Marcar como não lido" : "Marcar como lido"}
                          className={`shrink-0 rounded-xl border p-2 transition ${isRead ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20" : "border-border bg-foreground/[0.02] text-muted-foreground/50 hover:border-primary/30 hover:bg-primary/10 hover:text-primary"}`}
                        >
                          {isRead ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      ) : null}
                    </li>
                  );
                })}
                {visibleChapters.length === 0 ? (
                  <li className="px-5 py-8 text-center text-sm text-muted-foreground">
                    {chapterSearch ? "Nenhum capítulo encontrado." : "Nenhum capítulo publicado ainda."}
                  </li>
                ) : null}
              </ul>
              <p className="pt-4 text-center text-xs text-muted-foreground">Total de capítulos encontrados: {visibleChapters.length}</p>
              </div>
              </TabsContent>
              </Tabs>
            </section>

            {/* Sidebar */}
            <aside className="min-w-0 space-y-8">
              <section>
                <h2 className="flex items-center gap-3 border-b border-border pb-4 font-display text-base font-bold"><Sparkles className="h-4 w-4 text-primary" />Obras relacionadas</h2>
                <div className="mt-5 grid grid-cols-2 gap-x-4 gap-y-6">
                  {(recommended.data ?? []).map((r) => (
                    <Link key={r.id} to="/obra/$slug" params={{ slug: r.slug }} className="group min-w-0">
                      <div className="aspect-[2/3] overflow-hidden rounded-md bg-surface-2"><img src={coverUrl(r.cover_url)} alt={r.title} loading="lazy" decoding="async" className="h-full w-full object-cover transition-transform duration-300 motion-reduce:transition-none group-hover:scale-105" /></div>
                      <p className="mt-2 line-clamp-2 text-[13px] font-bold leading-snug group-hover:text-primary">{r.title}</p>
                    </Link>
                  ))}
                </div>
                {!recommended.isLoading && !recommended.data?.length ? <p className="py-4 text-sm text-muted-foreground">Nenhuma obra relacionada disponível.</p> : null}
              </section>
              <div className="border-t border-border pt-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-bold">Avaliar</h3>
                    <p className="text-xs text-muted-foreground">Dê sua nota de 1 a 10.</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-black text-gold">
                      {average.toFixed(1).replace(".", ",")} <span className="text-[11px] font-medium text-muted-foreground">/ 10</span>
                    </p>
                    <p className="text-[11px] text-muted-foreground">{stats.count} avaliações</p>
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-5 gap-2">
                  {Array.from({ length: 10 }, (_, i) => i + 1).map((score) => (
                    <button
                      key={score}
                      disabled={rate.isPending}
                      onClick={() => (user ? rate.mutate(score) : toast.info("Entre para avaliar."))}
                      className={`h-10 rounded-xl border text-sm font-bold transition ${
                        score === (myRating.data ?? 0)
                          ? "border-gold/50 bg-gold/15 text-gold"
                          : "border-border bg-foreground/[0.03] text-foreground/80 hover:border-primary/40 hover:text-primary"
                      }`}
                    >
                      {score}
                    </button>
                  ))}
                </div>
              </div>

              <div className="border-t border-border pt-5">
                <div className="flex items-start gap-3">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-rose-500/10 text-rose-400"><Heart className="h-4 w-4" /></span>
                  <div>
                    <h3 className="text-sm font-bold">Apoiar a obra</h3>
                    <p className="text-xs text-muted-foreground">O valor é repassado aos responsáveis pelos capítulos.</p>
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-3 gap-2">
                  {["R$ 5", "R$ 10", "R$ 15"].map((v) => (
                    <button key={v} onClick={() => toast.info("Apoio em breve!")} className="h-10 rounded-xl border border-border bg-foreground/[0.03] text-sm font-bold hover:border-primary/40">{v}</button>
                  ))}
                </div>
                <button onClick={() => toast.info("Apoio em breve!")} className="mt-2 h-10 w-full rounded-xl border border-border bg-foreground/[0.03] text-sm font-semibold hover:border-primary/40">Personalizado</button>
                <button onClick={() => toast.info("Apoio em breve!")} className="mt-3 h-10 w-full rounded-xl bg-rose-500/80 text-sm font-bold text-white hover:bg-rose-500">Apoiar agora</button>
              </div>
            </aside>
          </div>

          {/* Comments */}
          <section className="mx-auto mt-14 max-w-4xl rounded-2xl border border-border bg-surface/60 p-5 md:p-8">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary/10 text-primary"><MessageCircle className="h-4 w-4" /></span>
                <div>
                  <h2 className="text-sm font-bold">Comentários</h2>
                  <p className="text-xs text-muted-foreground">{comments.data?.length ?? 0} comentários</p>
                </div>
              </div>
              <div className="flex gap-1.5">
                {([["new", "Mais Recentes"], ["old", "Mais Antigos"]] as const).map(([k, label]) => (
                  <button
                    key={k}
                    onClick={() => setCommentSort(k)}
                    className={`rounded-full px-3 py-1.5 text-[11px] font-semibold transition ${commentSort === k ? "bg-primary text-primary-foreground" : "bg-foreground/[0.06] text-muted-foreground hover:text-foreground"}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            {user ? (
              <div className="mt-6">
                <CommentComposer
                  pending={postComment.isPending}
                  onSubmit={(draft) => postComment.mutate(draft)}
                  replyTo={replyTo?.username ?? null}
                  onCancelReply={() => setReplyTo(null)}
                />
              </div>
            ) : (
              <p className="mt-6 text-sm text-muted-foreground">
                <Link to="/auth" className="text-primary">Entre</Link> para comentar.
              </p>
            )}
            <ul className="mt-8 space-y-5">
              <CommentThreads
              comments={sortedComments}
              userId={user?.id}
              onReply={user ? (c) => setReplyTo({ id: c.id, username: c.author?.username ?? "leitor" }) : undefined}
            />
            </ul>
          </section>
        </div>
      </div>
      <SiteFooter />
    </div>
  );
}

function ToolbarButton({ icon, label, onClick, disabled }: { icon: ReactNode; label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="flex items-center justify-center gap-1.5 rounded-full border border-border bg-foreground/[0.03] px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground transition hover:bg-foreground/[0.08] hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
    >
      {icon}
      {label}
    </button>
  );
}
