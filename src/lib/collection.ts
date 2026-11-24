import { HOME_KINDS, type HomeFormat } from "@/lib/home-formats";
import { sameKind } from "@/lib/work-categories";

/** Obras por página na Coleção (4 fileiras de 5). */
export const COLLECTION_PAGE_SIZE = 20;

/** Abas de formato da Coleção, na ordem do modelo (sem as variações "2"). */
export const COLLECTION_FORMATS = ["Comic", "Shoujo", "Manga", "Yaoi", "Yuri", "Hentai", "English", "Novel"] as const satisfies readonly HomeFormat[];
export type CollectionFormat = (typeof COLLECTION_FORMATS)[number] | "Outros";

/** Aba em que uma obra aparece; formatos fora de todas as abas caem em "Outros" para não sumirem. */
export function collectionFormatOf(kind: string | null | undefined): CollectionFormat {
  for (const format of COLLECTION_FORMATS) {
    if (HOME_KINDS[format].some((value) => sameKind(value, kind))) return format;
  }
  return "Outros";
}

/** Números da paginação: 1 2 3 … 21, com "gap" no lugar das reticências. */
export function pageWindow(page: number, pages: number): (number | "gap")[] {
  const last = Math.max(1, Math.floor(pages));
  const current = Math.min(last, Math.max(1, Math.floor(page)));
  const wanted = new Set<number>([1, last, current - 1, current, current + 1]);
  if (current <= 2) wanted.add(3);
  if (current >= last - 1) wanted.add(last - 2);
  const numbers = [...wanted].filter((n) => n >= 1 && n <= last).sort((a, b) => a - b);
  const out: (number | "gap")[] = [];
  numbers.forEach((n, index) => {
    const previous = numbers[index - 1];
    if (previous !== undefined) {
      if (n - previous === 2) out.push(previous + 1);
      else if (n - previous > 2) out.push("gap");
    }
    out.push(n);
  });
  return out;
}

/** Linha de apoio do cartão: "Completo · 23 caps" quando leu tudo, senão "Cap. N" do último capítulo. */
export function collectionCaption(progress: number, chapterCount: number, latest: number | null | undefined): string {
  if (progress >= 100 && chapterCount > 0) return `Completo · ${chapterCount.toLocaleString("pt-BR")} caps`;
  const number = Number(latest ?? 0) || chapterCount;
  return number > 0 ? `Cap. ${number.toLocaleString("pt-BR")}` : "Sem capítulos";
}
