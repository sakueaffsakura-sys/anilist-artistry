import { createFileRoute } from "@tanstack/react-router";

const MODEL = "google/gemini-3.1-flash-tts-preview";
const VOICES = new Set(["Kore", "Charon", "Aoede", "Puck", "Fenrir", "Leda", "Orus", "Zephyr"]);
const FISH_VOICE = "240c6c29d4a54e35983a8982eeae3d66";

export const Route = createFileRoute("/api/tts")({
  staticData: { sitemap: false },
  server: {
    handlers: {
      POST: async ({ request }) => {
        // LOVABLE_API_KEY só serve à voz realista da Lovable. Fora da Lovable (cPanel) ela fica ausente
        // e a Fish Audio continua funcionando; sem voz disponível o cliente usa a voz do aparelho.
        const apiKey = process.env["LOVABLE_API_KEY"];
        const url = process.env["SUPABASE_URL"];
        const pub = process.env["SUPABASE_PUBLISHABLE_KEY"];
        if (!url || !pub) return new Response("Servidor sem configuração", { status: 500 });

        // Only signed-in users may generate speech (it costs credits).
        const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
        if (!token) return new Response("Faça login para usar a voz realista", { status: 401 });
        const who = await fetch(`${url}/auth/v1/user`, { headers: { apikey: pub, Authorization: `Bearer ${token}` } });
        if (!who.ok) return new Response("Sessão inválida", { status: 401 });

        const body = (await request.json().catch(() => null)) as { text?: string; voice?: string } | null;
        const text = body?.text?.trim().slice(0, 1200);
        if (!text) return new Response("Texto vazio", { status: 400 });
        if (body?.voice === FISH_VOICE) {
          const fishKey = process.env["FISH_AUDIO_API_KEY"];
          if (!fishKey) return new Response("Voz Fish Audio não configurada", { status: 500 });
          try {
            const up = await fetch("https://api.fish.audio/v1/tts", {
              method: "POST",
              headers: { Authorization: `Bearer ${fishKey}`, "Content-Type": "application/json", model: "s1" },
              body: JSON.stringify({ text, reference_id: FISH_VOICE, format: "pcm", sample_rate: 24000 }),
              signal: request.signal,
            });
            if (!up.ok) {
              const msg = await up.text().catch(() => "");
              const status = up.status === 402 ? 402 : up.status === 429 ? 429 : 502;
              return new Response(
                up.status === 402 ? "Saldo de API da Fish Audio esgotado" : msg || "Falha na Fish Audio",
                { status },
              );
            }
            return new Response(up.body, { headers: { "Content-Type": "audio/pcm", "Cache-Control": "no-cache" } });
          } catch (e) {
            if (request.signal.aborted) return new Response(null, { status: 499 });
            throw e;
          }
        }
        if (!apiKey) return new Response("Voz realista indisponível neste servidor. Use a voz do aparelho.", { status: 503 });
        const voice = body?.voice && VOICES.has(body.voice) ? body.voice : "Kore";

        try {
          const upstream = await fetch("https://ai.gateway.lovable.dev/v1/audio/speech", {
            method: "POST",
            headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              model: MODEL,
              contents: [
                {
                  role: "user",
                  parts: [
                    {
                      text: `Narre em português do Brasil, com sotaque brasileiro natural, como um narrador experiente de audiolivro contando uma história para um amigo: voz calorosa, conversada e envolvente, em ritmo tranquilo e constante. Use entonação natural de fala real — leve emoção nos diálogos e momentos tensos, mas sem exagerar, sem gritar, sem sussurrar e sem teatralidade. Respeite as pausas da pontuação. Leia exatamente o texto a seguir, sem adicionar nem omitir nada:\n\n${text}`,
                    },
                  ],
                },
              ],
              generationConfig: {
                responseModalities: ["AUDIO"],
                speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } },
              },
              stream_format: "sse",
            }),
            signal: request.signal,
          });
          return new Response(upstream.body, {
            status: upstream.status,
            headers: {
              "Content-Type": upstream.headers.get("content-type") ?? "text/event-stream",
              "Cache-Control": "no-cache, no-transform",
              "X-Accel-Buffering": "no",
            },
          });
        } catch (e) {
          if (request.signal.aborted) return new Response(null, { status: 499 });
          throw e;
        }
      },
    },
  },
});
