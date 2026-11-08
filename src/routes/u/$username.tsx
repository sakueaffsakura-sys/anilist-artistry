import { useEffect, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowUpRight,
  Ban,
  BookmarkPlus,
  BookOpen,
  Camera,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Crown,
  FileText,
  Frame,
  Heart,
  History,
  ImageIcon,
  Library,
  LayoutGrid,
  ListOrdered,
  Lock,
  MessageSquare,
  Palette,
  Pencil,
  Play,
  ShieldCheck,
  Send,
  Shapes,
  Settings,
  Sparkles,
  Star,
  Tag,
  Trophy,
  Trash2,
  Upload,
  User2,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { SiteFooter, SiteHeader } from "@/components/SiteHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/useAuth";
import { coverUrl, timeAgo } from "@/lib/media";
import { FramedAvatar } from "@/components/FramedAvatar";
import { UserBadges, type Badge } from "@/components/UserBadges";
import { SeriesCard } from "@/components/SeriesCard";
import { HScroll, SectionRow, shelfItem } from "@/components/SectionRow";
import { compactNumber } from "@/lib/format";

/** Avatar menor no celular (o cabeçalho do perfil cabe em 360 px sem quebrar). */
function useAvatarSize() {
  const [size, setSize] = useState(88);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const update = () => setSize(mq.matches ? 128 : 88);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return size;
}

export const Route = createFileRoute("/u/$username")({
  staticData: { sitemap: false },
  head: ({ params }) => ({
    meta: [
      { title: `@${params.username} — Better Mangá` },
      { name: "description", content: `Perfil de @${params.username} no Better Mangá: favoritos, listas e comentários.` },
      { property: "og:title", content: `@${params.username} — Better Mangá` },
      { property: "og:description", content: "Perfil de leitor no Better Mangá." },
      { property: "og:type", content: "profile" },
      { property: "og:url", content: `https://bettermanga.net/u/${encodeURIComponent(params.username)}` },
      { name: "twitter:card", content: "summary" },
    ],
    links: [{ rel: "canonical", href: `https://bettermanga.net/u/${encodeURIComponent(params.username)}` }],
  }),
  component: Perfil,
});

type ProfileSeries = {
  id: string;
  slug: string;
  title: string;
  cover_url: string | null;
  kind: string;
  rating: number;
  latest_chapters: { number: number }[];
  chapter_total: { count: number }[];
};

function Perfil() {
  const { username } = Route.useParams();
  const { user } = useSession();
  const qc = useQueryClient();
  const [tab, setTab] = useState<"visao" | "colecao" | "listas" | "comentarios">("visao");
  const [collectionTab, setCollectionTab] = useState<"favoritos" | "continuando" | "interessado" | "lendo" | "lido" | "dropado" | "planejo">("favoritos");
  const avatarSize = useAvatarSize();
  const [body, setBody] = useState("");
  const [editing, setEditing] = useState(false);

  const profile = useQuery({
    queryKey: ["public-profile", username],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, username, display_name, bio, avatar_url, banner_url, level, xp, created_at, accent_color, avatar_frame, comment_bg, is_private, subscription_tier")
        .eq("username", username)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const p = profile.data;
  const isMe = Boolean(user && p && user.id === p.id);

  const stats = useQuery({
    queryKey: ["profile-stats", p?.id, user?.id],
    enabled: Boolean(p),
    queryFn: async () => {
      if (!p) throw new Error("Perfil não encontrado");
      const [followers, following, favs, readingStatuses, readingHistory, mine, lists, profileComments, workComments, badges, roles, totalRank, weeklyRank] = await Promise.all([
        supabase.from("user_follows").select("*", { count: "exact", head: true }).eq("following_id", p.id),
        supabase.from("user_follows").select("*", { count: "exact", head: true }).eq("follower_id", p.id),
        supabase.from("favorites").select("created_at, series(id, slug, title, cover_url, kind, rating, chapter_total:chapters(count), latest_chapters:chapters(number))").eq("user_id", p.id).eq("profile_id", "00000000-0000-0000-0000-000000000000").order("created_at", { ascending: false }).order("number", { referencedTable: "series.latest_chapters", ascending: false }).limit(1, { referencedTable: "series.latest_chapters" }).limit(48),
        supabase.from("reading_status").select("status, updated_at, series(id, slug, title, cover_url, kind, rating, chapter_total:chapters(count), latest_chapters:chapters(number))").eq("user_id", p.id).order("updated_at", { ascending: false }).order("number", { referencedTable: "series.latest_chapters", ascending: false }).limit(1, { referencedTable: "series.latest_chapters" }).limit(48),
        supabase.from("reading_history").select("updated_at, series_id, chapters(number), series(id, slug, title, cover_url, kind, rating, chapter_total:chapters(count), latest_chapters:chapters(number))").eq("user_id", p.id).eq("profile_id", "00000000-0000-0000-0000-000000000000").order("updated_at", { ascending: false }).order("number", { referencedTable: "series.latest_chapters", ascending: false }).limit(1, { referencedTable: "series.latest_chapters" }).limit(48),
        user
          ? supabase.from("user_follows").select("follower_id").eq("follower_id", user.id).eq("following_id", p.id).maybeSingle()
          : Promise.resolve({ data: null }),
        supabase.from("lists").select("id, title, description, created_at").eq("user_id", p.id).eq("is_public", true).order("created_at", { ascending: false }),
        supabase.from("profile_comments").select("id", { count: "exact", head: true }).eq("author_id", p.id),
        supabase.from("comments").select("id", { count: "exact", head: true }).eq("user_id", p.id),
        supabase.from("profile_badges").select("id, name, image_url").eq("user_id", p.id).order("position", { ascending: true }),
        supabase.from("user_roles").select("role").eq("user_id", p.id).eq("role", "admin"),
        supabase.rpc("xp_ranking", { _period: "total" }),
        supabase.rpc("xp_ranking", { _period: "weekly" }),
      ]);
      const totalRows = totalRank.data ?? [];
      const weeklyRows = weeklyRank.data ?? [];
      return {
        followers: followers.count ?? 0,
        following: following.count ?? 0,
        favorites: ((favs.data ?? []) as unknown as { created_at: string; series: ProfileSeries | null }[])
          .map((f) => f.series)
          .filter((x): x is NonNullable<typeof x> => Boolean(x)),
        readingStatuses: ((readingStatuses.data ?? []) as unknown as { status: string; updated_at: string; series: ProfileSeries | null }[])
          .filter((row): row is { status: string; updated_at: string; series: ProfileSeries } => Boolean(row.series)),
        readingHistory: ((readingHistory.data ?? []) as unknown as { updated_at: string; series_id: string; chapters: { number: number } | null; series: ProfileSeries | null }[])
          .filter((row): row is { updated_at: string; series_id: string; chapters: { number: number } | null; series: ProfileSeries } => Boolean(row.series)),
        iFollow: Boolean(mine.data),
        publicLists: lists.data ?? [],
        comments: (profileComments.count ?? 0) + (workComments.count ?? 0),
        badges: (badges.data ?? []) as Badge[],
        isAdmin: Boolean(roles.data?.length),
        totalRank: Math.max(0, totalRows.findIndex((row) => row.id === p.id) + 1),
        weeklyRank: Math.max(0, weeklyRows.findIndex((row) => row.id === p.id) + 1),
      };
    },
  });

  const comments = useQuery({
    queryKey: ["profile-comments", p?.id],
    enabled: Boolean(p) && tab === "comentarios",
    queryFn: async () => {
      if (!p) throw new Error("Perfil não encontrado");
      const { data, error } = await supabase
        .from("profile_comments")
        .select("id, body, created_at, author_id")
        .eq("profile_id", p.id)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      const rows = data ?? [];
      const ids = [...new Set(rows.map((r) => r.author_id))];
      const map = new Map<string, { username: string; avatar_url: string | null; level: number }>();
      if (ids.length) {
        const { data: ps } = await supabase.from("profiles").select("id, username, avatar_url, level").in("id", ids);
        for (const x of ps ?? []) map.set(x.id, x);
      }
      return rows.map((r) => ({ ...r, author: map.get(r.author_id) }));
    },
  });

  const follow = useMutation({
    mutationFn: async () => {
      if (stats.data?.iFollow) { const { error: dbErr } = await supabase.from("user_follows").delete().eq("follower_id", user!.id).eq("following_id", p!.id); if (dbErr) throw dbErr; }
      else { const { error: dbErr } = await supabase.from("user_follows").insert({ follower_id: user!.id, following_id: p!.id }); if (dbErr) throw dbErr; }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["profile-stats"] }),
  });

  const post = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("profile_comments").insert({ profile_id: p!.id, author_id: user!.id, body: body.trim() });
      if (error) throw error;
    },
    onSuccess: () => {
      setBody("");
      qc.invalidateQueries({ queryKey: ["profile-comments"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      { const { error: dbErr } = await supabase.from("profile_comments").delete().eq("id", id); if (dbErr) throw dbErr; }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["profile-comments"] }),
  });

  if (profile.isLoading) {
    return (
      <div className="min-h-screen">
        <SiteHeader />
        <p role="status" className="mx-auto max-w-6xl px-4 py-16 text-muted-foreground">Carregando perfil…</p>
      </div>
    );
  }
  if (!p) {
    return (
      <div className="min-h-screen">
        <SiteHeader />
        <div className="mx-auto max-w-6xl px-4 py-16">
          <h1 className="font-display text-xl font-bold">Perfil não encontrado</h1>
          <p className="mt-1 text-sm text-muted-foreground">Confira o nome de usuário ou procure em <Link to="/ranking-leitores" className="text-primary">Leitores</Link>.</p>
        </div>
      </div>
    );
  }

  const levelFloor = Math.max(0, (p.level - 1) * 1000);
  const xpInLevel = Math.max(0, p.xp - levelFloor);
  const xpGoal = 1000;
  const continuedRows = (() => {
    const seen = new Set<string>();
    return (stats.data?.readingHistory ?? []).filter((row) => {
      if (seen.has(row.series_id)) return false;
      seen.add(row.series_id);
      return true;
    });
  })();
  const continuedSeries = continuedRows.map((row) => row.series);
  const statusSeries = (status: string) => (stats.data?.readingStatuses ?? []).filter((row) => row.status === status).map((row) => row.series);
  const collectionTabs = [
    { id: "favoritos", label: "Favoritos", icon: Heart, items: stats.data?.favorites ?? [] },
    { id: "continuando", label: "Lendo recentemente", icon: History, items: continuedSeries },
    { id: "lendo", label: "Lendo", icon: Play, items: statusSeries("lendo") },
    { id: "lido", label: "Lido", icon: Check, items: statusSeries("lido") },
    { id: "planejo", label: "Planejo ler", icon: BookmarkPlus, items: statusSeries("planejo") },
    { id: "interessado", label: "Interessado", icon: Sparkles, items: statusSeries("interessado") },
    { id: "dropado", label: "Dropado", icon: Ban, items: statusSeries("dropado") },
  ] as const;
  const activeCollection = collectionTabs.find((item) => item.id === collectionTab) ?? collectionTabs[0];
  const worksCount = new Set([...(stats.data?.favorites ?? []).map((x) => x.id), ...(stats.data?.readingStatuses ?? []).map((x) => x.series.id)]).size;
  const lists = stats.data?.publicLists ?? [];
  const joinedAt = new Date(p.created_at).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  const name = p.display_name || p.username;
  const openCollection = (id: typeof collectionTab) => { setCollectionTab(id); setTab("colecao"); };
  const share = async () => {
    try { await navigator.clipboard.writeText(window.location.href); toast.success("Link do perfil copiado"); }
    catch { toast.error("Não foi possível copiar o link"); }
  };
  const tabs = [
    { id: "visao", label: "Visão geral", icon: LayoutGrid, count: undefined },
    { id: "colecao", label: "Coleção", icon: Library, count: worksCount },
    { id: "listas", label: "Listas", icon: ListOrdered, count: lists.length },
    { id: "comentarios", label: "Mural", icon: MessageSquare, count: undefined },
  ] as const;
  const level = <LevelCard level={p.level} xp={p.xp} xpInLevel={xpInLevel} xpGoal={xpGoal} totalRank={stats.data?.totalRank ?? 0} weeklyRank={stats.data?.weeklyRank ?? 0} />;
  const badgesCard = <BadgesCard badges={stats.data?.badges ?? []} tier={p.subscription_tier} isAdmin={stats.data?.isAdmin ?? false} isMe={isMe} onEdit={() => setEditing(true)} />;

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="site-content pb-12">
        <div className="profile-banner" style={!p.banner_url && p.accent_color ? { background: `color-mix(in oklab, ${p.accent_color} 28%, var(--surface))` } : undefined}>
          {p.banner_url ? <img src={p.banner_url} alt="" /> : null}
        </div>

        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <header className="profile-head">
            <div className="profile-avatar">
              <FramedAvatar src={p.avatar_url} frame={p.avatar_frame} size={avatarSize} />
            </div>
            <div className="profile-actions">
              {isMe ? (
                <Button variant="secondary" size="sm" onClick={() => setEditing(true)}><Pencil /> Editar perfil</Button>
              ) : user ? (
                <Button size="sm" variant={stats.data?.iFollow ? "secondary" : "default"} disabled={follow.isPending || !stats.data} onClick={() => follow.mutate()}>
                  {stats.data?.iFollow ? <Check /> : <UserPlus />} {stats.data?.iFollow ? "Seguindo" : "Seguir"}
                </Button>
              ) : (
                <Button asChild size="sm"><Link to="/auth"><UserPlus /> Seguir</Link></Button>
              )}
              <Button variant="secondary" size="icon" className="h-9 w-9" onClick={() => void share()} aria-label="Copiar link do perfil" title="Copiar link do perfil"><Send /></Button>
            </div>
            <div className="profile-id">
              <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1">
                <h1 className="profile-name" style={p.accent_color ? { color: p.accent_color } : undefined}>{name}</h1>
                <UserBadges variant="inline" size={22} tier={p.subscription_tier} badges={stats.data?.badges ?? []} isAdmin={stats.data?.isAdmin ?? false} />
              </div>
              <p className="profile-handle">@{p.username} <span aria-hidden="true">·</span> <b>Nível {p.level}</b></p>
              {p.bio ? <p className="profile-bio">{p.bio}</p> : isMe ? <button type="button" className="profile-bio text-left text-muted-foreground hover:text-primary" onClick={() => setEditing(true)}>Escreva uma biografia curta…</button> : null}
              <p className="profile-meta">
                <span><CalendarDays /> Desde {joinedAt}</span>
                {stats.data?.totalRank ? <Link to="/ranking-leitores"><Trophy /> #{stats.data.totalRank} no ranking</Link> : null}
                {stats.data?.weeklyRank ? <Link to="/ranking-leitores"><Crown /> #{stats.data.weeklyRank} na semana</Link> : null}
              </p>
            </div>
          </header>

          <dl className="profile-stats" aria-busy={stats.isPending}>
            {[
              ["Seguidores", stats.data?.followers],
              ["Seguindo", stats.data?.following],
              ["Obras", stats.data ? worksCount : undefined],
              ["Comentários", stats.data?.comments],
            ].map(([label, value]) => (
              <div key={label as string}>
                <dt>{label}</dt>
                <dd title={typeof value === "number" ? value.toLocaleString("pt-BR") : undefined}>{typeof value === "number" ? compactNumber(value) : "–"}</dd>
              </div>
            ))}
          </dl>

          <div className="profile-layout">
            <div className="min-w-0">
              <nav className="chip-row profile-tabs" aria-label="Seções do perfil">
                {tabs.map((item) => (
                  <button key={item.id} type="button" className="chip" aria-pressed={tab === item.id} onClick={() => setTab(item.id)}>
                    <item.icon aria-hidden="true" /> {item.label}
                    {typeof item.count === "number" && item.count > 0 ? <span className="chip-count">{item.count}</span> : null}
                  </button>
                ))}
              </nav>

              {tab === "visao" ? (
                <div className="space-y-8">
                  <div className="grid gap-3 sm:grid-cols-2 lg:hidden">{level}{badgesCard}</div>
                  {stats.isPending ? <p role="status" className="text-sm text-muted-foreground">Carregando atividade…</p> : null}
                  {continuedRows.length ? (
                    <SectionRow icon={<History />} title={isMe ? "Continue lendo" : "Lendo recentemente"} count={continuedRows.length}
                      action={continuedRows.length > 6 ? <button type="button" className="see-all" onClick={() => openCollection("continuando")}>Ver tudo</button> : undefined}>
                      <HScroll>
                        {continuedRows.slice(0, 12).map((row) => (
                          <div key={row.series_id} className={shelfItem}>
                            <SeriesCard slug={row.series.slug} title={row.series.title} cover={row.series.cover_url} rating={row.series.rating} kind={row.series.kind} seriesId={row.series.id}
                              chapters={row.series.chapter_total?.[0]?.count ?? null} badge={row.chapters?.number ? `Cap. ${row.chapters.number}` : null} />
                          </div>
                        ))}
                      </HScroll>
                    </SectionRow>
                  ) : null}
                  {(stats.data?.favorites.length ?? 0) > 0 ? (
                    <SectionRow icon={<Heart />} title="Favoritos" count={stats.data!.favorites.length}
                      action={stats.data!.favorites.length > 6 ? <button type="button" className="see-all" onClick={() => openCollection("favoritos")}>Ver tudo</button> : undefined}>
                      <HScroll>
                        {stats.data!.favorites.slice(0, 12).map((series) => (
                          <div key={series.id} className={shelfItem}><WorkCard series={series} /></div>
                        ))}
                      </HScroll>
                    </SectionRow>
                  ) : null}
                  {lists.length ? (
                    <SectionRow icon={<ListOrdered />} title="Listas" count={lists.length}
                      action={lists.length > 3 ? <button type="button" className="see-all" onClick={() => setTab("listas")}>Ver todas</button> : undefined}>
                      <ListRows lists={lists.slice(0, 3)} />
                    </SectionRow>
                  ) : null}
                  {stats.data && !continuedRows.length && !stats.data.favorites.length && !lists.length ? (
                    <div className="profile-empty">
                      <BookOpen aria-hidden="true" />
                      <p>{isMe ? "Seu perfil ainda está vazio. Favorite obras e crie listas para elas aparecerem aqui." : `@${p.username} ainda não tem obras favoritas nem listas públicas.`}</p>
                      {isMe ? <Button asChild size="sm"><Link to="/catalogo">Explorar o catálogo</Link></Button> : null}
                    </div>
                  ) : null}
                </div>
              ) : null}

              {tab === "colecao" ? (
                <div>
                  <div className="chip-row mb-4" role="tablist" aria-label="Parte da coleção">
                    {collectionTabs.map((item) => (
                      <button key={item.id} type="button" role="tab" className="chip chip-sm" aria-selected={collectionTab === item.id} aria-pressed={collectionTab === item.id} onClick={() => setCollectionTab(item.id)}>
                        <item.icon aria-hidden="true" /> {item.label}
                        {item.items.length ? <span className="chip-count">{item.items.length}</span> : null}
                      </button>
                    ))}
                  </div>
                  {activeCollection.items.length ? (
                    <div className="grid grid-cols-3 gap-x-3 gap-y-5 sm:grid-cols-4 lg:grid-cols-5">
                      {activeCollection.items.map((series) => <WorkCard key={series.id} series={series} />)}
                    </div>
                  ) : (
                    <p className="profile-empty-line">{stats.isPending ? "Carregando…" : `Nenhuma obra em "${activeCollection.label}".`}</p>
                  )}
                </div>
              ) : null}

              {tab === "listas" ? (
                lists.length ? <ListRows lists={lists} /> : <p className="profile-empty-line">{isMe ? <>Você ainda não tem listas públicas. <Link to="/listas" className="text-primary">Criar uma lista</Link></> : "Nenhuma lista pública."}</p>
              ) : null}

              {tab === "comentarios" ? (
                <div>
                  {user ? (
                    <div className="profile-compose">
                      <Textarea value={body} maxLength={2000} onChange={(e) => setBody(e.target.value)}
                        placeholder={isMe ? "Escreva algo no seu mural…" : `Deixe um recado para @${p.username}…`}
                        aria-label="Comentário no mural" className="min-h-20 resize-none border-none bg-transparent p-0 shadow-none focus-visible:ring-0" />
                      <div className="mt-2 flex items-center justify-end gap-3">
                        <span className="text-xs text-muted-foreground tabular-nums">{body.length}/2000</span>
                        <Button size="sm" disabled={!body.trim() || post.isPending} onClick={() => post.mutate()}><Send /> Publicar</Button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground"><Link to="/auth" className="text-primary">Entre</Link> para deixar um recado.</p>
                  )}
                  <ul className="mt-4 divide-y divide-border">
                    {comments.isPending ? <li role="status" className="py-5 text-sm text-muted-foreground">Carregando mural…</li> : null}
                    {comments.isError ? <li role="alert" className="py-4"><Button variant="secondary" size="sm" onClick={() => void comments.refetch()}>Tentar novamente</Button></li> : null}
                    {comments.isSuccess && !comments.data.length ? <li className="profile-empty-line">Ninguém escreveu no mural ainda.</li> : null}
                    {(comments.data ?? []).map((c) => (
                      <li key={c.id} className="flex gap-3 py-4">
                        <Link to="/u/$username" params={{ username: c.author?.username ?? "" }} className="shrink-0" aria-hidden="true" tabIndex={-1}>
                          <FramedAvatar src={c.author?.avatar_url} size={40} />
                        </Link>
                        <div className="min-w-0 flex-1 rounded-md px-3 py-2" style={p.comment_bg ? { background: p.comment_bg } : { background: "var(--surface)" }}>
                          <div className="flex flex-wrap items-baseline gap-x-2">
                            <Link to="/u/$username" params={{ username: c.author?.username ?? "" }} className="text-sm font-bold hover:text-primary">{c.author?.username ?? "leitor"}</Link>
                            <span className="text-[11px] font-semibold text-muted-foreground">Nv. {c.author?.level ?? 1}</span>
                            <span className="ml-auto text-xs text-muted-foreground">{timeAgo(c.created_at)}</span>
                          </div>
                          <p className="mt-1 whitespace-pre-line break-words text-sm text-foreground/85">{c.body}</p>
                          {user && (user.id === c.author_id || isMe) ? (
                            <button type="button" onClick={() => del.mutate(c.id)} className="mt-1.5 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive">
                              <Trash2 className="h-3 w-3" /> Excluir
                            </button>
                          ) : null}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>

            <aside className="hidden space-y-3 lg:block">
              {level}
              {badgesCard}
              {isMe ? (
                <div className="side-card">
                  <h2 className="text-sm font-bold">Atalhos</h2>
                  <div className="mt-2 grid gap-1">
                    <Link to="/biblioteca" className="profile-link"><Library /> Minha biblioteca</Link>
                    <Link to="/historico" className="profile-link"><History /> Histórico</Link>
                    <Link to="/listas" className="profile-link"><ListOrdered /> Minhas listas</Link>
                  </div>
                </div>
              ) : null}
            </aside>
          </div>
        </div>
      </main>
      {isMe ? <EditProfile open={editing} onOpenChange={setEditing} profile={p} /> : null}
      <SiteFooter />
    </div>
  );
}

/** Capa de obra do perfil (mesmo cartão do resto do site). */
function WorkCard({ series }: { series: ProfileSeries }) {
  return (
    <SeriesCard slug={series.slug} title={series.title} cover={series.cover_url} rating={series.rating} kind={series.kind} seriesId={series.id}
      chapters={series.chapter_total?.[0]?.count ?? null} />
  );
}

function ListRows({ lists }: { lists: { id: string; title: string; description: string | null }[] }) {
  return (
    <ul className="grid gap-2 sm:grid-cols-2">
      {lists.map((list) => (
        <li key={list.id}>
          <Link to="/listas/$id" params={{ id: list.id }} className="profile-list-row">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-surface-2 text-primary"><ListOrdered className="h-4 w-4" /></span>
            <span className="min-w-0 flex-1"><b className="block truncate text-sm">{list.title}</b><span className="line-clamp-1 text-xs text-muted-foreground">{list.description || "Lista de leitura"}</span></span>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          </Link>
        </li>
      ))}
    </ul>
  );
}

function LevelCard({ level, xp, xpInLevel, xpGoal, totalRank, weeklyRank }: { level: number; xp: number; xpInLevel: number; xpGoal: number; totalRank: number; weeklyRank: number }) {
  const percentage = Math.min(100, Math.round((xpInLevel / xpGoal) * 100));
  return (
    <section className="side-card" aria-label="Nível e experiência">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="font-display text-lg font-bold">Nível {level}</h2>
        <span className="text-xs font-semibold text-muted-foreground tabular-nums">{xp.toLocaleString("pt-BR")} XP</span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuemin={0} aria-valuemax={xpGoal} aria-valuenow={xpInLevel} aria-label={`Progresso para o nível ${level + 1}`}>
        <div className="h-full rounded-full bg-primary" style={{ width: `${percentage}%` }} />
      </div>
      <p className="mt-1.5 text-xs text-muted-foreground tabular-nums">{xpInLevel.toLocaleString("pt-BR")} / {xpGoal.toLocaleString("pt-BR")} XP para o nível {level + 1}</p>
      {totalRank || weeklyRank ? (
        <div className="mt-3 grid grid-cols-2 gap-2 border-t border-border pt-3 text-center">
          <Link to="/ranking-leitores" className="rounded-md bg-surface-2 py-2 hover:bg-accent"><b className="block font-display text-base tabular-nums">{totalRank ? `#${totalRank}` : "–"}</b><span className="text-[11px] font-semibold text-muted-foreground">Ranking geral</span></Link>
          <Link to="/ranking-leitores" className="rounded-md bg-surface-2 py-2 hover:bg-accent"><b className="block font-display text-base tabular-nums">{weeklyRank ? `#${weeklyRank}` : "–"}</b><span className="text-[11px] font-semibold text-muted-foreground">Na semana</span></Link>
        </div>
      ) : null}
    </section>
  );
}

function BadgesCard({ badges, tier, isAdmin, isMe, onEdit }: { badges: Badge[]; tier: string | null; isAdmin: boolean; isMe: boolean; onEdit: () => void }) {
  const empty = badges.length === 0 && !isAdmin && (!tier || tier === "none");
  return (
    <section className="side-card" aria-label="Selos">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-bold">Selos</h2>
        {isMe ? <button type="button" className="see-all" onClick={onEdit}>Personalizar</button> : null}
      </div>
      <div className="mt-3 flex min-h-10 flex-wrap items-center gap-2">
        <UserBadges tier={tier} badges={badges} isAdmin={isAdmin} size={36} />
        {empty ? <span className="text-sm text-muted-foreground">Nenhum selo ainda.</span> : null}
      </div>
    </section>
  );
}

const ACCENT_COLORS = ["#22d3ee", "#f97316", "#a78bfa", "#4ade80", "#f472b6", "#facc15", "#f87171", "#60a5fa"];

const FRAMES = [
  { id: "none", label: "Sem moldura", color: "var(--border)" },
  { id: "cyan", label: "Ciano", color: "#22d3ee" },
  { id: "gold", label: "Ouro", color: "#facc15" },
  { id: "fire", label: "Fogo", color: "#f97316" },
  { id: "sakura", label: "Sakura", color: "#f472b6" },
  { id: "violet", label: "Violeta", color: "#a78bfa" },
];

function frameColor(frame?: string | null) {
  return FRAMES.find((f) => f.id === frame)?.color ?? "var(--primary)";
}

const COMMENT_BGS = [
  { id: "", label: "Padrão", value: "" },
  { id: "blue", label: "Azul noturno", value: "linear-gradient(135deg, rgba(34,211,238,.12), rgba(96,165,250,.06))" },
  { id: "purple", label: "Violeta", value: "linear-gradient(135deg, rgba(167,139,250,.14), rgba(244,114,182,.06))" },
  { id: "green", label: "Verde", value: "linear-gradient(135deg, rgba(74,222,128,.12), rgba(34,211,238,.05))" },
  { id: "fire", label: "Fogo", value: "linear-gradient(135deg, rgba(249,115,22,.14), rgba(250,204,21,.05))" },
];

type EditableProfile = {
  id: string;
  username: string;
  display_name: string | null;
  bio: string | null;
  avatar_url: string | null;
  banner_url: string | null;
  level: number;
  accent_color: string | null;
  avatar_frame: string | null;
  comment_bg: string | null;
  is_private: boolean;
};

function EditProfile({
  open,
  onOpenChange,
  profile,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  profile: EditableProfile;
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    username: profile.username,
    display_name: profile.display_name ?? "",
    bio: profile.bio ?? "",
    avatar_url: profile.avatar_url ?? "",
    banner_url: profile.banner_url ?? "",
    accent_color: profile.accent_color ?? "",
    avatar_frame: profile.avatar_frame ?? "",
    comment_bg: profile.comment_bg ?? "",
    is_private: profile.is_private,
  });
  const [uploading, setUploading] = useState<"avatar" | "banner" | null>(null);
  const [showFrames, setShowFrames] = useState(false);
  const { data: frames } = useQuery({
    queryKey: ["avatar-frames"],
    queryFn: async () => {
      const { data, error } = await supabase.from("avatar_frames").select("id, name, image_url").eq("active", true).order("created_at");
      if (error) throw error;
      return data;
    },
  });
  const avatarInput = useRef<HTMLInputElement>(null);
  const bannerInput = useRef<HTMLInputElement>(null);

  const save = useMutation({
    mutationFn: async (patch: Partial<typeof form>) => {
      const next = { ...form, ...patch };
      const { error } = await supabase
        .from("profiles")
        .update({
          username: next.username.trim() || profile.username,
          display_name: next.display_name || null,
          bio: next.bio || null,
          avatar_url: next.avatar_url || null,
          banner_url: next.banner_url || null,
          accent_color: next.accent_color || null,
          avatar_frame: next.avatar_frame || null,
          comment_bg: next.comment_bg || null,
          is_private: next.is_private,
        })
        .eq("id", profile.id);
      if (error) throw error;
      setForm(next);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["public-profile"] });
      qc.invalidateQueries({ queryKey: ["profile"] });
      toast.success("Perfil atualizado");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao salvar"),
  });

  async function upload(kind: "avatar" | "banner", file: File) {
    if (file.size > 5 * 1024 * 1024) {
      toast.error("A imagem deve ter no máximo 5 MB");
      return;
    }
    setUploading(kind);
    try {
      const ext = file.name.split(".").pop() ?? "png";
      const path = `profiles/${profile.id}/${kind}-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("manga").upload(path, file, { upsert: true });
      if (error) throw error;
      const { data } = await supabase.storage.from("manga").createSignedUrl(path, 60 * 60 * 24 * 365 * 10);
      if (!data?.signedUrl) throw new Error("Falha ao gerar link da imagem");
      save.mutate({ [kind === "avatar" ? "avatar_url" : "banner_url"]: data.signedUrl });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha no upload — tente colar um link de imagem");
    } finally {
      setUploading(null);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) setShowFrames(false);
        onOpenChange(v);
      }}
    >
      <DialogContent className="h-[100dvh] w-screen max-w-none gap-0 overflow-y-auto rounded-none border-0 bg-background p-0 sm:h-[min(92dvh,900px)] sm:w-[min(94vw,1080px)] sm:max-w-5xl sm:rounded-lg sm:border [&>button:last-child]:hidden">
        <DialogHeader className="sr-only">
          <DialogTitle>Editar perfil</DialogTitle>
        </DialogHeader>
        <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-border bg-background/95 px-4 py-3 backdrop-blur-xl md:px-8">
          <Button variant="ghost" size="icon" onClick={() => onOpenChange(false)} aria-label="Voltar">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="min-w-0">
            <h1 className="text-base font-bold">Editar perfil</h1>
            <p className="hidden text-xs text-muted-foreground sm:block">Foto, banner, moldura e dados pessoais</p>
          </div>
        </header>

        <div className="mx-auto w-full max-w-5xl px-4 py-6 md:px-8 md:py-8">
          <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[1fr_1.4fr] lg:gap-6">
            <div className="space-y-4">
              <section className="space-y-4 rounded-lg border border-border bg-card p-5">
                <h2 className="flex items-center gap-2 text-xs font-bold text-muted-foreground"><User2 className="h-3 w-3" /> Foto de perfil</h2>
                <div className="flex items-center gap-4">
                  <Button variant="ghost" className="relative h-20 w-20 shrink-0 rounded-full p-0" onClick={() => avatarInput.current?.click()} aria-label="Escolher foto de perfil">
                    <FramedAvatar src={form.avatar_url} frame={form.avatar_frame || null} size={80} />
                    <span className="absolute inset-0 grid place-items-center rounded-full bg-background/70 opacity-0 transition-opacity hover:opacity-100"><Upload className="h-5 w-5" /></span>
                  </Button>
                  <div className="min-w-0 flex-1 space-y-2">
                    <p className="text-xs leading-relaxed text-muted-foreground">JPG ou PNG, máximo 5MB.</p>
                    <Button variant="secondary" size="sm" onClick={() => avatarInput.current?.click()} disabled={uploading !== null}>{uploading === "avatar" ? "Enviando…" : "Escolher"}</Button>
                  </div>
                </div>
                <input ref={avatarInput} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (file) void upload("avatar", file); e.target.value = ""; }} />
              </section>

              <section className="space-y-4 rounded-lg border border-border bg-card p-5">
                <h2 className="flex items-center gap-2 text-xs font-bold text-muted-foreground"><ImageIcon className="h-3 w-3" /> Banner</h2>
                <Button variant="ghost" className="group relative h-32 w-full overflow-hidden rounded-lg bg-surface-2 p-0" onClick={() => bannerInput.current?.click()}>
                  {form.banner_url ? <img src={form.banner_url} alt="Banner atual" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" /> : <ImageIcon className="h-7 w-7 text-muted-foreground" />}
                  <span className="absolute inset-0 grid place-items-center bg-background/60 opacity-0 transition-opacity group-hover:opacity-100"><span className="flex items-center gap-2 text-xs font-bold"><Upload className="h-4 w-4" /> Alterar banner</span></span>
                </Button>
                <div className="flex justify-end"><Button variant="secondary" size="sm" onClick={() => bannerInput.current?.click()} disabled={uploading !== null}>{uploading === "banner" ? "Enviando…" : "Escolher"}</Button></div>
                <input ref={bannerInput} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (file) void upload("banner", file); e.target.value = ""; }} />
              </section>

              <section className="space-y-4 rounded-lg border border-border bg-card p-5">
                <h2 className="flex items-center gap-2 text-xs font-bold text-muted-foreground"><Shapes className="h-3 w-3" /> Moldura</h2>
                <div className="flex items-center gap-3">
                  <div className="grid h-14 w-14 shrink-0 place-items-center rounded-lg bg-surface-2">{form.avatar_frame ? <img src={form.avatar_frame} alt="Moldura atual" className="h-14 w-14 object-contain" /> : <span className="text-[11px] font-bold text-muted-foreground">Nenhuma</span>}</div>
                  <p className="min-w-0 flex-1 text-xs text-muted-foreground">Abra a galeria, escolha e salve.</p>
                </div>
                <Button variant="outline" size="sm" onClick={() => setShowFrames((value) => !value)}>Galeria</Button>
                {showFrames ? (
                  <div className="grid grid-cols-3 gap-2 border-t border-border pt-4 sm:grid-cols-4">
                    {[{ id: "none", name: "Sem moldura", image_url: "" }, ...(frames ?? [])].map((frame) => (
                      <Button key={frame.id} variant="ghost" className={`h-auto min-h-24 flex-col gap-1 border p-2 ${form.avatar_frame === frame.image_url || (!form.avatar_frame && !frame.image_url) ? "border-primary bg-primary/10" : "border-border"}`} onClick={() => setForm({ ...form, avatar_frame: frame.image_url })}>
                        {frame.image_url ? <img loading="lazy" decoding="async" src={frame.image_url} alt="" className="h-14 w-14 object-contain" /> : <span className="h-12 w-12 rounded-full border-2 border-dashed border-border" />}
                        <span className="line-clamp-1 max-w-full text-[10px]">{frame.name}</span>
                      </Button>
                    ))}
                  </div>
                ) : null}
              </section>
            </div>

            <section className="space-y-5 rounded-lg border border-border bg-card p-5">
              <h2 className="flex items-center gap-2 text-xs font-bold text-muted-foreground"><Pencil className="h-3 w-3" /> Dados pessoais</h2>
              <label className="block text-xs font-bold text-muted-foreground">Nome
                <Input className="mt-2 h-11 text-sm font-medium" maxLength={50} placeholder="O seu nome" value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })} />
              </label>
              <label className="block text-xs font-bold text-muted-foreground">Nickname
                <Input className="mt-2 h-11 text-sm font-medium" maxLength={30} value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value.replace(/[^a-zA-Z0-9_.-]/g, "") })} />
              </label>
              <label className="block text-xs font-bold text-muted-foreground">Biografia
                <Textarea className="mt-2 min-h-28 resize-none text-sm font-medium" maxLength={500} placeholder="Conte um pouco sobre você" value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} />
                <span className="mt-1 block text-right text-[10px] font-medium">{form.bio.length}/500</span>
              </label>

              <div className="flex items-center gap-3 rounded-lg border border-border bg-surface p-4">
                <div className="min-w-0 flex-1"><p className="text-sm font-bold">Perfil público</p><p className="mt-1 text-xs text-muted-foreground">Qualquer pessoa pode ver o seu perfil.</p></div>
                <Switch checked={!form.is_private} onCheckedChange={(checked) => setForm({ ...form, is_private: !checked })} aria-label="Perfil público" />
              </div>

              <div className="space-y-3 border-t border-border pt-5">
                <p className="text-xs font-bold text-muted-foreground">Cor do perfil</p>
                <div className="flex flex-wrap gap-2">
                  {ACCENT_COLORS.map((color) => (
                    <Button key={color} variant="ghost" size="icon" className={`h-8 w-8 rounded-full border-2 p-1 ${form.accent_color === color ? "border-foreground" : "border-transparent"}`} onClick={() => setForm({ ...form, accent_color: color })} aria-label={`Escolher cor ${color}`}><span className="h-full w-full rounded-full" style={{ backgroundColor: color }} /></Button>
                  ))}
                </div>
              </div>

              <div className="space-y-3 border-t border-border pt-5">
                <p className="text-xs font-bold text-muted-foreground">Fundo nos comentários</p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {COMMENT_BGS.map((background) => (
                    <Button key={background.id} variant="outline" className={`h-14 justify-start ${form.comment_bg === background.value ? "border-primary" : ""}`} onClick={() => setForm({ ...form, comment_bg: background.value })}><span className="h-7 w-9 rounded bg-surface-2" style={background.value ? { background: background.value } : undefined} /><span className="truncate text-xs">{background.label}</span></Button>
                  ))}
                </div>
              </div>

              <Button className="h-11 w-full text-xs font-bold" disabled={save.isPending || uploading !== null || !form.username.trim()} onClick={() => save.mutate({}, { onSuccess: () => onOpenChange(false) })}>
                <Check className="h-4 w-4" /> {save.isPending ? "Salvando…" : "Salvar dados"}
              </Button>
            </section>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
