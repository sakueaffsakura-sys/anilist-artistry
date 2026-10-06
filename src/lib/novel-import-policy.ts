/** Exact destinations configured by the owner, never supplied by an RPC caller. */
export const NOVEL_IMPORT_ALLOWED_HOSTS = ["mediocrescan.com", "www.mediocrescan.com"] as const;
export const NOVEL_IMPORT_TIMEOUT_MS = 10_000;
export const NOVEL_IMPORT_MAX_BYTES = 3_000_000;
export const NOVEL_IMPORT_MAX_REDIRECTS = 3;

export function validateNovelImportUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("Link inválido.");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("Use um link http(s).");
  }
  if (url.username || url.password || url.port) {
    throw new Error("Links com credenciais ou portas personalizadas não são permitidos.");
  }
  if (!NOVEL_IMPORT_ALLOWED_HOSTS.some((host) => host === url.hostname)) {
    throw new Error("Este domínio não está autorizado para importação.");
  }
  url.hash = "";
  return url;
}