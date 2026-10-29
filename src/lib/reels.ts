export const REEL_MAX_BYTES = 50 * 1024 * 1024;
export const REEL_MAX_SECONDS = 90;
export const REEL_TYPES = ["video/mp4", "video/webm"] as const;

/** Returns an error message, or null when the video can be sent. */
export function reelFileError(file: { type: string; size: number }, duration: number) {
  if (!REEL_TYPES.includes(file.type as (typeof REEL_TYPES)[number])) return "Envie um vídeo MP4 ou WebM.";
  if (file.size > REEL_MAX_BYTES) return "O vídeo pode ter no máximo 50 MB.";
  if (!Number.isFinite(duration) || duration <= 0 || duration > REEL_MAX_SECONDS) return "O vídeo pode ter no máximo 90 segundos.";
  return null;
}
