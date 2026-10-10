import { useEffect, useRef, useState } from "react";
import night from "@/assets/maintenance-night.jpg";
import { BookOpen, Volume2, Wrench } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { playMaintenanceAudio } from "@/lib/maintenance-audio";

export type MaintenanceDisplay = { title: string; message: string; media_kind: string; media_url: string };
export function MaintenanceScreen({ settings, preview = false }: { settings: MaintenanceDisplay; preview?: boolean }) {
  const video = useRef<HTMLVideoElement>(null);
  const screen = useRef<HTMLElement>(null);
  const [needsAudio, setNeedsAudio] = useState(true);
  useEffect(() => {
    const element = video.current;
    setNeedsAudio(true);
    if (!element || settings.media_kind !== "video") return;
    let active = true;
    let pending = false;
    const attempt = async () => {
      if (!active || pending) return;
      pending = true;
      const playing = await playMaintenanceAudio(element);
      pending = false;
      if (active) setNeedsAudio(!playing);
    };
    const interaction = () => { if (element.muted || element.paused) void attempt(); };
    const resume = () => { if (document.visibilityState === "visible") void attempt(); };
    const target = preview ? screen.current : document;
    target?.addEventListener("pointerdown", interaction);
    target?.addEventListener("keydown", interaction);
    document.addEventListener("visibilitychange", resume);
    void attempt();
    return () => {
      active = false;
      target?.removeEventListener("pointerdown", interaction);
      target?.removeEventListener("keydown", interaction);
      document.removeEventListener("visibilitychange", resume);
      element.pause();
    };
  }, [settings.media_url, settings.media_kind, preview]);
  const enableAudio = async () => {
    const element = video.current;
    if (!element) return;
    const playing = await playMaintenanceAudio(element);
    if (video.current === element) setNeedsAudio(!playing);
  };
  return <section ref={screen} className={cn("maintenance-screen", preview && "maintenance-preview")} aria-label="Aviso de manutenção">
    <img src={night} alt="" className="maintenance-backdrop" width={1920} height={1088} />
    {settings.media_kind === "video" && settings.media_url ?
      <video ref={video} src={settings.media_url} className="maintenance-backdrop" autoPlay loop playsInline muted onVolumeChange={() => { if (video.current) setNeedsAudio(video.current.muted); }} controls={false} disablePictureInPicture disableRemotePlayback preload="metadata" aria-hidden="true" /> :
      settings.media_url ? <img src={settings.media_url} alt="" className="maintenance-backdrop" decoding="async" /> : null}
    <div className="maintenance-shade" />
    <header className="maintenance-topbar"><div className="maintenance-brand"><BookOpen aria-hidden="true" /><span>BETTER <strong>MANGÁ</strong></span></div><Wrench className="maintenance-tool" aria-hidden="true" /></header>
    <div className="maintenance-copy">
      <div className="maintenance-status"><span /> EM MANUTENÇÃO</div>
      <h1>{settings.title}</h1>
      <p>{settings.message}</p>
      {settings.media_kind === "video" && settings.media_url ? <div className="maintenance-audio">
        {needsAudio ? <Button onClick={() => void enableAudio()}><Volume2 className="mr-2 h-4 w-4" />Ativar áudio</Button> : <span role="status"><Volume2 aria-hidden="true" />Áudio ativo</span>}
      </div> : null}
    </div>
    <footer className="maintenance-footer"><span>MANGÁS · MANHWAS · NOVELS</span><span>Voltamos em breve<span className="maintenance-footer-dot">.</span></span></footer>
  </section>;
}