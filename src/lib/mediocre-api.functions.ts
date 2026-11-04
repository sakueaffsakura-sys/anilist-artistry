import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { parseMediocreRequest, PUBLIC_OPERATIONS, type MediocreResult } from "./mediocre-api";

/** Admin-only proxy: every allowlisted operation, including the personal reading endpoint. */
export const queryMediocreApi = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => parseMediocreRequest(input))
  .handler(async ({ data, context }): Promise<MediocreResult> => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!isAdmin) return { ok: false, status: 403, error: { code: "FORBIDDEN", message: "Somente administradores podem usar esta consulta." } };
    const { runMediocre } = await import("./mediocre-api.server");
    return runMediocre(data);
  });

/** Public read-only proxy for the showcase. Personal endpoints are rejected. */
export const queryMediocrePublic = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => {
    const req = parseMediocreRequest(input);
    if (!PUBLIC_OPERATIONS.includes(req.operation)) throw new Error("Operação não permitida.");
    return req;
  })
  .handler(async ({ data }): Promise<MediocreResult> => {
    const { runMediocre } = await import("./mediocre-api.server");
    return runMediocre(data);
  });

async function assertAdmin(context: { supabase: { rpc: (...a: never[]) => unknown }; userId: string }) {
  const { data } = await (context.supabase.rpc as unknown as (f: string, a: object) => Promise<{ data: boolean | null }>)("has_role", { _user_id: context.userId, _role: "admin" });
  if (!data) throw new Error("Somente administradores.");
}

/** Status only — never returns the saved token. */
export const getMediocreTokenStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin.from("mediocre_settings").select("token, refresh_token, updated_at, bypass_header, blocked_until, relay_url, relay_secret").eq("id", 1).maybeSingle();
    return { relayUrl: data?.relay_url ?? null, hasRelaySecret: !!data?.relay_secret, hasToken: !!data?.token, hasRefresh: !!data?.refresh_token, hasBypass: !!data?.bypass_header, blockedUntil: data?.blocked_until ?? null, updatedAt: data?.updated_at ?? null };
  });

export const saveMediocreToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { token: string; refreshToken?: string }) => {
    const clean = (v: unknown) => (typeof v === "string" ? v.trim().replace(/^Bearer\s+/i, "") : "");
    const token = clean(input?.token);
    if (!/^[A-Za-z0-9._\-]{20,4096}$/.test(token)) throw new Error("Token inválido.");
    const refreshToken = clean(input?.refreshToken);
    if (refreshToken && !/^[A-Za-z0-9._\-]{20,4096}$/.test(refreshToken)) throw new Error("Refresh token inválido.");
    return { token, refreshToken };
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const row: { id: number; token: string; updated_at: string; refresh_token?: string | null } = { id: 1, token: data.token, updated_at: new Date().toISOString() };
    // Um token novo substitui tudo: refresh antigo sai se não for reenviado.
    row.refresh_token = data.refreshToken || null;
    const { error } = await supabaseAdmin.from("mediocre_settings").upsert(row);
    if (error) throw new Error("Não foi possível salvar.");
    // Limpa todas as cópias salvas da API antiga para não servir dados do token expirado.
    const { error: cacheError } = await supabaseAdmin.from("mediocre_cache").delete().neq("key", "");
    if (cacheError) throw new Error("Não foi possível limpar as cópias salvas.");
    return { ok: true };
  });

/** Saves (or clears) the secret header MediocreScan's Cloudflare rule lets through. */
export const saveMediocreBypass = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { value: string }) => {
    const value = typeof input?.value === "string" ? input.value.trim() : "";
    if (value && !/^[A-Za-z0-9._\-]{16,512}$/.test(value)) throw new Error("Chave inválida (mínimo 16 letras/números).");
    return { value };
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("mediocre_settings").update({ bypass_header: data.value || null, blocked_until: null }).eq("id", 1);
    if (error) throw new Error("Não foi possível salvar.");
    return { ok: true };
  });

/** Live connection check from the site's server; never returns the token. */
export const testMediocreConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin: sa } = await import("@/integrations/supabase/client.server");
    await sa.from("mediocre_settings").update({ blocked_until: null }).eq("id", 1); // one manual try
    const { mediocreGet } = await import("./mediocre-api.server");
    const r = await mediocreGet("api", "/obras/atualizadas-recentes");
    if (r.ok) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin.from("mediocre_settings").update({ blocked_until: null }).eq("id", 1);
      return { ok: true, message: "Conexão OK: token e acesso funcionando." };
    }
    return { ok: false, message: r.error.message };
  });

/** Saves (or clears) the cPanel relay address and its shared key; the key is never returned. */
export const saveMediocreRelay = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { url: string; secret?: string }) => {
    const url = typeof input?.url === "string" ? input.url.trim() : "";
    if (url && !/^https:\/\/[A-Za-z0-9.-]+(:\d{2,5})?\/[A-Za-z0-9._~\/-]*\.php$/.test(url)) throw new Error("Endereço inválido: use https://seusite.com/pasta/mediocre-ponte.php");
    const secret = typeof input?.secret === "string" ? input.secret.trim() : "";
    if (secret && !/^[A-Za-z0-9]{32,128}$/.test(secret)) throw new Error("Senha da ponte inválida (32+ letras/números).");
    return { url, secret };
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const patch: { relay_url: string | null; relay_secret?: string | null; blocked_until: null } = { relay_url: data.url || null, blocked_until: null };
    if (data.secret || !data.url) patch.relay_secret = data.secret || null;
    const { error } = await supabaseAdmin.from("mediocre_settings").update(patch).eq("id", 1);
    if (error) throw new Error("Não foi possível salvar.");
    return { ok: true };
  });
