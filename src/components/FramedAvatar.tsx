import { User2 } from "lucide-react";

const LEGACY: Record<string, string> = {
  cyan: "#22d3ee", gold: "#facc15", fire: "#f97316", sakura: "#f472b6", violet: "#a78bfa",
};

export const isFrameUrl = (f?: string | null) => !!f && /^https?:\/\//.test(f);

/** Avatar com moldura em imagem por cima (GIF/APNG/WebP animados continuam animados). */
export function FramedAvatar({ src, frame, size, className = "" }: { src?: string | null; frame?: string | null; size: number; className?: string }) {
  const url = isFrameUrl(frame) ? frame! : null;
  const ring = !url ? LEGACY[frame ?? ""] ?? "var(--primary)" : null;
  return (
    <div className={`relative shrink-0 ${className}`} style={{ width: size, height: size }}>
      <div
        className="h-full w-full overflow-hidden rounded-full border-4 border-background bg-surface-2"
        style={ring ? { boxShadow: `0 0 0 2px ${ring}` } : undefined}
      >
        {src ? <img loading="lazy" decoding="async" src={src} alt="" className="h-full w-full object-cover" /> : (
          <div className="grid h-full w-full place-items-center"><User2 className="h-1/3 w-1/3 text-muted-foreground" /></div>
        )}
      </div>
      {url ? (
        <img loading="lazy" decoding="async" src={url} alt="" draggable={false} className="pointer-events-none absolute left-1/2 top-1/2 max-w-none -translate-x-1/2 -translate-y-1/2" style={{ width: size * 1.22, height: size * 1.22 }} />
      ) : null}
    </div>
  );
}
