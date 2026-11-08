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

/**
 * Classificação automática (regras do banco, migration 0059): idade vazia é calculada sozinha e
 * `age_rating_auto` marca as calculadas. No editor, "" significa "Automática".
 */
export function ageRatingChoice(work: { age_rating: string | null; age_rating_auto?: boolean | null }): AgeRating | "" {
  return work.age_rating_auto || !isAgeRating(work.age_rating) ? "" : work.age_rating;
}

/** O que gravar: idade escolhida fica fixa; "Automática" (vazio) devolve a idade às regras do site. */
export function ageRatingUpdate(choice: string | null | undefined): { age_rating: AgeRating; age_rating_auto: false } | { age_rating: null } {
  return isAgeRating(choice) ? { age_rating: choice, age_rating_auto: false } : { age_rating: null };
}
