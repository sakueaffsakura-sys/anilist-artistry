import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export function maintenanceClient(token?: string) {
  const url = process.env['SUPABASE_URL'];
  const key = process.env['SUPABASE_PUBLISHABLE_KEY'];
  if (!url || !key) throw new Error("Configuração indisponível.");
  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (input, init) => {
      const headers = new Headers(init?.headers);
      if (headers.get("Authorization") === `Bearer ${key}`) headers.delete("Authorization");
      headers.set("apikey", key);
      if (token) headers.set("Authorization", `Bearer ${token}`);
      return fetch(input, { ...init, headers });
    } },
  });
}

export async function readMaintenance() {
  const client = maintenanceClient();
  const { data, error } = await client.from("maintenance_settings").select("*").eq("id", 1).maybeSingle();
  if (error) throw new Error("Não foi possível verificar a manutenção.");
  let media_url = "";
  if (data?.media_path) {
    const { data: media } = await client.storage.from("maintenance-media").createSignedUrl(data.media_path, 3600);
    media_url = media?.signedUrl ?? "";
  }
  return { enabled: data?.enabled ?? false, title: data?.title ?? "Voltamos em breve.",
    message: data?.message ?? "Estamos preparando o próximo capítulo do Better Mangá. Obrigado por esperar.",
    media_kind: data?.media_kind ?? "image", media_path: data?.media_path ?? "", media_url };
}

export async function verifiedMaintenanceAdmin(token: string | undefined) {
  if (!token) return false;
  try {
    const client = maintenanceClient(token);
    const { data, error } = await client.auth.getUser(token);
    if (error || !data.user) return false;
    const role = await client.rpc("has_role", { _user_id: data.user.id, _role: "admin" });
    return !role.error && role.data === true;
  } catch { return false; }
}