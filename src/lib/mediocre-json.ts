/** Owner-provided MediocreScan CDN chapter JSON: [{ ordem, url }]. Exact host only. */
export const MEDIOCRE_CDN = "cdn.mediocrescan.com";

export function parseMediocreLink(raw: string): { url: string; number: number } {
  let url: URL;
  try { url = new URL(raw.trim()); } catch { throw new Error("Link inválido."); }
  if (url.protocol !== "https:" || url.hostname !== MEDIOCRE_CDN || url.username || url.password) throw new Error(`Use apenas links de ${MEDIOCRE_CDN}.`);
  const match = url.pathname.match(/^\/obras\/\d+\/capitulos\/(\d+(?:[.-]\d+)?)\/[\w-]+\.json$/i);
  if (!match?.[1]) throw new Error("Formato esperado: /obras/ID/capitulos/NÚMERO/arquivo.json");
  const number = Number(match[1].replace("-", "."));
  if (!Number.isFinite(number) || number < 0 || number > 100000) throw new Error("Número do capítulo inválido.");
  return { url: url.toString(), number };
}

export function parseMediocrePages(data: unknown): string[] {
  if (!Array.isArray(data)) throw new Error("Resposta não é uma lista de páginas.");
  const items = data.map((item) => {
    const row = item as { ordem?: unknown; url?: unknown };
    if (typeof row?.url !== "string" || !/^[\w./-]+\.(webp|jpe?g|png|gif|avif)$/i.test(row.url) || row.url.includes("..")) throw new Error("Página inválida no JSON.");
    return { order: Number(row.ordem) || 0, url: `https://${MEDIOCRE_CDN}/${row.url.replace(/^\/+/, "")}` };
  });
  const pages = [...new Set(items.sort((a, b) => a.order - b.order).map((item) => item.url))];
  if (!pages.length) throw new Error("Nenhuma página no JSON.");
  return pages;
}
