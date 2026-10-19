import { describe, expect, it } from "bun:test";
import { classificationUpdate, missingGenres, reviewClassificationSchema } from "../src/lib/work-classification";
const work = { id: "one", kind: "Manga", genres: [] };
const suggestion = { id: "one", kind: "Manhwa" as const, genres: ["Action", "Fantasy"], age_rating: "14" as const, confident: true };
describe("AI work classification", () => {
  it("suggests corrections to existing classifications only in review mode", () => {
    const existing = { ...work, genres: ["Drama"], age_rating: "12" };
    expect(classificationUpdate(existing, suggestion, ["Ação", "Fantasia"], "missing")).toBeNull();
    expect(classificationUpdate(existing, suggestion, ["Ação", "Fantasia"], "review")).toEqual({ kind: "Manhwa", genres: ["Ação", "Fantasia"], age_rating: "14" });
    expect(existing).toEqual({ id: "one", kind: "Manga", genres: ["Drama"], age_rating: "12" });
  });
  it("requires justification and missing-information fields for review results", () => {
    expect(reviewClassificationSchema.safeParse({ works: [suggestion] }).success).toBe(false);
    expect(reviewClassificationSchema.parse({ works: [{ ...suggestion, justification: "Origem coreana reconhecida; ação e fantasia.", missing_information: [] }] }).works[0]?.justification).toBe("Origem coreana reconhecida; ação e fantasia.");
  });
  it("blocks uncertain corrections even when reviewing filled fields", () => {
    expect(classificationUpdate({ ...work, genres: ["Drama"], age_rating: "12" }, { ...suggestion, confident: false }, ["Ação"], "review")).toBeNull();
  });
  it("does not suggest redundant changes or switch novel formats in review mode", () => {
    expect(classificationUpdate({ ...work, kind: "Manhwa", genres: ["Fantasy", "Action"], age_rating: "14" }, suggestion, ["Ação", "Fantasia"], "review")).toBeNull();
    expect(classificationUpdate({ ...work, kind: "Novel", age_rating: "14" }, suggestion, ["Ação"], "review")).toBeNull();
  });
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
