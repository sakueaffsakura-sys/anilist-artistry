/** Números do site sempre no padrão brasileiro (servidor e navegador escrevem igual). */
const compactFormat = new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 });

/** Nota com uma casa e vírgula: 7,6 (0,0 quando a obra ainda não tem nota). */
export function formatRating(value: number | string | null | undefined): string {
  const n = Number(value ?? 0);
  return (Number.isFinite(n) ? n : 0).toFixed(1).replace(".", ",");
}

/** 950 · 1,2 mil · 3,4 mi */
export function compactNumber(value: number | null | undefined): string {
  return compactFormat.format(Number(value ?? 0));
}

/** "1 capítulo" / "12 capítulos" com separador de milhar. */
export function countLabel(value: number, one: string, many: string): string {
  return `${value.toLocaleString("pt-BR")} ${value === 1 ? one : many}`;
}
