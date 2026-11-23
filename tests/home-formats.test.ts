import { describe, expect, test } from "bun:test";
import { HOME_FORMATS, HOME_KINDS } from "../src/lib/home-formats";
import { KINDS } from "../src/lib/work-categories";

describe("abas da home", () => {
  test("cada aba tem pelo menos um formato", () => {
    for (const format of HOME_FORMATS) expect(HOME_KINDS[format].length).toBeGreaterThan(0);
  });

  test("nenhum formato aparece em duas abas", () => {
    const all = HOME_FORMATS.flatMap((format) => HOME_KINDS[format]);
    expect(new Set(all).size).toBe(all.length);
  });

  test("todo formato que uma obra pode ter cai em alguma aba", () => {
    const covered = new Set(HOME_FORMATS.flatMap((format) => HOME_KINDS[format]));
    for (const kind of KINDS) expect(covered.has(kind)).toBe(true);
  });

  test("a aba Comic reúne os quadrinhos verticais", () => {
    expect(HOME_KINDS.Comic).toEqual(expect.arrayContaining(["Comic", "Manhwa", "Manhua", "Webtoon"]));
  });
});
