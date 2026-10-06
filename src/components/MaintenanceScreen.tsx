import { useEffect, useRef } from "react";
import night from "@/assets/maintenance-night.jpg";

export type MaintenanceDisplay = { title: string; message: string; media_kind: string; media_url: string };
export function MaintenanceScreen({ settings, preview = false }: { settings: MaintenanceDisplay; preview?: boolean }) {
  const video = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const element = video.current;
    if (!element || preview) return;
    let active = true;
    void element.play().catch(() => {
      if (!active) return;
      element.muted = true;
      void element.play().catch(() => undefined);
    });
    const sound = () => { element.muted = false; void element.play().catch(() => { element.muted = true; }); };
    window.addEventListener("pointerdown", sound);
    window.addEventListener("keydown", sound);
    return () => { active = false; window.removeEventListener("pointerdown", sound); window.removeEventListener("keydown", sound); element.pause(); };
  }, [settings.media_url, preview]);
  return <section className={`maintenance-screen ${preview ? "maintenance-preview" : ""}`} aria-label="Aviso de manutenção">
    <img src={night} alt="" className="maintenance-backdrop" width={1920} height={1088} />
    {settings.media_kind === "video" && settings.media_url ?
      <video ref={video} src={settings.media_url} className="maintenance-backdrop" autoPlay loop playsInline muted={preview} controls={false} disablePictureInPicture disableRemotePlayback preload="auto" aria-hidden="true" /> :
      settings.media_url ? <img src={settings.media_url} alt="" className="maintenance-backdrop" /> : null}
    <div className="maintenance-shade" />
    <div className="maintenance-copy">
      <div className="maintenance-status"><span /> BETTER MANGÁ · EM MANUTENÇÃO</div>
      <h1>{settings.title}</h1>
      <p>{settings.message}</p>
      <div className="maintenance-rule" />
    </div>
  </section>;
}