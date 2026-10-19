export const AGE_RATINGS = ["L", "10", "12", "14", "16", "18"] as const;
export type AgeRating = (typeof AGE_RATINGS)[number];
export function isAgeRating(value: unknown): value is AgeRating { return typeof value === "string" && (AGE_RATINGS as readonly string[]).includes(value); }
export function ageRatingLabel(value: string | null | undefined) {
  if (!isAgeRating(value)) return "Não informada";
  return value === "L" ? "Livre para todos" : `${value} anos ou mais`;
}
export function ageRatingShort(value: string | null | undefined) {
  if (!isAgeRating(value)) return null;
  return value === "L" ? "Livre" : `${value}+`;
}
