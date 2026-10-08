import { useCallback, useEffect, useRef, useState } from "react";
import { Pause, Play, Square, Volume2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { fetchSpeech, getAudioContext, SpeechError } from "@/lib/realistic-speech";

const AI_VOICES = [
  { id: "240c6c29d4a54e35983a8982eeae3d66", label: "Fish Audio (narrador)" },
  { id: "Kore", label: "Kore (feminina)" },
  { id: "Aoede", label: "Aoede (feminina suave)" },
  { id: "Leda", label: "Leda (feminina jovem)" },
  { id: "Charon", label: "Charon (masculina grave)" },
  { id: "Orus", label: "Orus (masculina firme)" },
  { id: "Puck", label: "Puck (masculina animada)" },
];

// Group sentences into ~900-char pieces: longer pieces give the AI narrator
// more context, so prosody and pauses sound more natural (server caps at 1200).
function aiChunks(paragraphs: string[]) {
  const out: { p: number; text: string }[] = [];
  paragraphs.forEach((para, p) => {
    const parts = chunkText(para);
    let buf = "";
    for (const s of parts) {
      if (buf && buf.length + s.length > 900) {
        out.push({ p, text: buf });
        buf = "";
      }
      buf = buf ? `${buf} ${s}` : s;
    }
    if (buf) out.push({ p, text: buf });
  });
  return out;
}

type Props = {
  paragraphs: string[];
  activeIndex: number | null;
  onActiveChange: (index: number | null) => void;
  onFinished?: () => void;
};

const MAX_CHUNK = 180;
const ctxReady = () => typeof window !== "undefined" && "AudioContext" in window;

// Split long paragraphs into short sentence chunks: browsers (Chrome) silently
// stop long utterances after ~15s, so short pieces keep narration reliable.
function chunkText(text: string): string[] {
  const sentences = text.match(/[^.!?…]+[.!?…]+["'”»)]*\s*|[^.!?…]+$/g) ?? [text];
  const out: string[] = [];
  for (const raw of sentences) {
    let s = raw.trim();
    while (s.length > MAX_CHUNK) {
      let cut = s.lastIndexOf(",", MAX_CHUNK);
      if (cut < 60) cut = s.lastIndexOf(" ", MAX_CHUNK);
      if (cut < 60) cut = MAX_CHUNK;
      out.push(s.slice(0, cut + 1).trim());
      s = s.slice(cut + 1).trim();
    }
    if (s) out.push(s);
  }
  return out.filter((c) => /[\p{L}\p{N}]/u.test(c));
}

export function NovelNarrator({ paragraphs, activeIndex, onActiveChange, onFinished }: Props) {
  const [supported, setSupported] = useState(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [voiceUri, setVoiceUri] = useState("");
  const [rate, setRate] = useState(1);
  const [state, setState] = useState<"idle" | "playing" | "paused">("idle");
  const [engine, setEngine] = useState<"ai" | "device">("ai");
  const [aiVoice, setAiVoice] = useState("Kore");
  const [loading, setLoading] = useState(false);
  const ai = useRef<{
    abort: AbortController | null;
    source: AudioBufferSourceNode | null;
    index: number;
    cache: Map<number, Promise<Float32Array>>;
  }>({ abort: null, source: null, index: 0, cache: new Map() });

  // Refs so callbacks always see fresh values (no stale closures).
  const pos = useRef({ p: 0, c: 0 });
  const session = useRef(0); // increments on every start/stop; old utterance events are ignored
  const settings = useRef({ rate: 1, voice: undefined as SpeechSynthesisVoice | undefined });
  const paragraphsRef = useRef(paragraphs);
  const callbacks = useRef({ onActiveChange, onFinished });
  callbacks.current = { onActiveChange, onFinished };
  paragraphsRef.current = paragraphs;
  settings.current = { rate, voice: voices.find((v) => v.voiceURI === voiceUri) };

  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    setSupported(true);
    try {
      const saved = JSON.parse(localStorage.getItem("novel-tts") ?? "{}");
      if (typeof saved.rate === "number") setRate(saved.rate);
      if (typeof saved.voice === "string") setVoiceUri(saved.voice);
      if (saved.engine === "ai" || saved.engine === "device") setEngine(saved.engine);
      if (typeof saved.aiVoice === "string") setAiVoice(saved.aiVoice);
    } catch {
      /* ignore */
    }
    const load = () => {
      const all = window.speechSynthesis.getVoices();
      const pt = all.filter((v) => v.lang.toLowerCase().replace("_", "-").startsWith("pt"));
      pt.sort((a, b) => Number(b.lang.includes("BR")) - Number(a.lang.includes("BR")));
      setVoices(pt);
      setVoiceUri((cur) => (pt.some((v) => v.voiceURI === cur) ? cur : pt[0]?.voiceURI || ""));
    };
    load();
    window.speechSynthesis.addEventListener("voiceschanged", load);
    return () => {
      window.speechSynthesis.removeEventListener("voiceschanged", load);
      session.current++;
      window.speechSynthesis.cancel();
    };
  }, []);

  useEffect(() => {
    if (!supported) return;
    localStorage.setItem("novel-tts", JSON.stringify({ rate, voice: voiceUri, engine, aiVoice }));
  }, [rate, voiceUri, engine, aiVoice, supported]);

  const stopAi = useCallback(() => {
    ai.current.abort?.abort();
    ai.current.abort = null;
    try {
      ai.current.source?.stop();
    } catch {
      /* already stopped */
    }
    ai.current.source = null;
    ai.current.cache.clear();
    if (ctxReady() && getAudioContext().state === "suspended") void getAudioContext().resume();
    setLoading(false);
  }, []);

  const stop = useCallback(() => {
    stopAi();
    session.current++;
    if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
    setState("idle");
    callbacks.current.onActiveChange(null);
  }, [stopAi]);

  const play = useCallback((p: number, c = 0) => {
    const synth = window.speechSynthesis;
    const id = ++session.current;
    synth.cancel();
    setState("playing");

    const speak = (pi: number, ci: number) => {
      if (id !== session.current) return;
      const list = paragraphsRef.current;
      if (pi >= list.length) {
        session.current++;
        setState("idle");
        callbacks.current.onActiveChange(null);
        callbacks.current.onFinished?.();
        return;
      }
      const chunks = chunkText(list[pi] ?? "");
      if (ci >= chunks.length) return speak(pi + 1, 0);
      pos.current = { p: pi, c: ci };
      if (ci === 0) {
        callbacks.current.onActiveChange(pi);
        document.getElementById(`novel-p-${pi}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      }
      const u = new SpeechSynthesisUtterance(chunks[ci] ?? "");
      u.lang = settings.current.voice?.lang ?? "pt-BR";
      u.rate = settings.current.rate;
      if (settings.current.voice) u.voice = settings.current.voice;
      let done = false;
      const next = () => {
        if (done) return;
        done = true;
        clearTimeout(watchdog);
        speak(pi, ci + 1);
      };
      // Watchdog: some browsers never fire onend; move on after a generous timeout.
      const watchdog = window.setTimeout(next, 4000 + ((chunks[ci]?.length ?? 0) * 160) / settings.current.rate);
      u.onend = next;
      u.onerror = (e) => {
        if (e.error === "interrupted" || e.error === "canceled") {
          done = true;
          clearTimeout(watchdog);
          return;
        }
        if (e.error === "not-allowed") {
          done = true;
          clearTimeout(watchdog);
          if (id === session.current) {
            session.current++;
            setState("idle");
          }
          return;
        }
        next();
      };
      // Small delay after cancel() avoids Chrome dropping the first utterance.
      window.setTimeout(() => id === session.current && synth.speak(u), ci === 0 && pi === p ? 60 : 0);
    };
    speak(p, c);
  }, []);

  const aiSettings = useRef({ voice: aiVoice, rate });
  aiSettings.current = { voice: aiVoice, rate };

  const playAi = useCallback(
    async (startParagraph: number) => {
      stopAi();
      window.speechSynthesis?.cancel();
      const id = ++session.current;
      const chunks = aiChunks(paragraphsRef.current);
      let i = Math.max(0, chunks.findIndex((c) => c.p >= startParagraph));
      const controller = new AbortController();
      ai.current.abort = controller;
      let context: AudioContext;
      try {
        context = getAudioContext();
        if (context.state === "suspended") await context.resume();
      } catch {
        // Audio output unavailable on this device: use the device voice instead.
        toast.error("Este aparelho não permitiu o áudio da voz realista. Usando a voz do aparelho.");
        setEngine("device");
        play(startParagraph, 0);
        return;
      }
      setState("playing");
      const voice = aiSettings.current.voice;
      const get = (k: number) => {
        if (k >= chunks.length) return null;
        let pr = ai.current.cache.get(k);
        if (!pr) {
          pr = fetchSpeech(chunks[k]!.text, voice, controller.signal);
          // Never keep a rejected promise cached: a transient hiccup would
          // otherwise fail that piece forever, even on retry.
          pr.catch(() => {
            if (ai.current.cache.get(k) === pr) ai.current.cache.delete(k);
          });
          ai.current.cache.set(k, pr);
        }
        return pr;
      };
      // Retry a piece a couple of times before giving up on the AI voice:
      // a single dropped stream shouldn't kick the reader to the device voice.
      const getWithRetry = async (k: number) => {
        let lastError: unknown;
        for (let attempt = 0; attempt < 3; attempt++) {
          if (id !== session.current || controller.signal.aborted) throw new SpeechError("cancelado", 0);
          try {
            return await get(k)!;
          } catch (err) {
            lastError = err;
            const status = (err as SpeechError).status;
            if (status === 401 || status === 402 || controller.signal.aborted) throw err;
            await new Promise((r) => setTimeout(r, 600 * (attempt + 1)));
          }
        }
        throw lastError;
      };
      try {
        while (i < chunks.length && id === session.current) {
          const chunk = chunks[i]!;
          ai.current.index = i;
          setLoading(!ai.current.cache.has(i));
          const samples = await getWithRetry(i);
          if (id !== session.current) return;
          setLoading(false);
          get(i + 1); // prefetch the next piece while this one plays (no gaps)
          if (chunk.p !== pos.current.p || i === 0 || chunks[i - 1]?.p !== chunk.p) {
            pos.current = { p: chunk.p, c: 0 };
            callbacks.current.onActiveChange(chunk.p);
            document.getElementById(`novel-p-${chunk.p}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
          }
          const buffer = context.createBuffer(1, samples.length, 24000);
          buffer.copyToChannel(samples as Float32Array<ArrayBuffer>, 0);
          const src = context.createBufferSource();
          src.buffer = buffer;
          src.playbackRate.value = aiSettings.current.rate;
          src.connect(context.destination);
          ai.current.source = src;
          await new Promise<void>((resolve) => {
            src.onended = () => resolve();
            src.start(context.currentTime + 0.03);
          });
          ai.current.cache.delete(i);
          i++;
        }
        if (id === session.current) {
          session.current++;
          setState("idle");
          callbacks.current.onActiveChange(null);
          callbacks.current.onFinished?.();
        }
      } catch (e) {
        if (id !== session.current || controller.signal.aborted) return;
        setLoading(false);
        const err = e as SpeechError;
        if (import.meta.env.DEV) console.error("[narrador] voz realista falhou", err);
        const reason =
          err.status === 401
            ? "Entre na sua conta para usar a voz realista."
            : err.status === 402
              ? "Créditos de voz realista esgotados."
              : err.status === 429
                ? "Muitas leituras ao mesmo tempo."
                : `A voz realista falhou (${err.message || "erro desconhecido"}).`;
        toast.error(`${reason} Continuando com a voz do aparelho.`);
        const p = chunks[i]?.p ?? startParagraph;
        setEngine("device");
        play(p, 0);
      }
    },
    [play, stopAi],
  );

  // Chrome pauses forever after long idle; keep engine awake while playing.
  useEffect(() => {
    if (state !== "playing" || engine !== "device") return;
    const t = window.setInterval(() => {
      const s = window.speechSynthesis;
      if (s.speaking && !s.paused) {
        s.pause();
        s.resume();
      }
    }, 10000);
    return () => clearInterval(t);
  }, [state, engine]);

  // Chapter changed: stop.
  useEffect(() => {
    stop();
    pos.current = { p: 0, c: 0 };
  }, [paragraphs, stop]);

  // User tapped a paragraph while playing: jump there.
  useEffect(() => {
    if (activeIndex == null || state === "idle") return;
    if (activeIndex !== pos.current.p) {
      if (engine !== "device") void playAi(activeIndex);
      else play(activeIndex, 0);
    }
  }, [activeIndex, state, play, playAi, engine]);

  if (!supported || paragraphs.length === 0) return null;

  // Pause = cancel + remember position (native pause/resume is broken on Android).
  const toggle = () => {
    if (engine !== "device") {
      const c = getAudioContext();
      if (state === "playing") {
        void c.suspend();
        setState("paused");
      } else if (state === "paused" && ai.current.source) {
        void c.resume();
        setState("playing");
      } else {
        void playAi(state === "paused" ? pos.current.p : (activeIndex ?? 0));
      }
      return;
    }
    if (state === "playing") {
      session.current++;
      window.speechSynthesis.cancel();
      setState("paused");
    } else if (state === "paused") {
      play(pos.current.p, pos.current.c);
    } else {
      play(activeIndex ?? 0, 0);
    }
  };

  const restartIfPlaying = () => {
    if (state === "idle") return;
    if (engine !== "device") {
      if (getAudioContext().state === "suspended") void getAudioContext().resume();
      setTimeout(() => void playAi(pos.current.p), 0);
    } else if (state === "playing") setTimeout(() => play(pos.current.p, pos.current.c), 0);
  };

  return (
    <div className="mb-8 flex flex-wrap items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 p-3">
      <Volume2 className="h-5 w-5 text-primary" />
      <span className="mr-auto text-sm font-bold">
        Narração automática
        {loading ? <span className="ml-2 text-xs font-normal text-muted-foreground">preparando voz…</span> : null}
      </span>
      <Button size="sm" onClick={toggle} disabled={loading && state === "playing" && !ai.current.source} aria-label={state === "playing" ? "Pausar" : "Ouvir"}>
        {state === "playing" ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        {state === "playing" ? "Pausar" : state === "paused" ? "Continuar" : "Ouvir"}
      </Button>
      {state !== "idle" ? (
        <Button size="sm" variant="outline" onClick={stop} aria-label="Parar">
          <Square className="h-4 w-4" />
        </Button>
      ) : null}
      <select
        className="h-9 rounded-md border border-border bg-background px-2 text-xs"
        value={engine}
        onChange={(e) => {
          stop();
          setEngine(e.target.value as "ai" | "device");
        }}
        aria-label="Tipo de voz"
      >
        <option value="ai">Voz realista (IA)</option>
        <option value="device">Voz do aparelho</option>
      </select>
      <select
        className="h-9 rounded-md border border-border bg-background px-2 text-xs"
        value={rate}
        onChange={(e) => {
          const r = Number(e.target.value);
          setRate(r);
          if (engine !== "device") {
            if (ai.current.source) ai.current.source.playbackRate.value = r;
          } else restartIfPlaying();
        }}
        aria-label="Velocidade"
      >
        {[0.75, 1, 1.25, 1.5, 1.75, 2].map((r) => (
          <option key={r} value={r}>{r}x</option>
        ))}
      </select>
      {engine === "ai" ? (
        <select
          className="h-9 max-w-48 rounded-md border border-border bg-background px-2 text-xs"
          value={aiVoice}
          onChange={(e) => {
            setAiVoice(e.target.value);
            restartIfPlaying();
          }}
          aria-label="Voz"
        >
          {AI_VOICES.map((v) => (
            <option key={v.id} value={v.id}>{v.label}</option>
          ))}
        </select>
      ) : voices.length > 1 ? (
        <select
          className="h-9 max-w-44 rounded-md border border-border bg-background px-2 text-xs"
          value={voiceUri}
          onChange={(e) => {
            setVoiceUri(e.target.value);
            restartIfPlaying();
          }}
          aria-label="Voz"
        >
          {voices.map((v) => (
            <option key={v.voiceURI} value={v.voiceURI}>{v.name}</option>
          ))}
        </select>
      ) : null}
      <p className="w-full text-xs text-muted-foreground">
        {engine === "ai"
          ? "Voz natural de narrador em português (requer login). Toque em um parágrafo para ouvir a partir dele."
          : voices.length === 0
            ? "Nenhuma voz em português encontrada neste aparelho; será usada a voz padrão."
            : "Toque em um parágrafo para ouvir a partir dele."}
      </p>
    </div>
  );
}
