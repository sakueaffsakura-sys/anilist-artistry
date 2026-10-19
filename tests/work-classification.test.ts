import { describe, expect, it } from "bun:test";
import { classificationUpdate, missingGenres } from "../src/lib/work-classification";
const work = { id: "one", kind: "Manga", genres: [] };
const suggestion = { id: "one", kind: "Manhwa" as const, genres: ["Action", "Fantasy"], age_rating: "14" as const, confident: true };
describe("AI work classification", () => {
 it("targets only works without genres", () => {
  expect(missingGenres([])).toBe(true); expect(missingGenres([" "])).toBe(true); expect(missingGenres(["Ação"])).toBe(false);
  expect(classificationUpdate({ ...work, genres: ["Drama"], age_rating: "12" }, suggestion, ["Ação"])).toBeNull();
 });
 it("identifies Manhwa and fills normalized allowed genres", () => { expect(classificationUpdate(work, suggestion, ["Ação", "Fantasia"])).toEqual({ kind: "Manhwa", genres: ["Ação", "Fantasia"], age_rating: "14" }); });
 it("does not guess when uncertain", () => { expect(classificationUpdate(work, { ...suggestion, confident: false }, ["Ação"])).toBeNull(); });
 it("rejects another work and unsupported genres", () => { expect(classificationUpdate(work, { ...suggestion, id: "other" }, ["Ação"])).toBeNull(); expect(classificationUpdate({ ...work, age_rating: "16" }, suggestion, ["Romance"])).toBeNull(); });
 it("preserves novel reader format", () => { expect(classificationUpdate({ ...work, age_rating: "L" }, { ...suggestion, kind: "Novel" }, ["Ação"])).toBeNull(); expect(classificationUpdate({ ...work, kind: "Novel", age_rating: "L" }, suggestion, ["Ação"])).toBeNull(); });
 it("fills only a missing age rating", () => { expect(classificationUpdate({ ...work, genres: ["Ação"] }, suggestion, ["Ação"])).toEqual({ age_rating: "14" }); expect(classificationUpdate({ ...work, genres: ["Ação"], age_rating: "18" }, suggestion, ["Ação"])).toBeNull(); });
});
