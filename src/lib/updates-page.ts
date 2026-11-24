import type { HomeFormat } from "@/lib/home-formats";

/** Obras por página em /atualizados: 6 fileiras de 7 capas. */
export const UPDATES_PAGE_SIZE = 42;

/** Posição da primeira obra da página (a página 1 começa em 0; número inválido vira a página 1). */
export function updatesOffset(page: number): number {
  const safe = Number.isFinite(page) ? Math.max(1, Math.floor(page)) : 1;
  return (safe - 1) * UPDATES_PAGE_SIZE;
}

/** A consulta pede uma obra a mais que a página: se ela veio, existe próxima página. */
export function splitUpdatesPage<T>(rows: readonly T[]): { items: T[]; hasNext: boolean } {
  return { items: rows.slice(0, UPDATES_PAGE_SIZE), hasNext: rows.length > UPDATES_PAGE_SIZE };
}

/** Cor de destaque das pílulas de capítulo e do sublinhado da aba: roxo no Comic2 (como no modelo), laranja nos demais. */
export function formatAccent(format: HomeFormat): "orange" | "violet" {
  return format === "Comic2" ? "violet" : "orange";
}
