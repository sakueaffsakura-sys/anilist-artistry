import { createParser } from "eventsource-parser";
import { supabase } from "@/integrations/supabase/client";

export class SpeechError extends Error {
  constructor(message: string, public status = 0) {
    super(message);
  }
}

let ctx: AudioContext | null = null;
export function getAudioContext() {
  if (!ctx || ctx.state === "closed") ctx = new AudioContext({ sampleRate: 24000 });
  return ctx;
}

/** Fetches the full PCM audio for a text chunk (buffered so the next one can be prefetched). */
export async function fetchSpeech(text: string, voice: string, signal: AbortSignal): Promise<Float32Array> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new SpeechError("Faça login para usar a voz realista", 401);
  const res = await fetch("/api/tts", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ text, voice }),
    signal,
  });
  if (!res.ok || !res.body) {
    const msg = await res.text().catch(() => "");
    let parsed = msg;
    try {
      parsed = JSON.parse(msg)?.error?.message ?? JSON.parse(msg)?.message ?? msg;
    } catch {
      /* plain */
    }
    throw new SpeechError(parsed || `Erro ${res.status}`, res.status);
  }
  if (res.headers.get("content-type")?.includes("audio/pcm")) {
    const raw = new Uint8Array(await res.arrayBuffer());
    if (raw.length < 2) throw new SpeechError("Áudio vazio", 502);
    const v = new DataView(raw.buffer, 0, raw.length - (raw.length % 2));
    const pcm = new Float32Array(v.byteLength / 2);
    for (let i = 0; i < pcm.length; i++) pcm[i] = v.getInt16(i * 2, true) / 32768;
    return pcm;
  }
  const parts: Uint8Array[] = [];
  let total = 0;
  let done = false;
  let failure: string | null = null;
  const parser = createParser({
    onEvent(ev) {
      try {
        const p = JSON.parse(ev.data) as { type: string; audio?: string; error?: { message?: string } };
        if (p.type === "error" || p.error) failure = p.error?.message ?? "Falha na voz";
        else if (p.type === "speech.audio.done") done = true;
        else if (p.type === "speech.audio.delta" && p.audio) {
          const b = Uint8Array.from(atob(p.audio), (c) => c.charCodeAt(0));
          parts.push(b);
          total += b.length;
        }
      } catch {
        /* ignore malformed keep-alives */
      }
    },
  });
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  try {
    while (true) {
      const n = await reader.read();
      if (n.done) break;
      parser.feed(n.value);
    }
    parser.feed("\n\n"); // flush a last event that arrived without its trailing blank line
  } catch (e) {
    if (signal.aborted) throw e;
    // Connection dropped mid-stream: keep whatever audio already arrived.
  }
  if (failure && total < 4800) throw new SpeechError(failure, 502);
  // The "done" marker is sometimes lost at the end of the stream; usable audio is still fine.
  if (total < 4800 && !done) throw new SpeechError("Áudio incompleto", 502);
  if (total < 2) throw new SpeechError("Áudio vazio", 502);
  const bytes = new Uint8Array(total - (total % 2));
  let off = 0;
  for (const part of parts) {
    const take = Math.min(part.length, bytes.length - off);
    bytes.set(part.subarray(0, take), off);
    off += take;
  }
  const view = new DataView(bytes.buffer);
  const out = new Float32Array(bytes.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = view.getInt16(i * 2, true) / 32768;
  return out;
}
