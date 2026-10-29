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
  url?: string;
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
  async function report(r: Reel) {
    const reason = window.prompt("Por que você quer denunciar este vídeo?")?.trim();
    if (!reason) return;
    if (reason.length < 3) return toast.error("Escreva um motivo um pouco maior.");
    const { error } = await supabase.from("reel_reports").insert({ reel_id: r.id, user_id: user!.id, reason: reason.slice(0, 500) });
    toast[error ? "error" : "success"](error ? "Denúncia já enviada ou indisponível." : "Denúncia enviada.");
  }

  if (profile.kidsMaxAge) {
    return <div className="min-h-screen bg-background"><SiteHeader /><main className="mx-auto max-w-lg px-4 py-20 text-center"><h1 className="text-2xl font-bold">Reels indisponíveis</h1><p className="mt-2 text-muted-foreground">Vídeos da comunidade não aparecem em perfis infantis.</p></main></div>;
  }

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="mx-auto max-w-xl px-3 pb-24 pt-4">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <h1 className="mr-auto text-2xl font-bold">Reels</h1>
          {(["feed", "mine", ...(isAdmin ? ["review"] : [])] as const).map((v) => (
            <Button key={v} size="sm" variant={view === v ? "default" : "secondary"} onClick={() => setView(v as typeof view)}>
              {v === "feed" ? "Para você" : v === "mine" ? "Meus" : "Revisar"}
            </Button>
          ))}
          <Button size="sm" onClick={() => setComposer(true)}><Plus className="h-4 w-4" /> Publicar</Button>
        </div>
        {composer ? <Composer userId={user!.id} onClose={() => setComposer(false)} onDone={() => { setComposer(false); setView("mine"); refresh(); }} /> : null}
        {reels.isLoading ? <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div> : null}
        {reels.isError ? <p className="py-20 text-center text-muted-foreground">Não foi possível carregar os vídeos.</p> : null}
        {reels.data?.length === 0 ? <p className="py-20 text-center text-muted-foreground">Nenhum vídeo por aqui ainda.</p> : null}
        <div className="h-[calc(100dvh-10rem)] snap-y snap-mandatory space-y-4 overflow-y-auto rounded-xl">
          {reels.data?.map((r) => (
            <article key={r.id} className="relative h-full snap-start overflow-hidden rounded-xl border border-border bg-surface">
              {r.url ? <AutoVideo src={r.url} muted={muted} /> : <div className="flex h-full items-center justify-center text-muted-foreground">Vídeo indisponível</div>}
              <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-background via-background/70 to-transparent p-4 pr-16">
                <p className="font-semibold">@{r.profiles?.username ?? "leitor"}</p>
                {r.caption ? <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{r.caption}</p> : null}
                {r.status !== "approved" ? <span className="mt-2 inline-block rounded-full bg-primary/15 px-2 py-0.5 text-xs text-primary">{r.status === "pending" ? "Em revisão" : "Recusado"}</span> : null}
              </div>
              <div className="absolute bottom-4 right-3 flex flex-col items-center gap-3">
                <Button size="icon" variant="secondary" aria-label={muted ? "Ativar som" : "Silenciar"} onClick={() => setMuted(!muted)}>{muted ? <VolumeX /> : <Volume2 />}</Button>
                {r.status === "approved" ? (
                  <>
                    <Button size="icon" variant="secondary" aria-label="Curtir" onClick={() => like.mutate(r)}><Heart className={likes.data?.has(r.id) ? "fill-primary text-primary" : ""} /></Button>
                    <span className="text-xs font-bold">{r.reel_likes?.[0]?.count ?? 0}</span>
                    {r.user_id !== user?.id ? <Button size="icon" variant="secondary" aria-label="Denunciar" onClick={() => report(r)}><Flag /></Button> : null}
                  </>
                ) : null}
                {view === "review" ? (
                  <>
                    <Button size="icon" aria-label="Aprovar" onClick={() => moderate.mutate({ id: r.id, status: "approved" })}><Check /></Button>
                    <Button size="icon" variant="destructive" aria-label="Recusar" onClick={() => moderate.mutate({ id: r.id, status: "rejected" })}><X /></Button>
                  </>
                ) : null}
                {r.user_id === user?.id || isAdmin ? (
                  <Button size="icon" variant="secondary" aria-label="Apagar" onClick={() => window.confirm("Apagar este vídeo?") && remove.mutate(r)}><Trash2 /></Button>
                ) : null}
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
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) void el.play().catch(() => undefined); else el.pause(); }, { threshold: 0.6 });
    obs.observe(el); return () => obs.disconnect();
  }, []);
  return <video ref={ref} src={src} muted={muted} loop playsInline preload="metadata" className="h-full w-full bg-background object-contain" onClick={(e) => (e.currentTarget.paused ? e.currentTarget.play() : e.currentTarget.pause())} />;
}

function Composer({ userId, onClose, onDone }: { userId: string; onClose: () => void; onDone: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [caption, setCaption] = useState("");
  const [busy, setBusy] = useState(false);
  async function send() {
    if (!file) return toast.error("Escolha um vídeo.");
    const duration = await videoDuration(file);
    const problem = reelFileError(file, duration);
    if (problem) return toast.error(problem);
    setBusy(true);
    const path = `${userId}/${crypto.randomUUID()}.${file.type === "video/webm" ? "webm" : "mp4"}`;
    const up = await supabase.storage.from("reels").upload(path, file, { contentType: file.type });
    if (up.error) { setBusy(false); return toast.error("Não foi possível enviar o vídeo."); }
    const { error } = await supabase.from("reels").insert({ user_id: userId, caption: caption.trim().slice(0, 500), video_path: path, duration_seconds: Math.round(duration * 10) / 10 });
    setBusy(false);
    if (error) { await supabase.storage.from("reels").remove([path]); return toast.error("Não foi possível publicar."); }
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
