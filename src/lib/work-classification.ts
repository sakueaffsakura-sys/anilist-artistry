import { z } from "zod";
import { KINDS } from "./work-categories";
import { normalizeGenres } from "./work-genres";
export const classificationSchema = z.object({ works: z.array(z.object({ id: z.string(), kind: z.enum(KINDS).nullable(), genres: z.array(z.string()), confident: z.boolean() }).strict()) }).strict();
export function missingGenres(genres: readonly string[] | null) { return !genres?.some((genre) => genre.trim()); }
export function classificationUpdate(work: { id: string; kind: string; genres: string[] | null }, suggestion: z.infer<typeof classificationSchema>["works"][number], allowedGenres: readonly string[]) {
  if (work.id !== suggestion.id || !missingGenres(work.genres) || !suggestion.confident) return null;
  const allowed = new Set(normalizeGenres(allowedGenres));
  const genres = normalizeGenres(suggestion.genres).filter((genre) => allowed.has(genre));
  if (!genres.length || !suggestion.kind || !KINDS.includes(suggestion.kind)) return null;
  if ((work.kind === "Novel") !== (suggestion.kind === "Novel")) return null;
  return { genres, kind: suggestion.kind };
}
export type ClassificationEvent =
 | { type: "start"; total: number }
 | { type: "work"; title: string; saved: boolean; processed: number; updated: number; total: number }
 | { type: "done"; processed: number; updated: number; total: number }
 | { type: "error"; message: string; status: number; paused: boolean };
