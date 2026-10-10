import { maintenanceClient } from "./maintenance.server";
import { requiresAppUpdate } from "./app-versions";

export async function appVersionResponse(request: Request) {
  const value = new URL(request.url).searchParams.get("version_code");
  const installed = value === null ? null : Number(value);
  if (installed !== null && (!/^\d+$/.test(value ?? "") || !Number.isSafeInteger(installed) || installed < 1 || installed > 2147483647)) {
    return Response.json({ error: "Código de versão inválido." }, { status: 400 });
  }
  try {
    const client = maintenanceClient();
    const { data, error } = await client.from("app_releases")
      .select("version_code, version_name, minimum_version_code, apk_path, notes")
      .eq("published", true).order("version_code", { ascending: false });
    if (error) throw error;
    const latest = data?.[0];
    const minimum = Math.max(0, ...(data ?? []).map((row) => row.minimum_version_code));
    let download = "";
    if (latest) {
      const signed = await client.storage.from("app-releases").createSignedUrl(latest.apk_path, 3600);
      if (signed.error || !signed.data) throw new Error("Download indisponível.");
      const signedUrl = new URL(signed.data.signedUrl);
      const browserUrl = new URL(import.meta.env['VITE_SUPABASE_URL']);
      signedUrl.protocol = browserUrl.protocol;
      signedUrl.host = browserUrl.host;
      download = signedUrl.toString();
    }
    return Response.json({ min_apk_version: minimum, latest_apk_version: latest?.version_code ?? 0,
      version_name: latest?.version_name ?? "", apk_download_url: download, notes: latest?.notes ?? "",
      update_required: installed === null ? null : requiresAppUpdate(installed, minimum),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "Não foi possível consultar a atualização. Tente novamente." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}