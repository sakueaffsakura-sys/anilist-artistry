import { useRef, useState } from "react";
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
  chapters: { number: number }[];
};

function Perfil() {
  const { username } = Route.useParams();
  const { user } = useSession();
  const qc = useQueryClient();
  const [tab, setTab] = useState<"colecao" | "listas" | "comentarios" | "tags">("colecao");
  const [collectionTab, setCollectionTab] = useState<"favoritos" | "continuando" | "interessado" | "lendo" | "lido" | "dropado" | "planejo">("favoritos");
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
        supabase.from("favorites").select("created_at, series(id, slug, title, cover_url, kind, rating, chapters(number))").eq("user_id", p.id).order("created_at", { ascending: false }).limit(48),
        supabase.from("reading_status").select("status, updated_at, series(id, slug, title, cover_url, kind, rating, chapters(number))").eq("user_id", p.id).order("updated_at", { ascending: false }).limit(48),
        supabase.from("reading_history").select("updated_at, series_id, chapters(number), series(id, slug, title, cover_url, kind, rating, chapters(number))").eq("user_id", p.id).order("updated_at", { ascending: false }).limit(48),
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
    enabled: Boolean(p),
    queryFn: async () => {
      const { data } = await supabase
        .from("profile_comments")
        .select("id, body, created_at, author_id")
        .eq("profile_id", p!.id)
        .order("created_at", { ascending: false })
        .limit(50);
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
        <p className="mx-auto max-w-7xl px-4 py-16 text-muted-foreground">Carregando…</p>
      </div>
    );
  }
  if (!p) {
    return (
      <div className="min-h-screen">
        <SiteHeader />
        <p className="mx-auto max-w-7xl px-4 py-16 text-muted-foreground">Perfil não encontrado.</p>
      </div>
    );
  }

  const levelFloor = Math.max(0, (p.level - 1) * 1000);
  const xpInLevel = Math.max(0, p.xp - levelFloor);
  const xpGoal = 1000;
  const menu = isMe
    ? [
        { to: "/biblioteca", label: "Coleção", icon: Library },
        { to: "/listas", label: "Minhas listas", icon: ListOrdered },
        { to: "/historico", label: "Histórico", icon: History },
      ]
    : [];
  const collectionTabs = [
    { id: "favoritos", label: "Favoritos", shortLabel: "Favoritos", icon: Heart },
    { id: "continuando", label: "Continue lendo", shortLabel: "Continue", icon: BookOpen },
    { id: "interessado", label: "Interessado", shortLabel: "Interessado", icon: Sparkles },
    { id: "lendo", label: "Lendo", shortLabel: "Lendo", icon: Play },
    { id: "lido", label: "Lido", shortLabel: "Lido", icon: Check },
    { id: "dropado", label: "Dropado", shortLabel: "Dropado", icon: Ban },
    { id: "planejo", label: "Planejo Ler", shortLabel: "Planejo Ler", icon: BookmarkPlus },
  ] as const;
  const continuedSeries = (() => {
    const seen = new Set<string>();
    return (stats.data?.readingHistory ?? []).filter((row) => {
      if (seen.has(row.series_id)) return false;
      seen.add(row.series_id);
      return true;
    }).map((row) => row.series);
  })();
  const collectionItems = collectionTab === "favoritos"
    ? (stats.data?.favorites ?? [])
    : collectionTab === "continuando"
      ? continuedSeries
      : (stats.data?.readingStatuses ?? []).filter((row) => row.status === collectionTab).map((row) => row.series);
  const readCount = (stats.data?.readingStatuses ?? []).filter((row) => row.status === "lido").length;
  const joinedAt = new Date(p.created_at).toLocaleDateString("pt-BR", { month: "short", year: "numeric" });

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="pb-10">
        <div className="relative h-48 overflow-hidden bg-surface sm:h-80">
          {p.banner_url ? (
            <img src={p.banner_url} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="h-full w-full bg-[radial-gradient(ellipse_at_top,var(--primary),transparent_70%)] opacity-30" />
          )}
          <span className="absolute inset-0 bg-gradient-to-t from-background via-background/60 to-transparent" />
          <Button asChild variant="secondary" size="icon" className="absolute left-4 top-4 rounded-full bg-background/40 backdrop-blur-md sm:left-6 sm:top-6">
            <Link to="/" aria-label="Voltar"><ArrowLeft className="h-5 w-5" /></Link>
          </Button>
        </div>

        <OwnerProfileHeader
          profile={p}
          followers={stats.data?.followers ?? 0}
          following={stats.data?.following ?? 0}
          totalRank={stats.data?.totalRank ?? 0}
          weeklyRank={stats.data?.weeklyRank ?? 0}
          badges={stats.data?.badges ?? []}
          isAdmin={stats.data?.isAdmin ?? false}
          xpInLevel={xpInLevel}
          xpGoal={xpGoal}
          joinedAt={joinedAt}
          onEdit={() => setEditing(true)}
          action={isMe ? (
            <Button variant="secondary" className="col-span-2 rounded-lg text-xs font-bold" onClick={() => setEditing(true)}><Pencil className="h-3.5 w-3.5" /> Editar perfil</Button>
          ) : user ? (
            <Button className="col-span-2 rounded-lg text-xs font-bold" variant={stats.data?.iFollow ? "outline" : "default"} onClick={() => follow.mutate()}><UserPlus className="h-3.5 w-3.5" /> {stats.data?.iFollow ? "Seguindo" : "Seguir"}</Button>
          ) : null}
        />

        {isMe ? (
          <OwnerOverview
            collectionCount={(stats.data?.favorites.length ?? 0) + (stats.data?.readingStatuses.length ?? 0)}
            readingCount={(stats.data?.readingStatuses ?? []).filter((row) => row.status === "lendo").length}
            readCount={readCount}
            favoritesCount={stats.data?.favorites.length ?? 0}
            commentsCount={stats.data?.comments ?? 0}
            followersCount={stats.data?.followers ?? 0}
            badges={stats.data?.badges ?? []}
            tier={p.subscription_tier}
            isAdmin={stats.data?.isAdmin ?? false}
            onEdit={() => setEditing(true)}
          />
        ) : <>
          <OwnerOverview
            isMe={false}
            collectionCount={(stats.data?.favorites.length ?? 0) + (stats.data?.readingStatuses.length ?? 0)}
            readingCount={(stats.data?.readingStatuses ?? []).filter((row) => row.status === "lendo").length}
            readCount={readCount}
            favoritesCount={stats.data?.favorites.length ?? 0}
            commentsCount={stats.data?.comments ?? 0}
            followersCount={stats.data?.followers ?? 0}
            badges={stats.data?.badges ?? []}
            tier={p.subscription_tier}
            isAdmin={stats.data?.isAdmin ?? false}
            onEdit={() => setEditing(true)}
          />
          <div className="mx-auto max-w-7xl px-4 sm:px-6">

          <section className="min-w-0 pt-6">
            <div className="sticky top-0 z-20 -mx-4 overflow-x-auto border-y border-border bg-background/80 px-4 py-2 backdrop-blur-xl [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:mx-0 sm:rounded-lg sm:border">
              <div className="flex min-w-max items-center gap-1">
                {([
                  { id: "colecao", label: "Coleção", icon: Library },
                  { id: "listas", label: "Listas", icon: ListOrdered },
                  { id: "comentarios", label: "Comentários", icon: MessageSquare },
                  { id: "tags", label: "Tags", icon: Tag },
                ] as const).map((item) => (
                  <Button
                    key={item.id}
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setTab(item.id)}
                    className={tab === item.id ? "bg-primary/15 text-primary hover:bg-primary/20 hover:text-primary" : "text-muted-foreground"}
                  >
                    <item.icon className="mr-1.5 h-3.5 w-3.5" /> {item.label}
                  </Button>
                ))}
              </div>
            </div>

            {tab === "colecao" ? (
              <div className="mt-5">
                <div className="mb-5 overflow-x-auto rounded-lg border border-border bg-background/70 p-1.5 backdrop-blur-xl no-scrollbar md:hidden">
                  <div className="flex min-w-max items-center gap-1">
                    {collectionTabs.map((item, index) => (
                      <div key={item.id} className="flex items-center gap-1">
                        {index === 2 ? <span className="mx-0.5 h-6 w-px bg-border" /> : null}
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setCollectionTab(item.id)}
                          className={collectionTab === item.id ? "bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground" : "text-muted-foreground"}
                        >
                          <item.icon className={`mr-1.5 h-3.5 w-3.5 ${item.id === "favoritos" && collectionTab === item.id ? "fill-current" : ""}`} />
                          {item.shortLabel}
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="grid items-start gap-6 md:grid-cols-[190px_minmax(0,1fr)]">
                  <aside className="sticky top-24 hidden overflow-hidden rounded-lg border border-border bg-surface/70 p-2 backdrop-blur-xl md:block">
                    <p className="px-3 pb-1.5 pt-2 text-[10px] font-black uppercase text-muted-foreground">Principal</p>
                    {collectionTabs.slice(0, 2).map((item) => (
                      <Button key={item.id} type="button" variant="ghost" onClick={() => setCollectionTab(item.id)} className={`mb-0.5 w-full justify-start ${collectionTab === item.id ? "bg-primary/15 text-primary hover:bg-primary/20 hover:text-primary" : "text-muted-foreground"}`}>
                        <item.icon className={`mr-2 h-4 w-4 ${item.id === "favoritos" && collectionTab === item.id ? "fill-current" : ""}`} /> {item.label}
                      </Button>
                    ))}
                    <div className="mx-3 my-2 h-px bg-border" />
                    <p className="px-3 pb-1.5 pt-1 text-[10px] font-black uppercase text-muted-foreground">Status</p>
                    {collectionTabs.slice(2).map((item) => (
                      <Button key={item.id} type="button" variant="ghost" onClick={() => setCollectionTab(item.id)} className={`mb-0.5 w-full justify-start ${collectionTab === item.id ? "bg-primary/15 text-primary hover:bg-primary/20 hover:text-primary" : "text-muted-foreground"}`}>
                        <item.icon className="mr-2 h-4 w-4" /> {item.label}
                      </Button>
                    ))}
                  </aside>

                  <div className="min-w-0">
                    <div className="mb-4 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
                      <h2 className="truncate font-display text-xl font-extrabold">{collectionTabs.find((item) => item.id === collectionTab)?.label}</h2>
                      <span className="text-xs text-muted-foreground">{collectionItems.length} obras</span>
                    </div>
                    <div className="grid grid-cols-2 gap-x-3 gap-y-6 sm:grid-cols-3 xl:grid-cols-4">
                      {collectionItems.map((series) => {
                        const chapters = series.chapters ?? [];
                        const latest = chapters.reduce((max, chapter) => Math.max(max, Number(chapter.number)), 0);
                        return (
                          <article key={series.id} className="group min-w-0">
                            <Link to="/obra/$slug" params={{ slug: series.slug }} className="block">
                              <div className="relative aspect-[2/3] overflow-hidden rounded-lg border border-border bg-surface shadow-[var(--shadow-card)] transition group-hover:border-primary/60">
                                <img src={coverUrl(series.cover_url)} alt={series.title} className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]" loading="lazy" />
                                <span className="cover-fade" />
                                <div className="absolute left-2 top-2 flex items-center gap-1.5 rounded-md bg-background/85 px-2 py-1 text-[11px] font-extrabold">
                                  <span className="flex items-center gap-1"><BookOpen className="h-3 w-3 text-primary" />{chapters.length}</span>
                                  <span className="h-3 w-px bg-border" />
                                  <span className="flex items-center gap-1 text-gold"><Star className="h-3 w-3 fill-current" />{Number(series.rating || 0).toFixed(1).replace(".", ",")}</span>
                                </div>
                                <span className="absolute bottom-2 left-2 rounded-md border border-primary/50 bg-background/85 px-2 py-1 text-[10px] font-extrabold uppercase text-primary">{series.kind || "Mangá"}</span>
                              </div>
                              <h3 className="mt-2 line-clamp-2 text-sm font-bold leading-tight transition group-hover:text-primary">{series.title}</h3>
                              <p className="mt-1 text-xs text-muted-foreground">{latest > 0 ? `Cap. ${latest}` : `${chapters.length} capítulos`}</p>
                            </Link>
                          </article>
                        );
                      })}
                      {collectionItems.length === 0 ? <p className="col-span-full py-10 text-center text-sm text-muted-foreground">Nenhuma obra nesta seção.</p> : null}
                    </div>
                  </div>
                </div>
              </div>
            ) : null}

            {tab === "listas" ? (
              <div className="mt-5 space-y-3">
                <h2 className="font-display text-lg font-bold">Listas públicas</h2>
                {(stats.data?.publicLists ?? []).map((list) => (
                  <Link key={list.id} to="/listas/$id" params={{ id: list.id }} className="flex items-center gap-3 rounded-lg border border-border bg-surface p-4 transition hover:border-primary/50">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"><ListOrdered className="h-5 w-5" /></span>
                    <span className="min-w-0"><b className="block truncate text-sm">{list.title}</b><span className="line-clamp-1 text-xs text-muted-foreground">{list.description || "Lista de leitura"}</span></span>
                    <ChevronRight className="ml-auto h-4 w-4 text-muted-foreground" />
                  </Link>
                ))}
                {stats.data?.publicLists.length === 0 ? <p className="py-8 text-sm text-muted-foreground">Nenhuma lista pública.</p> : null}
              </div>
            ) : null}

            {tab === "tags" ? (
              <div className="mt-5">
                <h2 className="font-display text-lg font-bold">Tags e selos</h2>
                <div className="mt-4 flex flex-wrap gap-3">
                  <UserBadges tier={p.subscription_tier} badges={stats.data?.badges} isAdmin={stats.data?.isAdmin} size={52} />
                  {!p.subscription_tier || p.subscription_tier === "none" ? null : <span className="self-center text-sm text-muted-foreground">Selo de assinatura</span>}
                  {(stats.data?.badges.length ?? 0) === 0 && !stats.data?.isAdmin && p.subscription_tier === "none" ? <p className="py-8 text-sm text-muted-foreground">Nenhuma tag conquistada.</p> : null}
                </div>
              </div>
            ) : null}

            {tab === "comentarios" ? <div className="mt-5">
              <h2 className="flex items-center gap-2 font-display text-lg font-bold">
                <MessageSquare className="h-5 w-5 text-primary" /> Comentários do perfil
              </h2>
              {user ? (
                <div className="mt-4 rounded-lg border border-border bg-surface p-4">
                <Textarea
                  value={body}
                  maxLength={2000}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder={isMe ? "Comentar no seu perfil..." : `Comentar no perfil de @${p.username}...`}
                  className="min-h-20 border-none bg-transparent p-0 focus-visible:ring-0"
                />
                <div className="mt-2 flex items-center justify-end gap-3">
                  <span className="text-xs text-muted-foreground">{body.length}/2000</span>
                  <Button size="sm" disabled={!body.trim() || post.isPending} onClick={() => post.mutate()}>
                    <Send className="mr-2 h-4 w-4" /> Comentar
                  </Button>
                </div>
              </div>
              ) : (
              <p className="mt-4 text-sm text-muted-foreground"><Link to="/auth" className="text-primary">Entre</Link> para comentar.</p>
              )}
              <ul className="mt-6 space-y-5">
              {(comments.data ?? []).map((c) => (
                <li
                  key={c.id}
                  className="flex gap-3 rounded-xl p-3"
                  style={p.comment_bg ? { background: p.comment_bg } : undefined}
                >
                  <span className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-full bg-surface-2 text-sm font-bold">
                    {c.author?.avatar_url ? <img loading="lazy" decoding="async" src={c.author.avatar_url} alt="" className="h-full w-full object-cover" /> : (c.author?.username ?? "?")[0]?.toUpperCase()}
                  </span>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <Link to="/u/$username" params={{ username: c.author?.username ?? "" }} className="text-sm font-bold hover:text-primary">
                        {c.author?.username ?? "leitor"}
                        <span className="ml-2 rounded border border-border px-1 text-[10px] text-muted-foreground">Nv. {c.author?.level ?? 1}</span>
                      </Link>
                      <span className="text-xs text-muted-foreground">{timeAgo(c.created_at)}</span>
                    </div>
                    <p className="mt-1 whitespace-pre-line text-sm text-muted-foreground">{c.body}</p>
                    {user && (user.id === c.author_id || isMe) ? (
                      <button onClick={() => del.mutate(c.id)} className="mt-1 flex items-center gap-1 text-xs text-destructive">
                        <Trash2 className="h-3 w-3" /> Excluir
                      </button>
                    ) : null}
                  </div>
                </li>
              ))}
              </ul>
            </div> : null}
          </section>
        </div></>}
      </main>
      {isMe ? <EditProfile open={editing} onOpenChange={setEditing} profile={p} /> : null}
      <SiteFooter />
    </div>
  );
}

type OwnerProfile = {
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  avatar_frame: string | null;
  level: number;
  xp: number;
  subscription_tier: string | null;
};

function OwnerProfileHeader({
  profile,
  followers,
  following,
  totalRank,
  weeklyRank,
  badges,
  isAdmin,
  xpInLevel,
  xpGoal,
  joinedAt,
  onEdit,
  action,
}: {
  action?: React.ReactNode;
  profile: OwnerProfile & { bio?: string | null; accent_color?: string | null };
  followers: number;
  following: number;
  totalRank: number;
  weeklyRank: number;
  badges: Badge[];
  isAdmin: boolean;
  xpInLevel: number;
  xpGoal: number;
  joinedAt: string;
  onEdit: () => void;
}) {
  const percentage = Math.min(100, Math.round((xpInLevel / xpGoal) * 100));
  return (
    <section className="relative z-10 mx-auto -mt-16 max-w-7xl px-4 sm:-mt-24 sm:px-6">
      <div className="grid gap-4 rounded-xl border border-border bg-background/85 p-4 shadow-[var(--shadow-hero)] backdrop-blur-2xl sm:p-6 lg:grid-cols-[auto_minmax(0,1fr)_auto] lg:items-center">
        <div className="flex justify-center lg:justify-start">
          <div className="relative rounded-full bg-background p-1.5">
            <FramedAvatar src={profile.avatar_url} frame={profile.avatar_frame} size={128} />
            <span className="absolute -bottom-1 left-1/2 z-30 -translate-x-1/2 whitespace-nowrap rounded-full border border-primary/40 bg-background px-2.5 py-1 text-[10px] font-extrabold text-primary">Nível {profile.level}</span>
          </div>
        </div>
        <div className="min-w-0 text-center lg:text-left">
          <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
            <h1 className="truncate font-display text-2xl font-extrabold sm:text-3xl" style={profile.accent_color ? { color: profile.accent_color } : undefined}>{profile.display_name || profile.username}</h1>
            <UserBadges variant="inline" size={26} tier={profile.subscription_tier} badges={badges} isAdmin={isAdmin} />
          </div>
          <p className="mt-1 text-sm text-muted-foreground">@{profile.username}</p>
          {profile.bio ? <p className="mx-auto mt-2 max-w-2xl text-sm text-foreground/80 lg:mx-0">{profile.bio}</p> : null}
          <div className="mt-3 flex flex-wrap justify-center gap-2 lg:justify-start">
            <Link to="/ranking-leitores" className="rounded-md border border-border bg-surface/70 px-2.5 py-1 text-[11px] font-semibold text-foreground/75 hover:border-primary/40 hover:text-primary">Global #{totalRank || "—"}</Link>
            <Link to="/ranking-leitores" className="rounded-md border border-border bg-surface/70 px-2.5 py-1 text-[11px] font-semibold text-foreground/75 hover:border-primary/40 hover:text-primary">Semanal #{weeklyRank || "—"}</Link>
            <span className="inline-flex items-center gap-1.5 px-1 text-[11px] text-muted-foreground"><CalendarDays className="h-3.5 w-3.5" /> Desde {joinedAt}</span>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 lg:w-52">
          <div className="rounded-lg border border-border bg-surface/60 p-3 text-center"><b className="block text-lg">{followers}</b><span className="text-[9px] font-bold uppercase text-muted-foreground">Seguidores</span></div>
          <div className="rounded-lg border border-border bg-surface/60 p-3 text-center"><b className="block text-lg">{following}</b><span className="text-[9px] font-bold uppercase text-muted-foreground">Seguindo</span></div>
          {action}
        </div>
        <div className="lg:col-start-2 lg:col-span-2">
          <div className="mb-2 flex justify-between text-[10px] font-bold uppercase text-muted-foreground"><span>{profile.xp.toLocaleString("pt-BR")} XP total</span><span>{percentage}% do nível</span></div>
          <div className="h-2 overflow-hidden rounded-full bg-surface-2"><div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${percentage}%` }} /></div>
          <p className="mt-1.5 text-[11px] text-muted-foreground">{xpInLevel.toLocaleString("pt-BR")} / {xpGoal.toLocaleString("pt-BR")} XP para o próximo nível</p>
        </div>
      </div>
    </section>
  );
}

function OwnerOverview({ isMe = true, collectionCount, readingCount, readCount, favoritesCount, commentsCount, followersCount, badges, tier, isAdmin, onEdit }: {
  isMe?: boolean;
  collectionCount: number;
  readingCount: number;
  readCount: number;
  favoritesCount: number;
  commentsCount: number;
  followersCount: number;
  badges: Badge[];
  tier: string | null;
  isAdmin: boolean;
  onEdit: () => void;
}) {
  const cards = [
    { label: "Na coleção", value: collectionCount, icon: BookOpen },
    { label: "Lendo", value: readingCount, icon: Play },
    { label: "Completadas", value: readCount, icon: Check },
    { label: "Favoritos", value: favoritesCount, icon: Heart },
    { label: "Comentários", value: commentsCount, icon: MessageSquare },
    { label: "Seguidores", value: followersCount, icon: Users },
  ];
  return (
    <section className="relative z-10 mx-auto max-w-7xl px-4 pb-12 pt-6 sm:px-6">
      <div className="min-w-0">
        {isMe ? <nav className="flex items-center gap-1 overflow-x-auto border-b border-border py-2 no-scrollbar">
          <Button variant="ghost" className="relative rounded-none text-primary after:absolute after:inset-x-4 after:bottom-0 after:h-0.5 after:rounded-full after:bg-primary"><LayoutGrid className="h-4 w-4" /> Visão geral</Button>
          <Button asChild variant="ghost" className="rounded-none text-muted-foreground"><Link to="/biblioteca"><Library className="h-4 w-4" /> Coleção</Link></Button>
          <Button variant="ghost" className="rounded-none text-muted-foreground" onClick={onEdit}><Settings className="h-4 w-4" /> Configurações</Button>
        </nav> : null}
        <div className="mt-6 grid gap-4 lg:grid-cols-12">
          <div className="lg:col-span-7">
            <h2 className="mb-4 text-xs font-extrabold uppercase text-muted-foreground">{isMe ? "Sua atividade" : "Atividade"}</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {cards.map((card) => (
              <div key={card.label} className="group flex min-h-32 flex-col justify-between rounded-lg border border-border bg-surface/45 p-4 transition-colors hover:border-primary/40">
                <span className="grid h-9 w-9 place-items-center rounded-lg bg-primary/10 text-primary"><card.icon className="h-4 w-4" /></span>
                <div><b className="block text-2xl font-black tabular-nums">{card.value}</b><span className="text-[11px] font-semibold uppercase text-muted-foreground">{card.label}</span></div>
              </div>
            ))}
            </div>
          </div>
          <div className="min-w-0 rounded-lg border border-border bg-surface/30 p-5 lg:col-span-5">
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
              <div className="min-w-0"><h2 className="font-display text-base font-bold">{isMe ? "Meus selos" : "Selos"}</h2><p className="mt-1 text-xs text-muted-foreground">Conquistas deste leitor</p></div>
              {isMe ? <Button variant="outline" size="sm" onClick={onEdit}><Settings className="h-3.5 w-3.5" /> Personalizar</Button> : null}
            </div>
            <div className="mt-5 min-h-24 max-w-full overflow-hidden rounded-lg border border-border bg-background/35 p-3">
              <UserBadges tier={tier} badges={badges} isAdmin={isAdmin} size={40} />
              {badges.length === 0 && !isAdmin && (!tier || tier === "none") ? <span className="text-sm text-muted-foreground">Nenhum selo conquistado.</span> : null}
            </div>
            <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">Passe sobre um selo para ver o nome da conquista.</p>
          </div>
        </div>
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
      <DialogContent className="h-[100dvh] w-screen max-w-none gap-0 overflow-y-auto rounded-none border-0 bg-background p-0 sm:h-[min(92dvh,900px)] sm:w-[min(94vw,1080px)] sm:max-w-5xl sm:rounded-xl sm:border [&>button:last-child]:hidden">
        <DialogHeader className="sr-only">
          <DialogTitle>Editar perfil</DialogTitle>
        </DialogHeader>
        <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-border bg-background/95 px-4 py-3 backdrop-blur-xl md:px-8">
          <Button variant="ghost" size="icon" onClick={() => onOpenChange(false)} aria-label="Voltar">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="min-w-0">
            <h1 className="text-base font-black uppercase">Editar perfil</h1>
            <p className="hidden text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground sm:block">Avatar · Banner · Moldura · Dados pessoais</p>
          </div>
        </header>

        <div className="mx-auto w-full max-w-5xl px-4 py-6 md:px-8 md:py-8">
          <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[1fr_1.4fr] lg:gap-6">
            <div className="space-y-4">
              <section className="space-y-4 rounded-lg border border-border bg-card p-5">
                <h2 className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.25em] text-muted-foreground"><User2 className="h-3 w-3" /> Foto de perfil</h2>
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
                <h2 className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.25em] text-muted-foreground"><ImageIcon className="h-3 w-3" /> Banner</h2>
                <Button variant="ghost" className="group relative h-32 w-full overflow-hidden rounded-lg bg-surface-2 p-0" onClick={() => bannerInput.current?.click()}>
                  {form.banner_url ? <img src={form.banner_url} alt="Banner atual" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" /> : <ImageIcon className="h-7 w-7 text-muted-foreground" />}
                  <span className="absolute inset-0 grid place-items-center bg-background/60 opacity-0 transition-opacity group-hover:opacity-100"><span className="flex items-center gap-2 text-xs font-bold"><Upload className="h-4 w-4" /> Alterar banner</span></span>
                </Button>
                <div className="flex justify-end"><Button variant="secondary" size="sm" onClick={() => bannerInput.current?.click()} disabled={uploading !== null}>{uploading === "banner" ? "Enviando…" : "Escolher"}</Button></div>
                <input ref={bannerInput} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (file) void upload("banner", file); e.target.value = ""; }} />
              </section>

              <section className="space-y-4 rounded-lg border border-border bg-card p-5">
                <h2 className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.25em] text-muted-foreground"><Shapes className="h-3 w-3" /> Moldura</h2>
                <div className="flex items-center gap-3">
                  <div className="grid h-14 w-14 shrink-0 place-items-center rounded-lg bg-surface-2">{form.avatar_frame ? <img src={form.avatar_frame} alt="Moldura atual" className="h-14 w-14 object-contain" /> : <span className="text-[9px] font-bold uppercase text-muted-foreground">Nenhuma</span>}</div>
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
              <h2 className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.25em] text-muted-foreground"><Pencil className="h-3 w-3" /> Dados pessoais</h2>
              <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">Nome
                <Input className="mt-2 h-11 text-sm font-medium normal-case tracking-normal" maxLength={50} placeholder="O seu nome" value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })} />
              </label>
              <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">Nickname
                <Input className="mt-2 h-11 text-sm font-medium normal-case tracking-normal" maxLength={30} value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value.replace(/[^a-zA-Z0-9_.-]/g, "") })} />
              </label>
              <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">Biografia
                <Textarea className="mt-2 min-h-28 resize-none text-sm font-medium normal-case tracking-normal" maxLength={500} placeholder="Conte um pouco sobre você" value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} />
                <span className="mt-1 block text-right text-[10px] font-medium normal-case tracking-normal">{form.bio.length}/500</span>
              </label>

              <div className="flex items-center gap-3 rounded-lg border border-border bg-surface p-4">
                <div className="min-w-0 flex-1"><p className="text-sm font-bold">Perfil público</p><p className="mt-1 text-xs text-muted-foreground">Qualquer pessoa pode ver o seu perfil.</p></div>
                <Switch checked={!form.is_private} onCheckedChange={(checked) => setForm({ ...form, is_private: !checked })} aria-label="Perfil público" />
              </div>

              <div className="space-y-3 border-t border-border pt-5">
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">Cor do perfil</p>
                <div className="flex flex-wrap gap-2">
                  {ACCENT_COLORS.map((color) => (
                    <Button key={color} variant="ghost" size="icon" className={`h-8 w-8 rounded-full border-2 p-1 ${form.accent_color === color ? "border-foreground" : "border-transparent"}`} onClick={() => setForm({ ...form, accent_color: color })} aria-label={`Escolher cor ${color}`}><span className="h-full w-full rounded-full" style={{ backgroundColor: color }} /></Button>
                  ))}
                </div>
              </div>

              <div className="space-y-3 border-t border-border pt-5">
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">Fundo nos comentários</p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {COMMENT_BGS.map((background) => (
                    <Button key={background.id} variant="outline" className={`h-14 justify-start ${form.comment_bg === background.value ? "border-primary" : ""}`} onClick={() => setForm({ ...form, comment_bg: background.value })}><span className="h-7 w-9 rounded bg-surface-2" style={background.value ? { background: background.value } : undefined} /><span className="truncate text-xs">{background.label}</span></Button>
                  ))}
                </div>
              </div>

              <Button className="h-11 w-full text-xs font-black uppercase tracking-widest" disabled={save.isPending || uploading !== null || !form.username.trim()} onClick={() => save.mutate({}, { onSuccess: () => onOpenChange(false) })}>
                <Check className="h-4 w-4" /> {save.isPending ? "Salvando…" : "Salvar dados"}
              </Button>
            </section>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
