import { supabase } from "@/integrations/supabase/client";
import { validateMaintenanceMedia } from "./maintenance-media";

export async function uploadMaintenanceMedia(file: File, onProgress: (value: number) => void, signal: AbortSignal) {
  const format = validateMaintenanceMedia(file);
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session) throw new Error("Entre novamente na sua conta para enviar o fundo.");
  const path = `backgrounds/${crypto.randomUUID()}.${format.extension}`;
  const { Upload } = await import("tus-js-client");
  if (signal.aborted) throw new DOMException("Envio cancelado", "AbortError");
  await new Promise<void>((resolve, reject) => {
    const upload = new Upload(file, {
      endpoint: `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/upload/resumable`,
      chunkSize: 6 * 1024 * 1024,
      retryDelays: [0, 1000, 3000, 5000, 10000],
      headers: { authorization: `Bearer ${data.session?.access_token}`, apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
      metadata: { bucketName: "maintenance-media", objectName: path, contentType: format.mime, cacheControl: "3600" },
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      storeFingerprintForResuming: false,
      onBeforeRequest: async (request) => {
        const { data: fresh } = await supabase.auth.getSession();
        if (!fresh.session) throw new Error("Sua sessão expirou. Entre novamente.");
        request.setHeader("authorization", `Bearer ${fresh.session.access_token}`);
      },
      onProgress: (sent, total) => onProgress(Math.min(99, Math.round(sent / total * 100))),
      onError: (failure) => { signal.removeEventListener("abort", cancel); reject(failure); },
      onSuccess: () => { signal.removeEventListener("abort", cancel); resolve(); },
    });
    const cancel = () => { void upload.abort().finally(() => reject(new DOMException("Envio cancelado", "AbortError"))); };
    signal.addEventListener("abort", cancel, { once: true });
    upload.start();
  });
  const { data: signed, error: signError } = await supabase.storage.from("maintenance-media").createSignedUrl(path, 3600);
  if (signError || !signed) throw new Error("Fundo enviado, mas a prévia não carregou. Tente novamente.");
  onProgress(100);
  return { media_kind: format.kind, media_path: path, media_url: signed.signedUrl };
}

export function maintenanceUploadError(error: unknown) {
  const text = error instanceof Error ? error.message : "";
  if (/403|401|row.level|unauthorized/i.test(text)) return "Sua conta precisa de acesso administrativo. Entre novamente e tente enviar.";
  if (/413|size|too large/i.test(text)) return "O envio excedeu o limite permitido. Escolha um arquivo de até 1 GB.";
  if (/network|fetch|failed to|offline/i.test(text)) return "A conexão foi interrompida. Confira sua internet e tente novamente.";
  return text || "Não foi possível enviar o arquivo. Tente novamente.";
}