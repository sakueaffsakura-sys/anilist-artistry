/** Shared catalog, administration and request categories; preserve legacy values. */
export const KINDS = [
  "Manga",
  "Manhwa",
  "Manhua",
  "Webtoon",
  "One-shot",
  "Doujinshi",
  "HQ",
  "Comic",
  "Comic2",
  "Shoujo",
  "Shoujo2",
  "Yaoi",
  "Yuri",
  "Hentai",
  "English",
  "Novel",
] as const;

/** Nomes antigos guardados nos dados que aparecem como o formato principal (os registros ficam como estão). */
const LEGACY_KINDS: Record<string, string> = { Comic2: "Comic", Shoujo2: "Shoujo" };
/** Rótulos em português para os formatos que têm nome em inglês. */
const KIND_LABELS: Record<string, string> = { English: "Em inglês" };

/** Nome do formato para mostrar no site e no painel. */
export function kindLabel(kind: string | null | undefined): string {
  if (!kind) return "";
  const base = LEGACY_KINDS[kind] ?? kind;
  return KIND_LABELS[base] ?? base;
}

/** Formatos oferecidos em filtros e seletores (sem os nomes antigos repetidos). */
export const PUBLIC_KINDS: string[] = KINDS.filter((kind) => !(kind in LEGACY_KINDS));

/** Valores gravados que contam como o formato escolhido num filtro (o principal e os nomes antigos). */
export function kindValues(kind: string): string[] {
  return [kind, ...Object.keys(LEGACY_KINDS).filter((old) => LEGACY_KINDS[old] === kind)];
}

/** Mesmo formato para comparar (Comic2 conta como Comic). */
export function sameKind(a: string | null | undefined, b: string | null | undefined): boolean {
  return (LEGACY_KINDS[a ?? ""] ?? a) === (LEGACY_KINDS[b ?? ""] ?? b);
}

export function suggestWorkKind(item: { format?: string; countryOfOrigin?: string; genres?: string[] }): typeof KINDS[number] {
  if (item.format === "NOVEL") return "Novel";
  if (item.format === "ONE_SHOT") return "One-shot";
  if (item.countryOfOrigin === "KR") return "Manhwa";
  if (item.countryOfOrigin === "CN" || item.countryOfOrigin === "TW") return "Manhua";
  if (item.genres?.includes("Boys' Love")) return "Yaoi";
  if (item.genres?.includes("Girls' Love")) return "Yuri";
  if (item.countryOfOrigin === "US") return "English";
  return "Manga";
}