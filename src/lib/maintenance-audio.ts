export async function playMaintenanceAudio(video: Pick<HTMLVideoElement, "muted" | "volume" | "play">) {
  video.muted = false;
  video.volume = 1;
  try {
    await video.play();
    return true;
  } catch {
    video.muted = true;
    await video.play().catch(() => undefined);
    return false;
  }
}