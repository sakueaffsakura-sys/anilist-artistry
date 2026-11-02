import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { mediocreErrorFor, mediocrePath, parseMediocreRequest, type MediocreResult } from "./mediocre-api";

const BASE = "https://back2.mediocrescan.com";

/**
 * Admin-only read proxy to the MediocreScan API. The token is read from the
 * MEDIOCRE_API_TOKEN secret inside the handler and never returned or logged.
 * Only fixed GET paths from the allowlist are reachable.
 */
export const queryMediocreApi = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => parseMediocreRequest(input))
  .handler(async ({ data, context }): Promise<MediocreResult> => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!isAdmin) return { ok: false, status: 403, error: { code: "FORBIDDEN", message: "Somente administradores podem usar esta consulta." } };

    const token = process.env["MEDIOCRE_API_TOKEN"];
    if (!token) return { ok: false, status: 500, error: { code: "MISSING_TOKEN", message: "O token da API ainda não foi configurado." } };

    const started = Date.now();
    try {
      const res = await fetch(BASE + mediocrePath(data), {
        method: "GET",
        redirect: "error",
        signal: AbortSignal.timeout(15_000),
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json", "User-Agent": "Mozilla/5.0" },
      });
      console.log(`[mediocre] ${data.operation} ${res.status} ${Date.now() - started}ms`);
      if (!res.ok) return { ok: false, status: res.status, error: mediocreErrorFor(res.status) };
      const raw = await res.text();
      if (raw.length > 8_000_000) return { ok: false, status: 502, error: { code: "TOO_LARGE", message: "A resposta da API é grande demais." } };
      // Defensive: strip the token if the upstream ever echoed it.
      const safe = raw.split(token).join("[removido]");
      JSON.parse(safe); // validate it is JSON
      return { ok: true, status: res.status, json: safe };
    } catch {
      console.log(`[mediocre] ${data.operation} falha de conexão ${Date.now() - started}ms`);
      return { ok: false, status: 0, error: mediocreErrorFor(0) };
    }
  });
