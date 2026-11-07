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
describe("Work category labels", () => {
  it("shows legacy names as the main category and English in Portuguese", async () => {
    const { kindLabel, kindValues, PUBLIC_KINDS, sameKind } = await import("../src/lib/work-categories");
    expect(kindLabel("Comic2")).toBe("Comic");
    expect(kindLabel("Shoujo2")).toBe("Shoujo");
    expect(kindLabel("English")).toBe("Em inglês");
    expect(kindLabel("Manhwa")).toBe("Manhwa");
    expect(PUBLIC_KINDS).not.toContain("Comic2");
    expect(PUBLIC_KINDS).not.toContain("Shoujo2");
    expect(kindValues("Comic")).toEqual(["Comic", "Comic2"]);
    expect(kindValues("Manga")).toEqual(["Manga"]);
    expect(sameKind("Shoujo2", "Shoujo")).toBe(true);
  });
});

describe("Chapter subtitle", () => {
  it("hides titles that only repeat the chapter number", async () => {
    const { chapterSubtitle, formatRating } = await import("../src/lib/format");
    expect(chapterSubtitle("Capítulo 43", 43)).toBeNull();
    expect(chapterSubtitle("Cap. 14", "14")).toBeNull();
    expect(chapterSubtitle("Chapter 7.5", 7.5)).toBeNull();
    expect(chapterSubtitle("", 3)).toBeNull();
    expect(chapterSubtitle("O retorno do herói", 12)).toBe("O retorno do herói");
    expect(chapterSubtitle("Capítulo 2: a fuga", 2)).toBe("Capítulo 2: a fuga");
    expect(formatRating(7.56)).toBe("7,6");
    expect(formatRating(null)).toBe("0,0");
  });
});
