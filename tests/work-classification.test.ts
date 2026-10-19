import { describe, expect, it } from "bun:test";
import { classificationUpdate, missingGenres } from "../src/lib/work-classification";
const work = { id: "one", kind: "Manga", genres: [] };
const suggestion = { id: "one", kind: "Manhwa" as const, genres: ["Action", "Fantasy"], confident: true };
describe("AI work classification", () => {
 it("targets only works without genres", () => {
  expect(missingGenres([])).toBe(true); expect(missingGenres([" "])).toBe(true); expect(missingGenres(["Ação"])).toBe(false);
  expect(classificationUpdate({ ...work, genres: ["Drama"] }, suggestion, ["Ação"])).toBeNull();
 });
 it("identifies Manhwa and fills normalized allowed genres", () => { expect(classificationUpdate(work, suggestion, ["Ação", "Fantasia"])).toEqual({ kind: "Manhwa", genres: ["Ação", "Fantasia"] }); });
 it("does not guess when uncertain", () => { expect(classificationUpdate(work, { ...suggestion, confident: false }, ["Ação"])).toBeNull(); });
 it("rejects another work and unsupported genres", () => { expect(classificationUpdate(work, { ...suggestion, id: "other" }, ["Ação"])).toBeNull(); expect(classificationUpdate(work, suggestion, ["Romance"])).toBeNull(); });
 it("preserves novel reader format", () => { expect(classificationUpdate(work, { ...suggestion, kind: "Novel" }, ["Ação"])).toBeNull(); expect(classificationUpdate({ ...work, kind: "Novel" }, suggestion, ["Ação"])).toBeNull(); });
});
