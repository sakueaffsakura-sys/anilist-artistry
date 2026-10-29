import { useEffect, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Flag, Heart, Loader2, Plus, Trash2, Volume2, VolumeX, X } from "lucide-react";
import { toast } from "sonner";
import { SiteHeader } from "@/components/SiteHeader";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useRoles, useSession } from "@/hooks/useAuth";
import { useActiveProfile } from "@/lib/active-profile";
import { reelFileError } from "@/lib/reels";

export const Route = createFileRoute("/_authenticated/reels")({
  staticData: { sitemap: false },
  head: () => ({
    meta: [
      { title: "Reels — Better Mangá" },
      { name: "description", content: "Vídeos curtos publicados pela comunidade Better Mangá." },
      { property: "og:title", content: "Reels — Better Mangá" },
      { property: "og:description", content: "Assista e publique vídeos curtos da comunidade." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ReelsPage,
});

type Reel = {
  id: string; user_id: string; caption: string; video_path: string; status: string; created_at: string;
  profiles: { username: string; avatar_url: string | null } | null;
  reel_likes: { count: number }[];
  url?: string | undefined;
};

function videoDuration(file: File) {
  return new Promise<number>((resolve) => {
    const v = document.createElement("video");
    v.preload = "metadata";
    v.onloadedmetadata = () => { URL.revokeObjectURL(v.src); resolve(v.duration); };
    v.onerror = () => resolve(NaN);
    v.src = URL.createObjectURL(file);
  });
}

function ReelsPage() {
  const { user } = useSession();
  const { isAdmin } = useRoles(user?.id);
  const profile = useActiveProfile();
  const qc = useQueryClient();
  const [view, setView] = useState<"feed" | "mine" | "review">("feed");
  const [composer, setComposer] = useState(false);
  const [muted, setMuted] = useState(true);

  const reels = useQuery({
    queryKey: ["reels", view, user?.id],
    enabled: Boolean(user) && !profile.kidsMaxAge,
    queryFn: async () => {
      let q = supabase.from("reels").select("id, user_id, caption, video_path, status, created_at, profiles(username, avatar_url), reel_likes(count)").order("created_at", { ascending: false }).limit(30);
      q = view === "feed" ? q.eq("status", "approved") : view === "mine" ? q.eq("user_id", user!.id) : q.eq("status", "pending");
      const { data, error } = await q;
      if (error) throw error;
      const rows = (data ?? []) as unknown as Reel[];
      if (!rows.length) return rows;
      const { data: signed } = await supabase.storage.from("reels").createSignedUrls(rows.map((r) => r.video_path), 3600);
      return rows.map((r, i) => ({ ...r, url: signed?.[i]?.signedUrl ?? undefined }));
    },
  });

  const likes = useQuery({
    queryKey: ["reel-my-likes", user?.id],
    enabled: Boolean(user) && !profile.kidsMaxAge,
    queryFn: async () => {
      const { data, error } = await supabase.from("reel_likes").select("reel_id").eq("user_id", user!.id);
      if (error) throw error;
      return new Set(data.map((r) => r.reel_id));
    },
  });

  const refresh = () => { qc.invalidateQueries({ queryKey: ["reels"] }); qc.invalidateQueries({ queryKey: ["reel-my-likes"] }); };

  const like = useMutation({
    mutationFn: async (r: Reel) => {
      const op = likes.data?.has(r.id)
        ? supabase.from("reel_likes").delete().eq("reel_id", r.id).eq("user_id", user!.id)
        : supabase.from("reel_likes").insert({ reel_id: r.id, user_id: user!.id });
      const { error } = await op; if (error) throw error;
    },
    onSuccess: refresh, onError: () => toast.error("Não foi possível curtir."),
  });
  const moderate = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase.from("reels").update({ status }).eq("id", id); if (error) throw error;
    },
    onSuccess: () => { toast.success("Revisão salva."); refresh(); },
    onError: () => toast.error("Não foi possível salvar."),
  });
  const remove = useMutation({
    mutationFn: async (r: Reel) => {
      const { error } = await supabase.from("reels").delete().eq("id", r.id); if (error) throw error;
      await supabase.storage.from("reels").remove([r.video_path]);
    },
    onSuccess: () => { toast.success("Reel apagado."); refresh(); },
    onError: () => toast.error("Não foi possível apagar."),
  });
  async function report(r: Reel): Promise<void> {
    const reason = window.prompt("Por que você quer denunciar este vídeo?")?.trim();
    if (!reason) return;
    if (reason.length < 3) { toast.error("Escreva um motivo um pouco maior."); return; }
    const { error } = await supabase.from("reel_reports").insert({ reel_id: r.id, user_id: user!.id, reason: reason.slice(0, 500) });
    toast[error ? "error" : "success"](error ? "Denúncia já enviada ou indisponível." : "Denúncia enviada.");
  }

  if (profile.kidsMaxAge) {
    return <div className="min-h-screen bg-background"><SiteHeader /><main className="mx-auto max-w-lg px-4 py-20 text-center"><h1 className="text-2xl font-bold">Reels indisponíveis</h1><p className="mt-2 text-muted-foreground">Vídeos da comunidade não aparecem em perfis infantis.</p></main></div>;
  }

  const tabs = ["feed", "mine", ...(isAdmin ? ["review"] : [])] as const;
  const action = "flex flex-col items-center gap-1 text-[11px] font-bold text-foreground drop-shadow";
  const iconBtn = "grid h-12 w-12 place-items-center rounded-full bg-background/35 backdrop-blur-md transition hover:bg-primary/25 active:scale-90";

  return (
    <div className="reels-page min-h-screen bg-background">
      <div className="hidden lg:block"><SiteHeader /></div>
      <div className="lg:hidden"><MobileNav /></div>
      <main className="relative mx-auto h-[calc(100dvh-4rem-env(safe-area-inset-bottom))] max-w-[480px] lg:h-[calc(100dvh-4rem)] lg:py-4">
        <div className="pointer-events-none absolute inset-x-0 top-0 z-20 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 bg-gradient-to-b from-background/80 to-transparent px-4 pb-8 pt-4 lg:top-4 lg:rounded-t-2xl">
          <div className="pointer-events-auto flex min-w-0 gap-4 font-display text-sm font-bold">
            {tabs.map((v) => (
              <button key={v} type="button" onClick={() => setView(v as typeof view)} className={`relative pb-1 transition ${view === v ? "text-foreground" : "text-foreground/55"}`}>
                {v === "feed" ? "Para você" : v === "mine" ? "Meus" : "Revisar"}
                {view === v ? <span className="absolute inset-x-1 -bottom-0.5 h-0.5 rounded-full bg-primary shadow-[var(--shadow-glow)]" /> : null}
              </button>
            ))}
          </div>
          <Button size="sm" className="pointer-events-auto shrink-0 rounded-full" onClick={() => setComposer(true)}><Plus className="h-4 w-4" /> Publicar</Button>
        </div>
        {composer ? <div className="absolute inset-x-3 top-16 z-30"><Composer userId={user!.id} onClose={() => setComposer(false)} onDone={() => { setComposer(false); setView("mine"); refresh(); }} /></div> : null}
        <div className="h-full snap-y snap-mandatory overflow-y-auto overscroll-contain [scrollbar-width:none] lg:rounded-2xl lg:border lg:border-border">
          {reels.isLoading ? <div className="flex h-full items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-primary" /></div> : null}
          {reels.isError ? <p className="flex h-full items-center justify-center text-muted-foreground">Não foi possível carregar os vídeos.</p> : null}
          {reels.data?.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 px-8 text-center">
              <Clapperboard className="h-10 w-10 text-primary" />
              <p className="font-display text-lg font-bold">Nenhum vídeo por aqui ainda</p>
              <Button className="rounded-full" onClick={() => setComposer(true)}><Plus className="h-4 w-4" /> Publicar o primeiro</Button>
            </div>
          ) : null}
          {reels.data?.map((r) => (
            <article key={r.id} className="relative h-full snap-start snap-always overflow-hidden bg-surface">
              {r.url ? <AutoVideo src={r.url} muted={muted} /> : <div className="flex h-full items-center justify-center text-muted-foreground">Vídeo indisponível</div>}
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-background via-background/50 to-transparent" />
              <div className="absolute bottom-6 right-2 z-10 flex flex-col items-center gap-4">
                {r.status === "approved" ? (
                  <>
                    <button type="button" className={action} aria-label="Curtir" onClick={() => like.mutate(r)}>
                      <span className={iconBtn}><Heart className={`h-6 w-6 ${likes.data?.has(r.id) ? "fill-primary text-primary" : ""}`} /></span>
                      {r.reel_likes?.[0]?.count ?? 0}
                    </button>
                    <button type="button" className={action} aria-label="Compartilhar" onClick={() => { void navigator.clipboard?.writeText(`${window.location.origin}/reels`); toast.success("Link copiado."); }}>
                      <span className={iconBtn}><Send className="h-6 w-6" /></span>Enviar
                    </button>
                    {r.user_id !== user?.id ? (
                      <button type="button" className={action} aria-label="Denunciar" onClick={() => report(r)}><span className={iconBtn}><Flag className="h-5 w-5" /></span>Denunciar</button>
                    ) : null}
                  </>
                ) : null}
                {view === "review" ? (
                  <>
                    <button type="button" className={action} aria-label="Aprovar" onClick={() => moderate.mutate({ id: r.id, status: "approved" })}><span className={`${iconBtn} bg-primary text-primary-foreground`}><Check /></span>Aprovar</button>
                    <button type="button" className={action} aria-label="Recusar" onClick={() => moderate.mutate({ id: r.id, status: "rejected" })}><span className={`${iconBtn} bg-destructive text-destructive-foreground`}><X /></span>Recusar</button>
                  </>
                ) : null}
                {r.user_id === user?.id || isAdmin ? (
                  <button type="button" className={action} aria-label="Apagar" onClick={() => window.confirm("Apagar este vídeo?") && remove.mutate(r)}><span className={iconBtn}><Trash2 className="h-5 w-5" /></span>Apagar</button>
                ) : null}
                <button type="button" className={action} aria-label={muted ? "Ativar som" : "Silenciar"} onClick={() => setMuted(!muted)}><span className={iconBtn}>{muted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}</span></button>
              </div>
              <div className="absolute inset-x-0 bottom-0 z-10 p-4 pb-6 pr-20">
                <Link to="/u/$username" params={{ username: r.profiles?.username ?? "" }} className="flex min-w-0 items-center gap-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-full border-2 border-primary bg-surface-2">
                    {r.profiles?.avatar_url ? <img src={r.profiles.avatar_url} alt="" className="h-full w-full object-cover" /> : <User2 className="h-5 w-5 text-muted-foreground" />}
                  </span>
                  <span className="truncate font-display font-bold">{r.profiles?.username ?? "leitor"}</span>
                  <span className="shrink-0 rounded-lg border border-foreground/40 px-3 py-1 text-xs font-bold">Ver perfil</span>
                </Link>
                {r.caption ? <p className="mt-2 line-clamp-2 text-sm text-foreground/90">{r.caption}</p> : null}
                {r.status !== "approved" ? <span className="mt-2 inline-block rounded-full bg-primary/20 px-2.5 py-0.5 text-xs font-bold text-primary">{r.status === "pending" ? "Em revisão" : "Recusado"}</span> : null}
              </div>
            </article>
          ))}
        </div>
      </main>
    </div>
  );
}

function AutoVideo({ src, muted }: { src: string; muted: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const obs = new IntersectionObserver((entries) => { if (entries[0]?.isIntersecting) void el.play().catch(() => undefined); else el.pause(); }, { threshold: 0.6 });
    obs.observe(el); return () => obs.disconnect();
  }, []);
  return (
    <>
      <video ref={ref} src={src} muted={muted} loop playsInline preload="metadata" className="h-full w-full bg-background object-cover" onTimeUpdate={(e) => setProgress(e.currentTarget.currentTime / (e.currentTarget.duration || 1))} onClick={(e) => (e.currentTarget.paused ? e.currentTarget.play() : e.currentTarget.pause())} />
      <div className="absolute inset-x-0 bottom-0 z-20 h-0.5 bg-foreground/15"><div className="h-full bg-primary" style={{ width: `${progress * 100}%` }} /></div>
    </>
  );
}

function Composer({ userId, onClose, onDone }: { userId: string; onClose: () => void; onDone: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [caption, setCaption] = useState("");
  const [busy, setBusy] = useState(false);
  async function send(): Promise<void> {
    if (!file) { toast.error("Escolha um vídeo."); return; }
    const duration = await videoDuration(file);
    const problem = reelFileError(file, duration);
    if (problem) { toast.error(problem); return; }
    setBusy(true);
    const path = `${userId}/${crypto.randomUUID()}.${file.type === "video/webm" ? "webm" : "mp4"}`;
    const up = await supabase.storage.from("reels").upload(path, file, { contentType: file.type });
    if (up.error) { setBusy(false); toast.error("Não foi possível enviar o vídeo."); return; }
    const { error } = await supabase.from("reels").insert({ user_id: userId, caption: caption.trim().slice(0, 500), video_path: path, duration_seconds: Math.round(duration * 10) / 10 });
    setBusy(false);
    if (error) { await supabase.storage.from("reels").remove([path]); toast.error("Não foi possível publicar."); return; }
    toast.success("Vídeo enviado para revisão."); onDone();
  }
  return (
    <section className="mb-4 space-y-3 rounded-xl border border-border bg-surface p-4">
      <div className="flex items-center justify-between"><h2 className="font-bold">Novo reel</h2><Button size="icon" variant="ghost" aria-label="Fechar" onClick={onClose}><X /></Button></div>
      <input type="file" accept="video/mp4,video/webm" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="block w-full text-sm" />
      <Textarea value={caption} maxLength={500} onChange={(e) => setCaption(e.target.value)} placeholder="Legenda (opcional)" />
      <p className="text-xs text-muted-foreground">MP4 ou WebM, até 90 segundos e 50 MB. Os vídeos passam por revisão antes de aparecer para todos.</p>
      <Button onClick={send} disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Enviar</Button>
    </section>
  );
}
