import { supabase } from "@/integrations/supabase/client";
import { validateApk } from "./app-versions";

export async function uploadApk(file: File, onProgress: (progress: number) => void) {
  validateApk(file);
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session) throw new Error("Entre novamente para enviar o APK.");
  const path = `releases/${crypto.randomUUID()}.apk`;
  const { Upload } = await import("tus-js-client");
  await new Promise<void>((resolve, reject) => {
    const upload = new Upload(file, {
      endpoint: `${import.meta.env['VITE_SUPABASE_URL']}/storage/v1/upload/resumable`,
      chunkSize: 6 * 1024 * 1024,
      retryDelays: [0, 1000, 3000, 5000, 10000],
      headers: { authorization: `Bearer ${data.session?.access_token}`, apikey: import.meta.env['VITE_SUPABASE_PUBLISHABLE_KEY'] },
      metadata: { bucketName: "app-releases", objectName: path, contentType: "application/vnd.android.package-archive", cacheControl: "3600" },
      uploadDataDuringCreation: true,
      storeFingerprintForResuming: false,
      removeFingerprintOnSuccess: true,
      onBeforeRequest: async (request) => {
        const { data: fresh } = await supabase.auth.getSession();
        if (!fresh.session) throw new Error("Sua sessão expirou. Entre novamente.");
        request.setHeader("authorization", `Bearer ${fresh.session.access_token}`);
      },
      onProgress: (sent, total) => onProgress(Math.min(99, Math.round(sent / total * 100))),
      onError: reject,
      onSuccess: () => resolve(),
    });
    upload.start();
  });
  onProgress(100);
  return path;
}