import { useEffect } from "react";
import clickSound from "@/assets/click-sound.mp3.asset.json";

/** One shared player survives navigation without creating per-button listeners. */
export function ClickSound() {
  useEffect(() => {
    const audio = new Audio(clickSound.url);
    audio.preload = "auto";
    audio.volume = 0.35;

    const onClick = (event: MouseEvent) => {
      if (!(event.target instanceof Element)) return;
      const control = event.target.closest(
        'button, a[href], [role="button"], [role="tab"], [role="menuitem"], [role="checkbox"], [role="switch"], input[type="submit"], input[type="button"], input[type="checkbox"], input[type="radio"]',
      );
      if (!control || control.matches(':disabled, [aria-disabled="true"], [data-state="disabled"]')) return;
      audio.currentTime = 0;
      void audio.play().catch(() => undefined);
    };

    document.addEventListener("click", onClick, true);
    return () => {
      document.removeEventListener("click", onClick, true);
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
    };
  }, []);

  return null;
}