import { useState, type ReactNode } from "react";
import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import {
  ArrowDownWideNarrow,
  BookOpen,
  Check,
  CheckCheck,
  ChevronDown,
  Clock,
  Eye,
  Forward,
  Search,
  EyeOff,
  Heart,
  MessageCircle,
  MessageSquare,
  Play,
  RotateCcw,
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
import { normalizeGenres } from "@/lib/work-genres";
import { ageRatingLabel } from "@/lib/age-ratings";
import { AgeRatingBadge } from "@/components/AgeRatingBadge";
import { KidsBlocked } from "@/components/KidsBlocked";
import { activeProfileId, hasProfileChosen, isWorkAllowed, useActiveProfile } from "@/lib/active-profile";
import { chapterSubtitle, compactNumber, formatRating } from "@/lib/format";
import { kindLabel } from "@/lib/work-categories";
/** Capítulo publicado nos últimos 3 dias. */
const isFresh = (iso: string) => Date.now() - new Date(iso).getTime() < 3 * 24 * 60 * 60 * 1000;
/** Obras longas: atalhos de 100 em 100 capítulos para não rolar a lista inteira. */
const RANGE_SIZE = 100;
/**
 * Listas de ids de capítulo vão ao banco em partes: numa obra com centenas de capítulos, um endereço
 * com todos os ids passa do limite do servidor e o pedido falha (os "Lido" e o progresso sumiam).
 */
const ID_CHUNK = 150;
const chunk = <T,>(items: readonly T[]): T[][] =>
  Array.from({ length: Math.ceil(items.length / ID_CHUNK) }, (_, i) => items.slice(i * ID_CHUNK, (i + 1) * ID_CHUNK));

export const Route = createFileRoute("/_authenticated/obra/$slug/")({
  staticData: { sitemap: false },
  beforeLoad: ({ context }) => {
    if (!context.user || !hasProfileChosen(context.user.id)) throw redirect({ to: "/perfis" });
  },
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
  const activeProfile = useActiveProfile();
  const queryClient = useQueryClient();
  const [order, setOrder] = useState<"asc" | "desc">("desc");
  const [expanded, setExpanded] = useState(false);
  const [replyTo, setReplyTo] = useState<{ id: string; username: string } | null>(null);
  const [chapterSearch, setChapterSearch] = useState("");
  const [commentSort, setCommentSort] = useState<"new" | "old">("new");
  const [range, setRange] = useState<number | null>(null);

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
        .eq("user_id", user!.id).eq("profile_id", activeProfileId())
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
        .eq("user_id", user!.id).eq("profile_id", activeProfileId())
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
      const byScore = Array.from({ length: 10 }, (_, i) => rows.filter((row) => Math.round(row.score) === i + 1).length);
      return { count: rows.length, avg, byScore };
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
        .select("id, slug, title, cover_url, age_rating")
        .eq("published", true)
        .overlaps("genres", series.data!.genres)
        .neq("id", series.data!.id)
        .order("views", { ascending: false })
        .limit(12);
      return (data ?? []).filter((row) => isWorkAllowed(row.age_rating)).slice(0, 6);
    },
  });

  const chapterReads = useQuery({
    queryKey: ["chapter-reads", slug, user?.id],
    enabled: Boolean(user && series.data),
    queryFn: async () => {
      const chapterIds = series.data!.chapters.map((c) => c.id);
      if (chapterIds.length === 0) return new Set<string>();
      const parts = await Promise.all(chunk(chapterIds).map(async (ids) => {
        const { data, error } = await supabase
          .from("chapter_reads")
          .select("chapter_id")
          .eq("user_id", user!.id)
          .in("chapter_id", ids);
        if (error) throw error;
        return data ?? [];
      }));
      return new Set(parts.flat().map((row) => row.chapter_id));
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
          .eq("user_id", user.id).eq("profile_id", activeProfileId())
          .eq("series_id", series.data.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("favorites")
          .insert({ user_id: user.id, profile_id: activeProfileId(), series_id: series.data.id });
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
        for (const ids of chunk(chapterIds)) {
          const { error } = await supabase
            .from("chapter_reads")
            .delete()
            .eq("user_id", user.id)
            .in("chapter_id", ids);
          if (error) throw error;
        }
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
          <h1 className="font-display text-2xl font-bold">Obra não encontrada</h1>
          <Button asChild className="mt-6">
            <Link to="/">Voltar ao início</Link>
          </Button>
        </div>
      </div>
    );
  }

  if (!isWorkAllowed(obra.age_rating, activeProfile)) return <div className="min-h-screen"><SiteHeader /><KidsBlocked /></div>;

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
  const ranges = obra.chapters.length > RANGE_SIZE
    ? Array.from({ length: Math.ceil(obra.chapters.length / RANGE_SIZE) }, (_, i) => {
        const slice = obra.chapters.slice(i * RANGE_SIZE, (i + 1) * RANGE_SIZE);
        return { from: slice[0]?.number ?? 0, to: slice[slice.length - 1]?.number ?? 0, ids: new Set(slice.map((c) => c.id)) };
      })
    : [];
  const activeRange = range !== null ? ranges[range] : undefined;
  const visibleChapters = (q
    ? chapters.filter((c) => formatChapter(c.number).includes(q) || (c.title ?? "").toLowerCase().includes(q))
    : chapters).filter((c) => q || !activeRange || activeRange.ids.has(c.id));
  const sortedComments = commentSort === "new" ? (comments.data ?? []) : [...(comments.data ?? [])].reverse();
  const synopsisLong = (obra.synopsis ?? "").length > 320;
  const stats = ratingStats.data ?? { count: 0, avg: 0, byScore: Array.from({ length: 10 }, () => 0) };
  const maxScoreCount = Math.max(1, ...stats.byScore);
  const readCount = obra.chapters.filter((c) => readIds.has(c.id)).length;
  const readPercent = obra.chapters.length ? Math.round((readCount / obra.chapters.length) * 100) : 0;
  const average = stats.count > 0 ? stats.avg : Number(obra.rating) || 0;

  const startChapter = readIds.size > 0 && continueChapter ? continueChapter : firstChapter;
  const genreChips = normalizeGenres(obra.genres).map((genre) => (
    <Link key={genre} to="/catalogo" search={{ tag: genre }} title={`Ver obras de ${genre}`} className="chip chip-sm">{genre}</Link>
  ));
  // Ações da obra: mesmas no celular e no computador, todas no mesmo tamanho e em caixa normal.
  const workActions = (
    <div className="flex flex-wrap items-center gap-2">
      {startChapter ? (
        <Button asChild className="h-10">
          <Link to="/obra/$slug/$chapter" params={{ slug: obra.slug, chapter: formatChapter(startChapter.number) }}>
            <Play className="h-4 w-4 fill-current" />
            {readIds.size > 0 && continueChapter ? `Continuar cap. ${formatChapter(continueChapter.number)}` : `Ler cap. ${formatChapter(startChapter.number)}`}
          </Link>
        </Button>
      ) : null}
      {lastChapter && lastChapter.id !== startChapter?.id ? (
        <Button asChild variant="secondary" className="h-10">
          <Link to="/obra/$slug/$chapter" params={{ slug: obra.slug, chapter: formatChapter(lastChapter.number) }}>
            <Forward className="h-4 w-4" /> Último: cap. {formatChapter(lastChapter.number)}
          </Link>
        </Button>
      ) : null}
      {user ? (
        <>
          <Button variant="secondary" className="h-10" aria-pressed={Boolean(favorite.data)} onClick={() => toggleFavorite.mutate()} disabled={toggleFavorite.isPending}>
            <Heart className={`h-4 w-4 ${favorite.data ? "fill-favorite text-favorite" : ""}`} />
            {favorite.data ? "Nos favoritos" : "Favoritar"}
          </Button>
          <AddToListButton userId={user.id} seriesId={obra.id} />
          <StatusButton userId={user.id} seriesId={obra.id} />
        </>
      ) : (
        <Button asChild variant="secondary" className="h-10">
          <Link to="/auth"><Heart className="h-4 w-4" /> Entrar para favoritar</Link>
        </Button>
      )}
    </div>
  );

  return (
    <div className="min-h-screen">
      <SiteHeader />

      <div className="relative isolate">
        <div className="work-banner" aria-hidden="true">
          <img src={coverUrl(obra.banner_url ?? obra.cover_url)} alt="" />
        </div>

        <main className="work-overview relative mx-auto max-w-7xl px-4 pb-6 pt-3 sm:px-6 md:pt-6 lg:px-8">
          <button
            type="button"
            onClick={() => window.history.back()}
            className="mb-3 flex items-center gap-1 text-[13px] font-medium text-muted-foreground hover:text-foreground md:mb-5"
          >
            <ChevronDown className="h-4 w-4 rotate-90" /> Voltar
          </button>
          <div className="grid grid-cols-[112px_minmax(0,1fr)] gap-4 sm:grid-cols-[160px_minmax(0,1fr)] md:grid-cols-[220px_minmax(0,1fr)] md:gap-8">
            <img src={coverUrl(obra.cover_url)} alt={obra.title} className="work-cover aspect-[2/3] w-full object-cover" />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="kind-badge">{kindLabel(obra.kind)}</span>
                {obra.status ? <span className="kind-badge text-new">{obra.status}</span> : null}
                <AgeRatingBadge value={obra.age_rating} size="sm" />
                {lastChapter && isFresh(lastChapter.created_at) ? <span className="chapter-new">Capítulo novo</span> : null}
              </div>
              <h1 className="mt-2 font-display text-xl font-bold leading-tight sm:text-2xl md:text-4xl">{obra.title}</h1>
              {obra.alt_titles ? (
                <p className="mt-1 line-clamp-1 text-[13px] text-muted-foreground md:line-clamp-2">{obra.alt_titles}</p>
              ) : null}
              {obra.author || obra.artist ? (
                <p className="mt-1.5 line-clamp-2 text-[13px] text-muted-foreground">
                  {obra.author ? <>Autor: <span className="text-foreground">{obra.author}</span></> : null}
                  {obra.author && obra.artist ? " · " : ""}
                  {obra.artist ? <>Arte: <span className="text-foreground">{obra.artist}</span></> : null}
                </p>
              ) : null}
              <div className="work-stats mt-3">
                {stats.count ? (
                  <span title={`${stats.count} ${stats.count === 1 ? "avaliação" : "avaliações"}`}><Star className="fill-gold text-gold" /><b>{formatRating(average)}</b><span className="hidden sm:inline">({stats.count})</span></span>
                ) : (
                  <span><Star />Sem nota</span>
                )}
                <span><BookOpen /><b>{obra.chapters.length.toLocaleString("pt-BR")}</b> cap.</span>
                {obra.views > 0 ? <span title={`${obra.views.toLocaleString("pt-BR")} leituras`}><Eye /><b>{compactNumber(obra.views)}</b><span className="hidden sm:inline">leituras</span></span> : null}
                <span><MessageCircle /><b>{comments.data?.length ?? 0}</b></span>
                <span className="hidden sm:inline-flex"><Clock />{timeAgo(lastChapter?.created_at ?? obra.updated_at)}</span>
              </div>
              <div className="mt-4 hidden md:block">
                {workActions}
                <div className="mt-4 flex flex-wrap gap-1.5">{genreChips}</div>
              </div>
            </div>
          </div>

          <div className="mt-4 md:hidden">
            {workActions}
            <div className="chip-row mt-3">{genreChips}</div>
          </div>

          {user && readCount > 0 ? (
            <div className="work-progress mt-4 max-w-3xl">
              <div className="flex flex-wrap items-center justify-between gap-2 text-[13px]">
                <span className="font-semibold">Seu progresso</span>
                <span className="text-muted-foreground tabular-nums">{readCount.toLocaleString("pt-BR")} de {obra.chapters.length.toLocaleString("pt-BR")} capítulos · {readPercent}%</span>
              </div>
              <div className="work-progress-bar mt-2" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={readPercent} aria-label="Capítulos lidos"><span style={{ width: `${Math.max(readPercent, 2)}%` }} /></div>
            </div>
          ) : null}

          {obra.synopsis ? (
            <div className="mt-4 max-w-3xl">
              <p className={`work-synopsis whitespace-pre-line ${expanded ? "" : "line-clamp-4"}`}>{obra.synopsis}</p>
              {synopsisLong ? (
                <button onClick={() => setExpanded(!expanded)} className="mt-1.5 flex items-center gap-1 text-[13px] font-semibold text-primary">
                  <ChevronDown className={`h-4 w-4 transition-transform ${expanded ? "rotate-180" : ""}`} />
                  {expanded ? "Ver menos" : "Ver mais"}
                </button>
              ) : null}
            </div>
          ) : null}
        </main>

        <div className="site-content work-sections mx-auto max-w-7xl px-4 pb-10 pt-2 sm:px-6 md:pt-4 lg:px-8">
          <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-[minmax(0,1fr)_300px] lg:gap-10">
            {/* Capítulos e informações */}
            <section className="min-w-0">
              <Tabs defaultValue="chapters">
                <TabsList className="h-11 w-full justify-start gap-5 rounded-none border-b border-border bg-transparent p-0">
                  <TabsTrigger value="chapters" className="h-full gap-1.5 rounded-none border-b-2 border-transparent px-0.5 text-sm font-semibold data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none">Capítulos <span className="section-count">{obra.chapters.length.toLocaleString("pt-BR")}</span></TabsTrigger>
                  <TabsTrigger value="information" className="h-full gap-1.5 rounded-none border-b-2 border-transparent px-0.5 text-sm font-semibold data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none">Informações</TabsTrigger>
                </TabsList>
                <TabsContent value="information" className="mt-0 pt-2">
                  <dl className="divide-y divide-border text-sm">
                    {([
                      ["Formato", kindLabel(obra.kind)],
                      ["Status", obra.status],
                      ["Capítulos", obra.chapters.length.toLocaleString("pt-BR")],
                      ["Autor", obra.author || "Não informado"],
                      ["Arte", obra.artist || "Não informado"],
                      ["Gêneros", normalizeGenres(obra.genres).join(", ") || "Não informado"],
                      ["Classificação", <span className="flex flex-wrap items-center gap-2"><AgeRatingBadge value={obra.age_rating} size="sm" />{ageRatingLabel(obra.age_rating)}</span>],
                      ["Nota média", `${formatRating(average)} de 10 · ${stats.count} ${stats.count === 1 ? "avaliação" : "avaliações"}`],
                      ["Leituras", obra.views.toLocaleString("pt-BR")],
                      ["Primeiro capítulo", firstChapter ? `Cap. ${formatChapter(firstChapter.number)} · ${new Date(firstChapter.created_at).toLocaleDateString("pt-BR")}` : "—"],
                      ["Capítulo mais recente", lastChapter ? `Cap. ${formatChapter(lastChapter.number)} · ${timeAgo(lastChapter.created_at)}` : "—"],
                      ["No site desde", new Date(obra.created_at).toLocaleDateString("pt-BR")],
                      ["Última atualização", new Date(obra.updated_at).toLocaleDateString("pt-BR")],
                    ] as [string, ReactNode][]).map(([label, value]) => <div key={label} className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-4 py-3"><dt className="text-muted-foreground">{label}</dt><dd className="min-w-0 break-words font-medium">{value}</dd></div>)}
                  </dl>
                </TabsContent>
                <TabsContent value="chapters" className="mt-0 pt-3">
                  <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <input
                        value={chapterSearch}
                        onChange={(e) => setChapterSearch(e.target.value)}
                        placeholder="Buscar capítulo pelo número ou nome"
                        aria-label="Buscar capítulo"
                        inputMode="search"
                        className="h-9 w-full rounded-md border border-border bg-surface-2 pl-9 pr-3 text-[13px] outline-none placeholder:text-muted-foreground focus:border-primary"
                      />
                    </div>
                    <Button
                      variant="secondary"
                      size="icon"
                      onClick={() => setOrder(order === "asc" ? "desc" : "asc")}
                      title={order === "desc" ? "Mais recentes primeiro" : "Mais antigos primeiro"}
                      aria-label={order === "desc" ? "Mostrando os mais recentes primeiro" : "Mostrando os mais antigos primeiro"}
                    >
                      <ArrowDownWideNarrow className={`h-4 w-4 ${order === "asc" ? "rotate-180" : ""}`} />
                    </Button>
                  </div>
                  {user ? (
                    <div className="mt-2 flex flex-wrap items-center justify-end gap-1">
                      <Button variant="ghost" size="sm" disabled={markAll.isPending || chapters.length === 0} onClick={() => markAll.mutate("read")}><CheckCheck className="h-3.5 w-3.5" />Marcar todos como lidos</Button>
                      <Button variant="ghost" size="sm" disabled={markAll.isPending || readIds.size === 0} onClick={() => markAll.mutate("unread")}><RotateCcw className="h-3.5 w-3.5" />Desmarcar todos</Button>
                    </div>
                  ) : null}
                  {ranges.length > 1 && !q ? (
                    <div className="chapter-ranges mt-2" role="group" aria-label="Ir para um trecho dos capítulos">
                      <button type="button" aria-pressed={range === null} onClick={() => setRange(null)}>Todos</button>
                      {ranges.map((item, i) => (
                        <button key={i} type="button" aria-pressed={range === i} onClick={() => setRange(range === i ? null : i)}>
                          {formatChapter(item.from)}–{formatChapter(item.to)}
                        </button>
                      ))}
                    </div>
                  ) : null}
                  <ul className="mt-3 max-h-[70vh] overflow-y-auto rounded-lg border border-border bg-surface">
                    {visibleChapters.map((chapter) => {
                      const isRead = readIds.has(chapter.id);
                      const commentCount = chapterCommentCounts.data?.get(chapter.id) ?? 0;
                      return (
                        <li key={chapter.id} className="chapter-row" data-read={isRead ? "true" : "false"}>
                          <Link
                            to="/obra/$slug/$chapter"
                            params={{ slug: obra.slug, chapter: formatChapter(chapter.number) }}
                            className="min-w-0 flex-1"
                            title={new Date(chapter.created_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })}
                          >
                            <span className="chapter-row-title flex min-w-0 items-center gap-2 text-sm font-semibold">
                              <span className="shrink-0">Cap. {formatChapter(chapter.number)}</span>
                              {chapterSubtitle(chapter.title, chapter.number) ? <span className="truncate font-normal text-muted-foreground">{chapterSubtitle(chapter.title, chapter.number)}</span> : null}
                            </span>
                            <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                              {isFresh(chapter.created_at) ? <span className="chapter-new">Novo</span> : null}
                              {isRead ? <span className="inline-flex items-center gap-1 text-new"><Check className="h-3 w-3" />Lido</span> : null}
                              <span>{timeAgo(chapter.created_at)}</span>
                              {commentCount > 0 ? <span className="inline-flex items-center gap-1" title="Comentários"><MessageSquare className="h-3 w-3" />{commentCount}</span> : null}
                            </span>
                          </Link>
                          {user ? (
                            <Button
                              variant="ghost"
                              size="icon"
                              className={`h-8 w-8 shrink-0 ${isRead ? "text-new" : "text-muted-foreground"}`}
                              disabled={toggleRead.isPending}
                              onClick={() => toggleRead.mutate({ id: chapter.id, isRead })}
                              title={isRead ? "Marcar como não lido" : "Marcar como lido"}
                              aria-label={isRead ? `Marcar capítulo ${formatChapter(chapter.number)} como não lido` : `Marcar capítulo ${formatChapter(chapter.number)} como lido`}
                              aria-pressed={isRead}
                            >
                              {isRead ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </Button>
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
                  {visibleChapters.length !== obra.chapters.length ? (
                    <p className="pt-2 text-xs text-muted-foreground">Mostrando {visibleChapters.length.toLocaleString("pt-BR")} de {obra.chapters.length.toLocaleString("pt-BR")} capítulos</p>
                  ) : null}
                </TabsContent>
              </Tabs>
            </section>

            {/* Lateral */}
            <aside className="min-w-0 space-y-6">
              <section className="side-card">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-[15px] font-bold">Avaliações</h2>
                    <p className="text-xs text-muted-foreground">{stats.count} {stats.count === 1 ? "avaliação" : "avaliações"}</p>
                  </div>
                  <p className="inline-flex items-center gap-1 font-display text-2xl font-bold tabular-nums"><Star className="h-5 w-5 fill-gold text-gold" />{formatRating(average)}</p>
                </div>
                {stats.count > 0 ? (
                  <div className="rating-bars mt-3" aria-label="Distribuição das notas">
                    {[10, 9, 8, 7, 6, 5, 4, 3, 2, 1].map((score) => {
                      const n = stats.byScore[score - 1] ?? 0;
                      return (
                        <div key={score}>
                          <span>{score}</span>
                          <span data-bar=""><span style={{ width: `${(n / maxScoreCount) * 100}%` }} /></span>
                          <span className="text-right">{n}</span>
                        </div>
                      );
                    })}
                  </div>
                ) : null}
                <p className="mt-4 text-[13px] font-semibold">Sua nota</p>
                <div className="mt-2 grid grid-cols-5 gap-1.5">
                  {Array.from({ length: 10 }, (_, i) => i + 1).map((score) => (
                    <button
                      key={score}
                      type="button"
                      disabled={rate.isPending}
                      aria-pressed={score === (myRating.data ?? 0)}
                      onClick={() => (user ? rate.mutate(score) : toast.info("Entre para avaliar."))}
                      className="chip h-9 px-0 tabular-nums"
                    >
                      {score}
                    </button>
                  ))}
                </div>
              </section>

              <section>
                <h2 className="mb-3 text-[15px] font-bold">Obras parecidas</h2>
                <div className="grid grid-cols-3 gap-3 lg:grid-cols-2">
                  {(recommended.data ?? []).map((r) => (
                    <Link key={r.id} to="/obra/$slug" params={{ slug: r.slug }} className="group min-w-0">
                      <div className="series-cover aspect-[2/3] overflow-hidden rounded-md"><img src={coverUrl(r.cover_url)} alt={r.title} loading="lazy" decoding="async" className="h-full w-full object-cover" /></div>
                      <p className="mt-1.5 line-clamp-2 text-[13px] font-semibold leading-snug group-hover:text-primary">{r.title}</p>
                    </Link>
                  ))}
                </div>
                {!recommended.isLoading && !recommended.data?.length ? <p className="py-2 text-sm text-muted-foreground">Nenhuma obra parecida disponível.</p> : null}
              </section>

              <section className="side-card">
                <h2 className="flex items-center gap-2 text-[15px] font-bold"><Heart className="h-4 w-4 text-favorite" />Apoiar a obra</h2>
                <p className="mt-1 text-xs text-muted-foreground">O valor é repassado aos responsáveis pelos capítulos. Em breve.</p>
                <div className="mt-3 grid grid-cols-3 gap-1.5">
                  {["R$ 5", "R$ 10", "R$ 15"].map((v) => (
                    <button key={v} type="button" onClick={() => toast.info("Apoio em breve!")} className="chip h-9 px-0">{v}</button>
                  ))}
                </div>
                <Button variant="secondary" className="mt-2 w-full" onClick={() => toast.info("Apoio em breve!")}>Outro valor</Button>
              </section>
            </aside>
          </div>

          {/* Comentários */}
          <section className="mt-10 max-w-4xl border-t border-border pt-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="section-title"><MessageCircle className="h-[18px] w-[18px] text-primary" />Comentários <span className="section-count">{comments.data?.length ?? 0}</span></h2>
              <div className="flex gap-1.5">
                {([["new", "Mais recentes"], ["old", "Mais antigos"]] as const).map(([k, label]) => (
                  <button key={k} type="button" aria-pressed={commentSort === k} onClick={() => setCommentSort(k)} className="chip chip-sm">{label}</button>
                ))}
              </div>
            </div>
            {user ? (
              <div className="mt-4">
                <CommentComposer
                  pending={postComment.isPending}
                  onSubmit={(draft) => postComment.mutate(draft)}
                  replyTo={replyTo?.username ?? null}
                  onCancelReply={() => setReplyTo(null)}
                />
              </div>
            ) : (
              <p className="mt-4 text-sm text-muted-foreground">
                <Link to="/auth" className="font-semibold text-primary">Entre</Link> para comentar.
              </p>
            )}
            <ul className="mt-6 space-y-5">
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

