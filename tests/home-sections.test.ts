import { describe, expect, test } from "bun:test";
import { HOME_SECTIONS, anilistMetrics, eligibleForSection, orderManualWorks } from "../src/lib/home-sections";

const works = [
  { id: "a", slug: "a", title: "A", kind: "Manga", rating: 8, cover_url: null },
  { id: "b", slug: "b", title: "B", kind: "Manhwa", rating: 9, cover_url: null },
];
describe("homepage section rules", () => {
  test("provides the three requested sections", () => {
    expect(HOME_SECTIONS.map((section) => section.key)).toEqual(["popular", "trending", "manhwa"]);
  });
  test("manual popular selection preserves chosen order and ignores unavailable works", () => {
    expect(orderManualWorks("popular", ["b", "missing", "a", "b"], works).map((w) => w.id)).toEqual(["b", "a"]);
  });
  test("empty manual trending selection stays empty without automatic fallback", () => {
    expect(orderManualWorks("trending", [], works)).toEqual([]);
  });
  test("Manhwa popular only accepts Manhwa", () => {
    expect(eligibleForSection("manhwa", "Manga")).toBe(false);
    expect(orderManualWorks("manhwa", ["a", "b"], works).map((w) => w.id)).toEqual(["b"]);
  });
  test("AniList imports retain popularity and trending independently", () => {
    expect(anilistMetrics({ popularity: 250000, trending: 1834 })).toEqual({ anilist_popularity: 250000, anilist_trending: 1834 });
    expect(anilistMetrics({ popularity: NaN, trending: -3 })).toEqual({ anilist_popularity: 0, anilist_trending: 0 });
  });
});