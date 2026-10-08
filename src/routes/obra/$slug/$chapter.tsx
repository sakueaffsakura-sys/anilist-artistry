import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { AlignJustify, BookOpen, ChevronDown, ChevronLeft, ChevronRight, ChevronsDown, Home, Infinity, List, Maximize2, MessageCircle, Minus, Moon, Palette, Plus, Settings2, SunMedium } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { fetchCommentAuthors, fetchCommentParents, fetchSeriesBySlug } from "@/lib/queries";
import { formatChapter, timeAgo } from "@/lib/media";
import { useSession } from "@/hooks/useAuth";
import { CommentThreads } from "@/components/CommentThreads";
import { CommentComposer, type CommentDraft } from "@/components/CommentComposer";
import { uploadCommentImage } from "@/lib/comments";
import { parseNovelContent } from "@/lib/novel-content";
import { NovelNarrator } from "@/components/NovelNarrator";

export const Route = createFileRoute("/obra/$slug/$chapter")({
  staticData: { sitemap: false },
  loader: ({ params, context }) =>
    context.queryClient.ensureQueryData({
      queryKey: ["series", params.slug],
      queryFn: () => fetchSeriesBySlug(params.slug),
    }),
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
  const { slug, chapter } = Route.useParams();
  const navigate = useNavigate();
  const { user } = useSession();

  const series = useSuspenseQuery({
    queryKey: ["series", slug],
    queryFn: () => fetchSeriesBySlug(slug),
  });

  const obra = series.data;
  const index = useMemo(
    () => obra?.chapters.findIndex((item) => formatChapter(item.number) === chapter) ?? -1,
    [obra, chapter],
  );
  const current = obra && index >= 0 ? obra.chapters[index] : undefined;
  const prev = obra && index > 0 ? obra.chapters[index - 1] : undefined;
  const next = obra && index >= 0 && index < obra.chapters.length - 1 ? obra.chapters[index + 1] : undefined;

  const pages = useMemo(() => {
    const raw = (current?.pages ?? []) as unknown;
    return Array.isArray(raw) ? (raw.filter((item) => typeof item === "string") as string[]) : [];
  }, [current]);

  const isNovel = obra?.kind === "Novel";
  const novelBlocks = useMemo(
    () => isNovel ? parseNovelContent(current?.content ?? "") : [],
    [current, isNovel],
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

    const save = (pos: number) => {
      void supabase.from("reading_history").upsert(
        {
          user_id: user.id,
          series_id: obra.id,
          chapter_id: current.id,
          progress,
          scroll_pos: pos,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,series_id" },
      );
      if (pos > 0.9) {
        void supabase
          .from("chapter_reads")
          .upsert(
            { user_id: user.id, chapter_id: current.id },
            { onConflict: "user_id,chapter_id" },
          );
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
        .eq("user_id", user.id)
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
    void supabase.rpc("increment_series_views", { _series_id: obra.id });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [obra?.id, chapter]);

  if (!obra || !current) {
    return (
      <div className="grid min-h-screen place-items-center px-4 text-center">
        <div>
          <h1 className="font-display text-2xl font-extrabold">Capítulo não encontrado</h1>
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

  const novelControl =
    "h-9 border-border/80 bg-surface/80 text-muted-foreground shadow-none hover:bg-surface-2 hover:text-foreground";

  return (
    <div className={`min-h-screen ${isNovel && novelTheme === "soft" ? "bg-surface" : "bg-background"}`}>
      {isNovel ? (
        <header className="sticky top-0 z-40 border-b border-border/70 bg-background/95 backdrop-blur-xl">
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
            <span className="truncate text-sm font-bold text-primary">Cap. {formatChapter(current.number)}</span>

            <div className="ml-auto flex items-center gap-1">
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
      <header className="sticky top-0 z-40 bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-2 px-4 sm:px-8">
          <Button variant="ghost" size="icon" type="button" onClick={() => history.back()} className={iconBtn} aria-label="Voltar">
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <Link to="/obra/$slug" params={{ slug }} className="ml-2 flex items-center gap-1.5 text-sm font-bold hover:text-primary">
            <BookOpen className="h-4 w-4" /> Obra
          </Link>
          <h1 className="ml-3 flex min-w-0 items-center gap-2 text-sm">
            <span className="truncate text-muted-foreground">{obra.title}</span>
            <span className="shrink-0 font-bold text-primary">Cap. {formatChapter(current.number)}</span>
          </h1>
          <div className="ml-auto flex items-center gap-1">
            <Button variant="ghost" size="icon" type="button" disabled={!prev} onClick={() => go("prev")} className={iconBtn} aria-label="Capítulo anterior">
              <ChevronLeft className="h-5 w-5" />
            </Button>
            <Button variant="ghost" size="icon" type="button" disabled={!next} onClick={() => go("next")} className={iconBtn} aria-label="Próximo capítulo">
              <ChevronRight className="h-5 w-5" />
            </Button>
            <Link to="/obra/$slug" params={{ slug }} className={`${iconBtn} hidden sm:grid`} aria-label="Lista de capítulos">
              <Infinity className="h-5 w-5" />
            </Link>
            <Button
              variant="ghost"
              size="icon"
              type="button"
              className={`${iconBtn} hidden sm:grid`}
              aria-label="Tema"
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
      </header>
      )}

      <main className={`mx-auto ${isNovel ? novelWidth : "max-w-3xl"}`}>
        {isNovel ? (
          <article className="px-5 pb-16 pt-10 sm:px-8 sm:pt-14">
            <header className="mb-10 border-b border-border/70 pb-7 text-center">
              <p className="mb-3 text-xs font-bold uppercase text-primary">{obra.title}</p>
              <h1 className="font-display text-2xl font-extrabold sm:text-3xl">
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
          pages.map((page, pageIndex) => (
            <img
              key={`${page}-${pageIndex}`}
              src={page}
              alt={`Página ${pageIndex + 1}`}
              loading={pageIndex < 2 ? "eager" : "lazy"}
              className="w-full"
            />
          ))
        )}
      </main>

      <div className={`mx-auto flex ${isNovel ? novelWidth : "max-w-3xl"} items-center justify-between gap-3 border-t border-border/70 px-4 py-8`}>
        <Button variant="outline" disabled={!prev} onClick={() => go("prev")} className="font-semibold">
          <ChevronLeft className="mr-1 h-4 w-4" /> Anterior
        </Button>
        <Button asChild variant="ghost" className="font-semibold">
          <Link to="/obra/$slug" params={{ slug }}>
            Capítulos
          </Link>
        </Button>
        <Button disabled={!next} onClick={() => go("next")} className="font-semibold">
          Próximo <ChevronRight className="ml-1 h-4 w-4" />
        </Button>
      </div>

      <section className="mx-auto max-w-3xl px-4 pb-16">
        <h2 className="section-title">
          <MessageCircle className="h-5 w-5" /> Comentários do capítulo
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
    </div>
  );
}
