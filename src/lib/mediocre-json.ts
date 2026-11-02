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
  const object = data && typeof data === "object" ? data as Record<string, unknown> : {};
  const root = object['data'] && typeof object['data'] === "object" ? object['data'] as Record<string, unknown> : object;
  const list = Array.isArray(data) ? data : Array.isArray(object['data']) ? object['data'] : root['pages'] ?? root['paginas'] ?? root['items'];
  if (!Array.isArray(list)) throw new Error("Resposta não é uma lista de páginas.");
  const items = list.map((item, index) => {
    const row = item && typeof item === "object" ? item as Record<string, unknown> : {};
    const raw = typeof item === "string" ? item : row['url'] ?? row['src'] ?? row['imagem'];
    if (typeof raw !== "string" || raw.includes("..")) throw new Error("Página inválida no JSON.");
    let url: URL;
    try { url = new URL(raw.replace(/^\/+/, ""), `https://${MEDIOCRE_CDN}/`); } catch { throw new Error("Página inválida no JSON."); }
    if (url.protocol !== "https:" || url.hostname !== MEDIOCRE_CDN || url.port || url.username || url.password || !/\.(webp|jpe?g|png|gif|avif)$/i.test(url.pathname)) throw new Error("Página inválida no JSON.");
    const order = Number(row['ordem'] ?? row['order'] ?? index);
    return { order: Number.isFinite(order) ? order : index, url: url.toString() };
  });
  const pages = [...new Set(items.sort((a, b) => a.order - b.order).map((item) => item.url))];
  if (!pages.length) throw new Error("Nenhuma página no JSON.");
  return pages;
}
