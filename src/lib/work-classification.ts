import { z } from "zod";
import { KINDS } from "./work-categories";
import { normalizeGenres } from "./work-genres";
import { AGE_RATINGS, isAgeRating } from "./age-ratings";
export const classificationSchema = z.object({ works: z.array(z.object({ id: z.string(), kind: z.enum(KINDS).nullable(), genres: z.array(z.string()), age_rating: z.enum(AGE_RATINGS).nullable(), confident: z.boolean() }).strict()) }).strict();
export const reviewClassificationSchema = z.object({ works: z.array(classificationSchema.shape.works.element.extend({ justification: z.string(), missing_information: z.array(z.string()) }).strict()) }).strict();
export type ClassificationMode = "missing" | "review";
export type ClassificationSuggestion = z.infer<typeof reviewClassificationSchema>["works"][number];
export const classificationSnapshotSchema = z.object({ id: z.string().uuid(), title: z.string(), kind: z.string(), genres: z.array(z.string()), age_rating: z.string().nullable(), updated_at: z.string() }).strict();
export type ClassificationSnapshot = z.infer<typeof classificationSnapshotSchema>;
export type ClassificationChanges = { genres?: string[]; kind?: (typeof KINDS)[number]; age_rating?: string };
export type ClassificationReview = { work: ClassificationSnapshot; suggestion: ClassificationSuggestion | null; changes: ClassificationChanges | null };
export function missingGenres(genres: readonly string[] | null) { return !genres?.some((genre) => genre.trim()); }
export function needsClassification(work: { genres: string[] | null; age_rating: string | null }) { return missingGenres(work.genres) || !isAgeRating(work.age_rating); }
type Work = { id: string; kind: string; genres: string[] | null; age_rating?: string | null };
export function classificationUpdate(work: Work, suggestion: z.infer<typeof classificationSchema>["works"][number], allowedGenres: readonly string[], mode: ClassificationMode = "missing") {
  if (work.id !== suggestion.id || !suggestion.confident) return null;
  const update: { genres?: string[]; kind?: (typeof KINDS)[number]; age_rating?: string } = {};
  if (mode === "review" || missingGenres(work.genres)) {
    const allowed = new Set(normalizeGenres(allowedGenres));
    const genres = normalizeGenres(suggestion.genres).filter((genre) => allowed.has(genre));
    if (genres.length && suggestion.kind && KINDS.includes(suggestion.kind) && (work.kind === "Novel") === (suggestion.kind === "Novel")) {
      const current = normalizeGenres(work.genres ?? []);
      if (genres.length !== current.length || genres.some((genre) => !current.includes(genre))) update.genres = genres;
      if (work.kind !== suggestion.kind) update.kind = suggestion.kind;
    }
  }
  if ((mode === "review" || !isAgeRating(work.age_rating)) && isAgeRating(suggestion.age_rating) && work.age_rating !== suggestion.age_rating) update.age_rating = suggestion.age_rating;
  return Object.keys(update).length ? update : null;
}
export type ClassificationEvent =
 | { type: "start"; total: number }
 | { type: "work"; title: string; saved: boolean; processed: number; updated: number; total: number }
  | { type: "review"; review: ClassificationReview; processed: number; suggested: number; total: number }
 | { type: "done"; processed: number; updated: number; total: number }
 | { type: "error"; message: string; status: number; paused: boolean };
