import { describe, expect, it } from "bun:test";
import { KINDS, suggestWorkKind } from "../src/lib/work-categories";
import { readFileSync } from "node:fs";

describe("Work categories", () => {
  it("offers Manhwa and additional visual categories", () => {
    for (const category of ["Manhwa", "Manhua", "Webtoon", "One-shot", "Doujinshi", "HQ"]) {
      expect(KINDS).toContain(category);
    }
  });
  it("preserves every existing category", () => {
    for (const category of ["Comic", "Comic2", "Shoujo", "Shoujo2", "Manga", "Yaoi", "Yuri", "Hentai", "English", "Novel"]) {
      expect(KINDS).toContain(category);
    }
  });
  it("allows every category in work requests", () => {
    const sql = readFileSync(new URL("../drizzle/migrations/0035_expand_work_request_categories.sql", import.meta.url), "utf8");
    for (const category of KINDS) expect(sql).toContain(`'${category}'`);
  });
  it("identifies Korean imports as Manhwa", () => {
    expect(suggestWorkKind({ countryOfOrigin: "KR", format: "MANGA" })).toBe("Manhwa");
  });
  it("identifies Chinese and Taiwanese imports as Manhua", () => {
    expect(suggestWorkKind({ countryOfOrigin: "CN" })).toBe("Manhua");
    expect(suggestWorkKind({ countryOfOrigin: "TW" })).toBe("Manhua");
  });
  it("keeps novels using the existing novel category", () => {
    expect(suggestWorkKind({ countryOfOrigin: "KR", format: "NOVEL" })).toBe("Novel");
  });
  it("identifies single-chapter imports", () => {
    expect(suggestWorkKind({ format: "ONE_SHOT" })).toBe("One-shot");
  });
});