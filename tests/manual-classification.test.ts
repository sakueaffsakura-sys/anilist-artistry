import { expect, it } from "bun:test";
import { manualClassificationReview } from "../src/lib/manual-classification";
import type { AnilistResult } from "../src/lib/anilist.functions";
const work = { id: "one", title: "Test", kind: "Manga", genres: [], age_rating: "12", updated_at: "2026-10-20" };
const result: AnilistResult = { anilistId: 1, title: "Test", altTitles: "", synopsis: "", coverUrl: "", bannerUrl: "", genres: ["Action", "Fantasy"], status: "", author: "", artist: "", averageScore: 0, suggestedKind: "Manhwa", popularity: 0, trending: 0 };
it("manual selection suggests normalized genres and type without mutating the work", () => {
  expect(manualClassificationReview(work, result).changes).toEqual({ kind: "Manhwa", genres: ["Ação", "Fantasia"] });
  expect(work.genres).toEqual([]);
});
it("does not invent or replace Brazilian age ratings", () => {
  expect(manualClassificationReview({ ...work, age_rating: null }, result).suggestion?.age_rating).toBeNull();
  expect(manualClassificationReview(work, result).changes).not.toHaveProperty("age_rating");
});
it("rejects novels and unsupported categories for comics", () => {
  expect(manualClassificationReview(work, { ...result, suggestedKind: "Novel" }).changes).toBeNull();
  expect(manualClassificationReview(work, { ...result, suggestedKind: "Unknown" }).changes).toBeNull();
});