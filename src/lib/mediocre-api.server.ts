import { chapterContentPath, mediocreErrorFor, mediocrePath, type MediocreRequest, type MediocreResult } from "./mediocre-api";

const API = "https://back2.mediocrescan.com";
const CDN = "https://cdn.mediocrescan.com";
const MAX_BYTES = 8_000_000;

type Fetched = { ok: true; status: number; data: unknown; raw: string } | { ok: false; status: number; error: { code: string; message: string } };

// The API answers 429 to bursts and then 403s the token for a while; pace calls per instance.
const API_GAP_MS = 400;
let apiChain: Promise<void> = Promise.resolve();
function apiSlot(): Promise<void> {
  const slot = apiChain.then(() => new Promise<void>((r) => setTimeout(r, API_GAP_MS)));
  apiChain = slot.catch(() => undefined);
  return apiChain.then(() => undefined);
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** GET a fixed-host path with the server-only token. Never logs or returns the token. */
export async function mediocreGet(host: "api" | "cdn", path: string): Promise<Fetched> {
  const { token, bypass } = await mediocreAuth();
  if (!token) return { ok: false, status: 500, error: { code: "MISSING_TOKEN", message: "O token da API ainda não foi configurado." } };
  if (!path.startsWith("/") || path.includes("..") || path.includes("//")) return { ok: false, status: 400, error: mediocreErrorFor(400) };
  for (let attempt = 0; ; attempt++) {
    if (host === "api") await apiSlot();
    const started = Date.now();
    let res: Response;
    try {
      res = await fetch((host === "api" ? API : CDN) + path, {
        method: "GET",
        redirect: "manual", // workerd does not support "error"; 3xx is treated as failure
        signal: AbortSignal.timeout(15_000),
        headers: {
          Accept: "application/json", "User-Agent": "Mozilla/5.0",
          ...(host === "api" ? { Authorization: `Bearer ${token}` } : {}),
          ...(bypass ? { "X-BetterManga-Key": bypass } : {}),
        },
      });
    } catch {
      console.log(`[mediocre] ${host} falha de conexão ${Date.now() - started}ms`);
      return { ok: false, status: 0, error: mediocreErrorFor(0) };
    }
    console.log(`[mediocre] ${host} ${res.status} ${Date.now() - started}ms`);
    if (res.status === 429 && attempt < 2) {
      const wait = Math.min(Number(res.headers.get("retry-after")) * 1000 || 1500 * (attempt + 1), 5000);
      await sleep(wait + Math.random() * 300);
      continue;
    }
    if (res.status >= 300 && res.status < 400) return { ok: false, status: 502, error: mediocreErrorFor(0) };
    const isJson = (res.headers.get("content-type") ?? "").includes("json");
    if (res.status === 403 && !isJson) {
      return { ok: false, status: 403, error: { code: "BLOCKED", message: "O MediocreScan bloqueou o servidor do site (proteção Cloudflare). O token não é o problema." } };
    }
    if (!res.ok) {
      const body = (await res.text().catch(() => "")).split(token).join("[removido]").slice(0, 200);
      if (res.status === 403) {
        console.log(`[mediocre] 403 corpo: ${body}`);
        let apiMsg = "";
        try { apiMsg = String((JSON.parse(body) as { message?: unknown }).message ?? ""); } catch { /* not json */ }
        return { ok: false, status: 403, error: { code: "FORBIDDEN", message: `A API recusou o acesso${apiMsg ? ` (“${apiMsg.slice(0, 120)}”)` : ""}. Geralmente é bloqueio temporário por excesso de pedidos ou token de outra sessão; aguarde alguns minutos ou gere um token novo.` } };
      }
      return { ok: false, status: res.status, error: mediocreErrorFor(res.status) };
    }
    const raw = await res.text();
    if (raw.length > MAX_BYTES) return { ok: false, status: 502, error: { code: "TOO_LARGE", message: "A resposta da API é grande demais." } };
    const safe = raw.split(token).join("[removido]");
    try { return { ok: true, status: res.status, data: JSON.parse(safe) as unknown, raw: safe }; }
    catch { return { ok: false, status: 502, error: { code: "INVALID_JSON", message: "O formato retornado não foi reconhecido." } }; }
  }
}

async function admin() {
  return (await import("@/integrations/supabase/client.server")).supabaseAdmin;
}

/** Token saved in the panel wins; the env secret is the fallback. */
async function mediocreAuth(): Promise<{ token: string | undefined; bypass: string | null }> {
  try {
    const { data } = await (await admin()).from("mediocre_settings").select("token, bypass_header").eq("id", 1).maybeSingle();
    return { token: data?.token || process.env["MEDIOCRE_API_TOKEN"], bypass: data?.bypass_header ?? null };
  } catch { return { token: process.env["MEDIOCRE_API_TOKEN"], bypass: null }; }
}

async function cacheWrite(key: string, payload: string) {
  try { await (await admin()).from("mediocre_cache").upsert({ key, payload, updated_at: new Date().toISOString() }); } catch { /* best effort */ }
}
async function cacheRead(key: string): Promise<string | null> {
  try { const { data } = await (await admin()).from("mediocre_cache").select("payload").eq("key", key).maybeSingle(); return data?.payload ?? null; } catch { return null; }
}

/** Runs an operation; successful answers are stored so expired tokens fall back to the saved copy. */
export async function runMediocre(req: MediocreRequest): Promise<MediocreResult> {
  const key = JSON.stringify([req.operation, req.obraId ?? null, (req as { capituloId?: unknown }).capituloId ?? null, mediocrePath(req)]);
  const live = await runMediocreLive(req);
  if (live.ok) { await cacheWrite(key, live.json); return live; }
  const saved = await cacheRead(key);
  return saved ? { ok: true, status: 200, json: saved } : live;
}

/** Runs one validated operation; chapter content resolves its CDN path from API metadata. */
async function runMediocreLive(req: MediocreRequest): Promise<MediocreResult> {
  if (req.operation === "thumbs_capitulos") {
    const r = await mediocreGet("cdn", mediocrePath(req));
    return r.ok ? { ok: true, status: r.status, json: r.raw } : r;
  }
  const r = await mediocreGet("api", mediocrePath(req));
  if (!r.ok) return r;
  if (req.operation !== "conteudo_capitulo") return { ok: true, status: r.status, json: r.raw };
  const meta = r.data as Record<string, unknown>;
  const text = typeof meta?.["cap_conteudo_texto"] === "string" ? meta["cap_conteudo_texto"] : null;
  const path = chapterContentPath(meta);
  if (!path) {
    if (text) return { ok: true, status: 200, json: JSON.stringify({ capitulo: meta, conteudo: { content: text } }) };
    return { ok: false, status: 404, error: { code: "NO_CONTENT", message: "O conteúdo deste capítulo não está disponível." } };
  }
  const c = await mediocreGet("cdn", path);
  if (!c.ok) {
    if (text) return { ok: true, status: 200, json: JSON.stringify({ capitulo: meta, conteudo: { content: text } }) };
    return { ok: false, status: c.status, error: c.status === 404 ? { code: "NO_CONTENT", message: "O conteúdo deste capítulo não está disponível." } : c.error };
  }
  return { ok: true, status: 200, json: JSON.stringify({ capitulo: meta, conteudo: c.data }) };
}
