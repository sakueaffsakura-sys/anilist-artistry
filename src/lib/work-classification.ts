import { z } from "zod";
import { KINDS } from "./work-categories";
import { normalizeGenres } from "./work-genres";
import { AGE_RATINGS, isAgeRating } from "./age-ratings";
export const classificationSchema = z.object({ works: z.array(z.object({ id: z.string(), kind: z.enum(KINDS).nullable(), genres: z.array(z.string()), age_rating: z.enum(AGE_RATINGS).nullable(), confident: z.boolean() }).strict()) }).strict();
export function missingGenres(genres: readonly string[] | null) { return !genres?.some((genre) => genre.trim()); }
export function needsClassification(work: { genres: string[] | null; age_rating: string | null }) { return missingGenres(work.genres) || !isAgeRating(work.age_rating); }
type Work = { id: string; kind: string; genres: string[] | null; age_rating?: string | null };
export function classificationUpdate(work: Work, suggestion: z.infer<typeof classificationSchema>["works"][number], allowedGenres: readonly string[]) {
  if (work.id !== suggestion.id || !suggestion.confident) return null;
  const update: { genres?: string[]; kind?: (typeof KINDS)[number]; age_rating?: string } = {};
  if (missingGenres(work.genres)) {
    const allowed = new Set(normalizeGenres(allowedGenres));
    const genres = normalizeGenres(suggestion.genres).filter((genre) => allowed.has(genre));
    if (genres.length && suggestion.kind && KINDS.includes(suggestion.kind) && (work.kind === "Novel") === (suggestion.kind === "Novel")) {
      update.genres = genres; update.kind = suggestion.kind;
    }
  }
  if (!isAgeRating(work.age_rating) && isAgeRating(suggestion.age_rating)) update.age_rating = suggestion.age_rating;
  return Object.keys(update).length ? update : null;
}
export type ClassificationEvent =
 | { type: "start"; total: number }
 | { type: "work"; title: string; saved: boolean; processed: number; updated: number; total: number }
 | { type: "done"; processed: number; updated: number; total: number }
 | { type: "error"; message: string; status: number; paused: boolean };
