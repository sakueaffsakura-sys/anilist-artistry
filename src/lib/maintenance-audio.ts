export async function playMaintenanceAudio(video: Pick<HTMLVideoElement, "muted" | "volume" | "play">) {
  video.muted = false;
  video.volume = 1;
  try {
    await video.play();
    return true;
  } catch (error) {
    // Loading/network failures are not autoplay denials. Keep sound enabled
    // so the media-ready retry can start with audio rather than silently.
    if (!(error instanceof Error) || error.name !== "NotAllowedError") return false;
    video.muted = true;
    await video.play().catch(() => undefined);
    return false;
  }
}