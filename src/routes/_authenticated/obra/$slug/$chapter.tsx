import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { AlignJustify, BookOpen, CalendarDays, ChevronDown, ChevronLeft, ChevronRight, ChevronsDown, Home, List, Maximize2, MessageCircle, Minus, Moon, Palette, Plus, RotateCw, Settings2, SunMedium } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { fetchCommentAuthors, fetchCommentParents, fetchSeriesBySlug } from "@/lib/queries";
import { coverUrl, formatChapter, timeAgo } from "@/lib/media";
import { useSession } from "@/hooks/useAuth";
import { CommentThreads } from "@/components/CommentThreads";
import { CommentComposer, type CommentDraft } from "@/components/CommentComposer";
import { uploadCommentImage } from "@/lib/comments";
import { parseNovelContent } from "@/lib/novel-content";
import { NovelNarrator } from "@/components/NovelNarrator";
import { chapterQueryOptions } from "@/lib/chapter-query";
import { activeProfileId, hasProfileChosen, isWorkAllowed, useActiveProfile } from "@/lib/active-profile";
import { KidsBlocked } from "@/components/KidsBlocked";

export const Route = createFileRoute("/_authenticated/obra/$slug/$chapter")({
  staticData: { sitemap: false },
  beforeLoad: ({ context }) => {
    if (!context.user || !hasProfileChosen(context.user.id)) throw redirect({ to: "/perfis" });
  },
  loader: async ({ params, context }) => {
    const series = await context.queryClient.ensureQueryData({
      queryKey: ["series", params.slug],
      queryFn: () => fetchSeriesBySlug(params.slug),
    });
    const current = series?.chapters.find((item) => formatChapter(item.number) === params.chapter);
    if (current) await context.queryClient.ensureQueryData(chapterQueryOptions(current.id));
    return series;
  },
  head: ({ params, loaderData }) => {
    const seriesTitle = loaderData?.title ?? params.slug.replace(/-/g, " ");
    const chapterLabel = params.chapter.replace(/-/g, " ");
    const title = `Capítulo ${chapterLabel} — ${seriesTitle}`;
    const description = `Leia o capítulo ${chapterLabel} de ${seriesTitle} online no Better Mangá.`;
    const url = `https://bettermanga.net/obra/${encodeURIComponent(params.slug)}/${encodeURIComponent(params.chapter)}`;
    const image = loaderData?.cover_url?.startsWith("https://") ? loaderData.cover_url : null;
    return {
      meta: [
        { title: `${title} — Better Mangá` },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "article" },
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
  component: Reader,
});

function Reader() {
  const series = Route.useLoaderData();
  const { slug, chapter } = Route.useParams();
  const current = series?.chapters.find((item) => formatChapter(item.number) === chapter);
  if (!current) return <div className="grid min-h-screen place-items-center px-4 text-center"><div>
    <h1 className="font-display text-2xl font-bold">Capítulo não encontrado</h1>
    <Button asChild className="mt-6"><Link to="/obra/$slug" params={{ slug }}>Ver a obra</Link></Button>
  </div></div>;
  return <ChapterReader key={current.id} chapterId={current.id} />;
}

function ChapterReader({ chapterId }: { chapterId: string }) {
  const { slug, chapter } = Route.useParams();
  const navigate = useNavigate();
  const { user } = useSession();
  const activeProfile = useActiveProfile();

  const series = useSuspenseQuery({
    queryKey: ["series", slug],
    queryFn: () => fetchSeriesBySlug(slug),
  });
  const { data: chapterContent } = useSuspenseQuery(chapterQueryOptions(chapterId));

  const obra = series.data;
  const index = useMemo(
    () => obra?.chapters.findIndex((item) => formatChapter(item.number) === chapter) ?? -1,
    [obra, chapter],
  );
  const current = obra && index >= 0 ? obra.chapters[index] : undefined;
  const prev = obra && index > 0 ? obra.chapters[index - 1] : undefined;
  const next = obra && index >= 0 && index < obra.chapters.length - 1 ? obra.chapters[index + 1] : undefined;

  const pages = useMemo(() => {
    const raw = (chapterContent?.pages ?? []) as unknown;
    return Array.isArray(raw) ? (raw.filter((item) => typeof item === "string") as string[]) : [];
  }, [chapterContent]);

  // Próximo capítulo pronto antes do toque: dados e as primeiras páginas começam a baixar na metade da leitura.
  const prefetchClient = useQueryClient();
  useEffect(() => {
    if (!next) return;
    let done = false;
    const warm = async () => {
      if (done) return;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      if (max > 0 && window.scrollY / max < 0.5) return;
      done = true;
      window.removeEventListener("scroll", warm);
      const data = await prefetchClient.fetchQuery(chapterQueryOptions(next.id)).catch(() => null);
      const firstPages = Array.isArray(data?.pages) ? (data.pages as unknown[]).filter((u): u is string => typeof u === "string").slice(0, 3) : [];
      for (const url of firstPages) { const img = new Image(); img.decoding = "async"; img.src = url; }
    };
    window.addEventListener("scroll", warm, { passive: true });
    return () => { done = true; window.removeEventListener("scroll", warm); };
  }, [next, prefetchClient]);

  const isNovel = obra?.kind === "Novel";
  const novelBlocks = useMemo(
    () => isNovel ? parseNovelContent(chapterContent?.content ?? "") : [],
    [chapterContent, isNovel],
  );
  // Empty entries preserve DOM paragraph indexes while narration skips illustrations.
  const paragraphs = useMemo(() => novelBlocks.map((block) => block.type === "text" ? block.text : ""), [novelBlocks]);
  const [fontSize, setFontSize] = useState(18);
  const [lineHeight, setLineHeight] = useState(1.9);
  const [readingWidth, setReadingWidth] = useState<"narrow" | "comfortable" | "wide">("comfortable");
  const [novelTheme, setNovelTheme] = useState<"dark" | "soft">("dark");
  const [showNovelSettings, setShowNovelSettings] = useState(false);
  const [speakingIndex, setSpeakingIndex] = useState<number | null>(null);

  const queryClient = useQueryClient();
  const [replyTo, setReplyTo] = useState<{ id: string; username: string } | null>(null);

  const comments = useQuery({
    queryKey: ["chapter-comments", current?.id],
    enabled: Boolean(current),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("comments")
        .select("id, body, created_at, user_id, is_spoiler, image_url, parent_id")
        .eq("chapter_id", current?.id ?? "")
        .order("created_at", { ascending: false })
        .limit(80);
      if (error) throw error;
      const rows = data ?? [];
      const ids = [...new Set(rows.map((row) => row.user_id))];
      const [authors, parents] = await Promise.all([fetchCommentAuthors(ids), fetchCommentParents(rows)]);
      return rows.map((row) => ({
        ...row,
        author: authors.get(row.user_id) ?? null,
        parent: row.parent_id ? (parents.get(row.parent_id) ?? null) : null,
      }));
    },
  });

  const postComment = useMutation({
    mutationFn: async (draft: CommentDraft) => {
      if (!user || !obra || !current) throw new Error("Entre para comentar.");
      const imageUrl = draft.image ? await uploadCommentImage(user.id, draft.image) : null;
      const { error } = await supabase.from("comments").insert({
        series_id: obra.id,
        chapter_id: current.id,
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
      queryClient.invalidateQueries({ queryKey: ["chapter-comments", current?.id] });
      toast.success("Comentário publicado!");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Erro"),
  });

  // Save chapter + exact scroll position; restore where the user stopped.
  useEffect(() => {
    if (!user || !obra || !current) return;
    let cancelled = false;
    let lastPos = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const progress = Math.round(((index + 1) / Math.max(obra.chapters.length, 1)) * 100);

    // Os pedidos do Supabase só saem quando alguém pede o resultado (.then/await): sem isso a posição
    // de leitura e o "lido" podiam nunca ser gravados.
    const save = (pos: number) => {
      void supabase.from("reading_history").upsert(
        {
          user_id: user.id,
          profile_id: activeProfileId(),
          series_id: obra.id,
          chapter_id: current.id,
          progress,
          scroll_pos: pos,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,profile_id,series_id" },
      ).then(({ error }) => { if (error) console.warn("Histórico de leitura não salvo:", error.message); });
      if (pos > 0.9) {
        void supabase
          .from("chapter_reads")
          .upsert(
            { user_id: user.id, chapter_id: current.id },
            { onConflict: "user_id,chapter_id" },
          )
          .then(({ error }) => { if (error) console.warn("Capítulo lido não salvo:", error.message); });
      }
    };

    const currentPos = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      return max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
    };

    (async () => {
      const { data } = await supabase
        .from("reading_history")
        .select("chapter_id, scroll_pos")
        .eq("user_id", user.id).eq("profile_id", activeProfileId())
        .eq("series_id", obra.id)
        .maybeSingle();
      if (cancelled) return;
      const saved = data?.chapter_id === current.id ? Number(data.scroll_pos) || 0 : 0;
      lastPos = saved;
      void save(saved);
      if (saved > 0.01 && saved < 0.99) {
        // wait for images to lay out, then jump
        let tries = 0;
        const jump = () => {
          const max = document.documentElement.scrollHeight - window.innerHeight;
          window.scrollTo({ top: saved * max });
          if (++tries < 8 && !cancelled) setTimeout(jump, 400);
        };
        jump();
        toast.info("Continuando de onde você parou");
      }
    })();

    const onScroll = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const pos = currentPos();
        if (Math.abs(pos - lastPos) > 0.01) {
          lastPos = pos;
          void save(pos);
        }
      }, 800);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      cancelled = true;
      clearTimeout(timer);
      window.removeEventListener("scroll", onScroll);
      const pos = currentPos();
      if (Math.abs(pos - lastPos) > 0.01) void save(pos);
    };
  }, [user, obra, current, index]);

  useEffect(() => {
    if (!obra) return;
    void supabase.rpc("increment_series_views", { _series_id: obra.id }).then(({ error }) => {
      if (error) console.warn("Leitura não contada:", error.message);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [obra?.id, chapter]);

  // Página atual (para o contador) e direção da rolagem (a barra de baixo some enquanto você lê).
  const [pageNow, setPageNow] = useState(1);
  const [scrollingDown, setScrollingDown] = useState(false);
  const [atTop, setAtTop] = useState(true);
  const [nearEnd, setNearEnd] = useState(false);
  useEffect(() => {
    let frame = 0;
    let lastY = window.scrollY;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const y = window.scrollY;
        if (y > lastY + 6) setScrollingDown(true);
        else if (y < lastY - 6) setScrollingDown(false);
        lastY = y;
        setAtTop(y < 140);
        setNearEnd(y + window.innerHeight > document.documentElement.scrollHeight - 900);
        // Página atual: a última que já começou antes do meio da tela. Imagens ainda sem altura
        // (não carregadas) não contam, senão todas pareceriam estar no topo.
        const middle = window.innerHeight * 0.5;
        let current = 1;
        const imgs = document.querySelectorAll<HTMLElement>("[data-reader-page]");
        for (let i = 0; i < imgs.length; i++) {
          const box = imgs[i]!.getBoundingClientRect();
          if (box.height < 24) continue;
          if (box.top > middle) break;
          current = i + 1;
        }
        setPageNow(current);
      });
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    // Cada página que termina de carregar muda a altura da página: recalcula sem esperar rolar.
    document.addEventListener("load", update, true);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      document.removeEventListener("load", update, true);
    };
  }, [chapterId]);

  if (obra && !isWorkAllowed(obra.age_rating, activeProfile)) return <KidsBlocked />;
  if (!obra || !current) {
    return (
      <div className="grid min-h-screen place-items-center px-4 text-center">
        <div>
          <h1 className="font-display text-2xl font-bold">Capítulo não encontrado</h1>
          <Button asChild className="mt-6">
            <Link to="/obra/$slug" params={{ slug }}>
              Ver a obra
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  function go(direction: "prev" | "next") {
    const target = direction === "prev" ? prev : next;
    if (!target) return;
    navigate({
      to: "/obra/$slug/$chapter",
      params: { slug, chapter: formatChapter(target.number) },
    });
  }

  const iconBtn =
    "grid h-9 w-9 place-items-center rounded-md text-foreground/90 transition hover:bg-surface-2 hover:text-primary disabled:opacity-30 disabled:pointer-events-none";

  const novelWidth = {
    narrow: "max-w-2xl",
    comfortable: "max-w-3xl",
    wide: "max-w-4xl",
  }[readingWidth];

  const chapterOptions = [...obra.chapters].reverse();
  const position = index + 1;
  const total = obra.chapters.length;
  const workPercent = total ? Math.round((position / total) * 100) : 0;
  const chapterSelect = (
    <select
      className="reader-chapter-select"
      aria-label="Escolher capítulo"
      title="Escolher capítulo"
      value={chapter}
      onChange={(event) => navigate({ to: "/obra/$slug/$chapter", params: { slug, chapter: event.target.value } })}
    >
      {chapterOptions.map((item) => (
        <option key={item.id} value={formatChapter(item.number)}>Cap. {formatChapter(item.number)}</option>
      ))}
    </select>
  );

  const novelControl =
    "h-9 border-border/80 bg-surface/80 text-muted-foreground shadow-none hover:bg-surface-2 hover:text-foreground";

  return (
    <div className={`min-h-screen pb-20 sm:pb-0 ${isNovel && novelTheme === "soft" ? "bg-surface" : "bg-background"}`}>
      {isNovel ? (
        <header className="reader-toolbar sticky top-0 z-40 border-b border-border/70 bg-background/95 backdrop-blur-xl">
          <div className="mx-auto flex h-14 max-w-7xl items-center gap-2 px-3 sm:px-6">
            <Button asChild variant="ghost" size="icon" aria-label="Voltar para a obra" title="Voltar para a obra">
              <Link to="/obra/$slug" params={{ slug }}>
                <ChevronLeft className="h-5 w-5" />
              </Link>
            </Button>
            <Link
              to="/obra/$slug"
              params={{ slug }}
              className="min-w-0 text-sm font-semibold text-foreground/80 transition-colors hover:text-primary"
            >
              <span className="hidden max-w-72 truncate sm:block">{obra.title}</span>
              <BookOpen className="h-5 w-5 sm:hidden" />
            </Link>
            <span aria-hidden="true" className="hidden text-border sm:block">·</span>
            <span className="truncate text-sm font-bold">Capítulo {formatChapter(current.number)}</span>

            <div className="ml-auto flex items-center gap-1">
              <span className="hidden sm:block">{chapterSelect}</span>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShowNovelSettings((open) => !open)}
                aria-label="Opções de leitura"
                aria-expanded={showNovelSettings}
                title="Opções de leitura"
                className={showNovelSettings ? "bg-surface-2 text-primary" : undefined}
              >
                <Settings2 className="h-5 w-5" />
              </Button>
              <Button asChild variant="ghost" size="icon" aria-label="Lista de capítulos" title="Lista de capítulos">
                <Link to="/obra/$slug" params={{ slug }}>
                  <List className="h-5 w-5" />
                </Link>
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="hidden sm:inline-flex"
                aria-label="Tela cheia"
                title="Tela cheia"
                onClick={() =>
                  document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen()
                }
              >
                <Maximize2 className="h-5 w-5" />
              </Button>
              <Button asChild variant="ghost" size="icon" aria-label="Início" title="Início">
                <Link to="/">
                  <Home className="h-5 w-5" />
                </Link>
              </Button>
            </div>
          </div>

          <span className="reader-progress" aria-hidden="true" />
          {showNovelSettings ? (
            <div className="border-t border-border/60 bg-background/95 px-3 py-3 shadow-lg">
              <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-center gap-2 sm:justify-end">
                <div className="flex items-center overflow-hidden rounded-md border border-border/80" aria-label="Tamanho da fonte">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="rounded-none"
                    onClick={() => setFontSize((size) => Math.max(14, size - 2))}
                    aria-label="Diminuir fonte"
                  >
                    <Minus className="h-4 w-4" />
                  </Button>
                  <span className="min-w-11 border-x border-border/80 px-2 text-center text-xs font-bold tabular-nums">
                    {fontSize}px
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="rounded-none"
                    onClick={() => setFontSize((size) => Math.min(28, size + 2))}
                    aria-label="Aumentar fonte"
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  className={novelControl}
                  onClick={() => setLineHeight((height) => (height >= 2.1 ? 1.65 : Number((height + 0.2).toFixed(2))))}
                  title="Alternar espaçamento entre linhas"
                >
                  <AlignJustify className="h-4 w-4" /> {lineHeight.toFixed(2)}
                </Button>

                <div className="flex items-center overflow-hidden rounded-md border border-border/80" aria-label="Largura do texto">
                  {(["narrow", "comfortable", "wide"] as const).map((width, widthIndex) => (
                    <Button
                      key={width}
                      variant="ghost"
                      size="sm"
                      className={`rounded-none px-3 ${readingWidth === width ? "bg-surface-2 text-primary" : "text-muted-foreground"}`}
                      onClick={() => setReadingWidth(width)}
                      aria-label={`Largura ${["estreita", "confortável", "ampla"][widthIndex]}`}
                      title={`Largura ${["estreita", "confortável", "ampla"][widthIndex]}`}
                    >
                      {widthIndex + 1}
                    </Button>
                  ))}
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  className={novelControl}
                  onClick={() => setNovelTheme((theme) => (theme === "dark" ? "soft" : "dark"))}
                >
                  {novelTheme === "dark" ? <Moon className="h-4 w-4" /> : <SunMedium className="h-4 w-4" />}
                  {novelTheme === "dark" ? "Escuro" : "Suave"}
                </Button>
              </div>
            </div>
          ) : null}
        </header>
      ) : (
      <header className="reader-toolbar sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-1 px-2 sm:gap-2 sm:px-8">
          <Button variant="ghost" size="icon" type="button" onClick={() => history.back()} className={iconBtn} aria-label="Voltar">
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <Link to="/obra/$slug" params={{ slug }} className="ml-1 hidden items-center gap-1.5 text-sm font-bold hover:text-primary sm:flex">
            <BookOpen className="h-4 w-4" /> Obra
          </Link>
          <h1 className="ml-1 flex min-w-0 flex-col text-xs sm:ml-3 sm:flex-row sm:items-center sm:gap-2 sm:text-sm">
            <span className="max-w-[42vw] truncate text-muted-foreground sm:max-w-72">{obra.title}</span>
            <span className="shrink-0 font-bold text-primary">Cap. {formatChapter(current.number)}{pages.length ? <span className="ml-2 hidden text-xs font-medium text-muted-foreground md:inline">{pages.length} páginas</span> : null}</span>
          </h1>
          <div className="ml-auto flex items-center gap-1">
            <span className="hidden sm:block">{chapterSelect}</span>
            <Button variant="ghost" size="icon" type="button" disabled={!prev} onClick={() => go("prev")} className={iconBtn} aria-label="Capítulo anterior">
              <ChevronLeft className="h-5 w-5" />
            </Button>
            <Button variant="ghost" size="icon" type="button" disabled={!next} onClick={() => go("next")} className={iconBtn} aria-label="Próximo capítulo">
              <ChevronRight className="h-5 w-5" />
            </Button>
            <Link to="/obra/$slug" params={{ slug }} className={`${iconBtn} hidden sm:grid`} aria-label="Lista de capítulos" title="Lista de capítulos">
              <List className="h-5 w-5" />
            </Link>
            <Button
              variant="ghost"
              size="icon"
              type="button"
              className={`${iconBtn} hidden sm:grid`}
              aria-label="Escurecer páginas"
              title="Escurecer páginas"
              onClick={() => document.documentElement.classList.toggle("reader-dim")}
            >
              <Palette className="h-5 w-5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              type="button"
              className={iconBtn}
              aria-label="Ir para o fim"
              onClick={() => window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" })}
            >
              <ChevronsDown className="h-5 w-5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              type="button"
              className={`${iconBtn} hidden sm:grid`}
              aria-label="Tela cheia"
              onClick={() =>
                document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen()
              }
            >
              <Maximize2 className="h-5 w-5" />
            </Button>
            <Link to="/" className={iconBtn} aria-label="Início">
              <Home className="h-5 w-5" />
            </Link>
          </div>
        </div>
        <span className="reader-progress" aria-hidden="true" />
      </header>
      )}

      <main className={`mx-auto ${isNovel ? novelWidth : "max-w-3xl"}`}>
        {isNovel ? (
          <article className="px-5 pb-16 pt-10 sm:px-8 sm:pt-14">
            <header className="mb-10 border-b border-border/70 pb-7 text-center">
              <p className="mb-2 text-[13px] font-semibold text-primary">{obra.title}</p>
              <h1 className="font-display text-2xl font-bold sm:text-3xl">
                Capítulo {formatChapter(current.number)}
              </h1>
              {current.title ? <p className="mt-3 text-sm text-muted-foreground">{current.title}</p> : null}
            </header>
            {paragraphs.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">
                Este capítulo ainda não tem texto.
              </p>
            ) : (
              <>
                <NovelNarrator
                  paragraphs={paragraphs}
                  activeIndex={speakingIndex}
                  onActiveChange={setSpeakingIndex}
                />
                <div
                  className="space-y-6 text-foreground/90 [&_p]:text-justify"
                  style={{ fontSize: `${fontSize}px`, lineHeight }}
                >
                  {novelBlocks.map((block, paragraphIndex) => block.type === "image" ? (
                    <figure key={paragraphIndex} className="my-8">
                      <img src={block.src} alt={`Ilustração do capítulo ${formatChapter(current.number)}`}
                        loading="lazy" decoding="async" referrerPolicy="no-referrer"
                        className="mx-auto h-auto max-w-full rounded-md" />
                    </figure>
                  ) : (
                    <p
                      key={paragraphIndex}
                      id={`novel-p-${paragraphIndex}`}
                      onClick={() => setSpeakingIndex(paragraphIndex)}
                      className={`cursor-pointer rounded-md transition-colors ${speakingIndex === paragraphIndex ? "bg-primary/15 text-foreground" : ""}`}
                    >
                      {block.text}
                    </p>
                  ))}
                </div>
              </>
            )}
          </article>
        ) : pages.length === 0 ? (
          <p className="p-16 text-center text-sm text-muted-foreground">
            Este capítulo ainda não tem páginas.
          </p>
        ) : (
          pages.map((page, pageIndex) => <ReaderPage key={`${page}-${pageIndex}`} src={page} index={pageIndex} />)
        )}
      </main>

      <div className={`mx-auto ${isNovel ? novelWidth : "max-w-3xl"} px-4 py-10`}>
        <div className="reader-end p-5 sm:p-7">
          <div className="flex items-start gap-4">
            <Link to="/obra/$slug" params={{ slug }} className="hidden shrink-0 sm:block">
              <img src={coverUrl(obra.cover_url)} alt={`Capa de ${obra.title}`} loading="lazy" decoding="async" className="h-28 w-[74px] rounded-md object-cover" />
            </Link>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-semibold text-primary">Fim do capítulo {formatChapter(current.number)}</p>
              <p className="mt-1 font-display text-xl font-bold sm:text-2xl">{next ? `A seguir: capítulo ${formatChapter(next.number)}` : "Você está em dia com esta obra"}</p>
              {next?.title ? <p className="mt-1 truncate text-sm text-muted-foreground">{next.title}</p> : null}
              <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5" />Publicado {timeAgo(current.created_at)}</span>
                {pages.length ? <span>{pages.length} páginas</span> : null}
                <span className="tabular-nums">Capítulo {position} de {total}</span>
              </p>
              <div className="work-progress-bar mt-3" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={workPercent} aria-label="Andamento na obra"><span style={{ width: `${Math.max(workPercent, 2)}%` }} /></div>
            </div>
          </div>
          <div className="mt-5 flex flex-wrap items-center gap-2">
            {next ? (
              <Button onClick={() => go("next")} className="h-10 px-5">
                Ler capítulo {formatChapter(next.number)} <ChevronRight className="ml-1 h-4 w-4" />
              </Button>
            ) : null}
            <Button variant="secondary" disabled={!prev} onClick={() => go("prev")} className="h-10">
              <ChevronLeft className="mr-1 h-4 w-4" /> Anterior
            </Button>
            <Button asChild variant="ghost" className="h-10">
              <Link to="/obra/$slug" params={{ slug }}>
                <List className="mr-1 h-4 w-4" /> Todos os capítulos
              </Link>
            </Button>
          </div>
        </div>
      </div>

      <section className="mx-auto max-w-3xl px-4 pb-16">
        <h2 className="section-title">
          <MessageCircle className="h-[18px] w-[18px] text-primary" /> Comentários do capítulo
        </h2>
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
            <Link to="/auth" className="text-primary">
              Entre
            </Link>{" "}
            para comentar.
          </p>
        )}

        <ul className="mt-6 space-y-5">
          <CommentThreads
              comments={(comments.data ?? [])}
              userId={user?.id}
              onReply={user ? (c) => setReplyTo({ id: c.id, username: c.author?.username ?? "leitor" }) : undefined}
            />
          {(comments.data ?? []).length === 0 && !comments.isLoading ? (
            <li className="py-6 text-center text-sm text-muted-foreground">
              Seja o primeiro a comentar este capítulo.
            </li>
          ) : null}
        </ul>
      </section>

      {pages.length > 0 && !isNovel ? (
        <div className="reader-page-pill hidden sm:inline-flex" data-hidden={atTop || nearEnd ? "true" : "false"} aria-live="polite">
          Página <b>{pageNow}</b> de {pages.length}
        </div>
      ) : null}
      <nav className="reader-mobile-bar" data-hidden={scrollingDown && !atTop && !nearEnd ? "true" : "false"} aria-label="Navegação do capítulo">
        <Button variant="outline" size="icon" type="button" disabled={!prev} onClick={() => go("prev")} className="h-10 w-10 shrink-0" aria-label="Capítulo anterior">
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <div className="min-w-0 flex-1 text-center leading-tight">
          <div className="flex justify-center">{chapterSelect}</div>
          <p className="mt-1 text-[11px] font-semibold text-muted-foreground tabular-nums">
            {pages.length && !isNovel ? `Página ${pageNow} de ${pages.length}` : `Capítulo ${position} de ${total}`}
          </p>
        </div>
        <Button size="icon" type="button" disabled={!next} onClick={() => go("next")} className="h-10 w-10 shrink-0" aria-label="Próximo capítulo">
          <ChevronRight className="h-5 w-5" />
        </Button>
      </nav>
    </div>
  );
}

/**
 * Página do capítulo. Até carregar, guarda espaço na tela: assim o carregamento sob demanda baixa só as
 * páginas perto de quem lê (antes todas começavam juntas e as primeiras demoravam) e a leitura não pula.
 * Se a página falhar, um toque tenta de novo sem recarregar o capítulo.
 */
function ReaderPage({ src, index }: { src: string; index: number }) {
  const [state, setState] = useState<"loading" | "ok" | "error">("loading");
  const [attempt, setAttempt] = useState(0);
  const url = attempt ? `${src}${src.includes("?") ? "&" : "?"}tentativa=${attempt}` : src;
  return (
    <div className="reader-page" data-state={state}>
      {state === "error" ? (
        <div className="reader-page-error" role="alert">
          <p>A página {index + 1} não carregou.</p>
          <Button size="sm" variant="secondary" onClick={() => { setState("loading"); setAttempt((n) => n + 1); }}><RotateCw /> Tentar de novo</Button>
        </div>
      ) : (
        <img
          key={url}
          src={url}
          alt={`Página ${index + 1}`}
          data-reader-page=""
          loading={index < 3 ? "eager" : "lazy"}
          decoding="async"
          fetchPriority={index === 0 ? "high" : "auto"}
          className="w-full"
          onLoad={() => setState("ok")}
          onError={() => setState("error")}
        />
      )}
    </div>
  );
}
