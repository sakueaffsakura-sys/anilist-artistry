import { KINDS } from "./work-categories";
import { normalizeGenres } from "./work-genres";
import { classificationUpdate, type ClassificationSnapshot, type ClassificationReview } from "./work-classification";
import type { AnilistResult } from "./anilist.functions";

export function manualClassificationReview(work: ClassificationSnapshot, result: AnilistResult): ClassificationReview {
  const kind = KINDS.find((value) => value === result.suggestedKind);
  const compatible = Boolean(kind && kind !== "Novel" && work.kind !== "Novel");
  const suggestion = {
    id: work.id, kind: compatible && kind ? kind : null,
    genres: normalizeGenres(result.genres), age_rating: null, confident: compatible,
    justification: `Resultado escolhido manualmente: ${result.title} (AniList ${result.anilistId}). Tipo e gêneros fornecidos pelo AniList; idade preservada.`,
    missing_information: ["O AniList não informa classificação indicativa brasileira."],
  };
  return { work, suggestion, changes: classificationUpdate(work, suggestion, suggestion.genres, "review") };
}