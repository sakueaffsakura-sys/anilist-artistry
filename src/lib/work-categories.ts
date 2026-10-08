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