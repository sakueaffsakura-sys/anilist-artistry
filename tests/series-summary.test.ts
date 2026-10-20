import { describe, expect, it, mock } from "bun:test";
import { chapterCount } from "../src/lib/series-summary";

const calls: Array<[string, ...unknown[]]> = [];
mock.module("../src/integrations/supabase/client", () => ({
  supabase: { from: (table: string) => {
    calls.push(["from", table]);
    const query = {
      select: (value: string) => { calls.push(["select", value]); return query; },
      eq: (key: string, value: unknown) => { calls.push(["eq", key, value]); return query; },
      order: (key: string, options: unknown) => { calls.push(["order", key, options]); return query; },
      limit: (value: number, options?: unknown) => { calls.push(["limit", value, options]); return query; },
      then: (resolve: (value: unknown) => unknown) => {
        const work = { id: "work", recent_chapters: [{ number: 41, created_at: "2026-01-01" }, { number: 42, created_at: "2026-01-02" }], chapter_total: [{ count: 500 }] };
        return resolve({ data: table === "favorites" ? [{ series: work }] : [work], error: null });
      },
    };
    return query;
  } },
}));
const { fetchSeries, fetchFavorites } = await import("../src/lib/queries");

describe("Lightweight work lists", () => {
  it("keeps the real total instead of treating two preview links as two chapters", () => {
    expect(chapterCount({ chapter_count: 500, chapters: [{}, {}] })).toBe(500);
    expect(chapterCount({ chapters: [{}, {}] })).toBe(2);
    expect(chapterCount({ chapter_count: 0, chapters: [] })).toBe(0);
  });
  it("downloads only two published chapter previews plus an aggregate", async () => {
    calls.length = 0;
    const rows = await fetchSeries({ limit: 14 });
    expect(calls).toContainEqual(["limit", 2, { referencedTable: "recent_chapters" }]);
    expect(calls).toContainEqual(["order", "number", { referencedTable: "recent_chapters", ascending: false }]);
    expect(calls).toContainEqual(["eq", "chapter_total.published", true]);
    expect(rows[0]?.chapter_count).toBe(500);
    expect(rows[0]?.chapters.map((c) => c.number)).toEqual([42, 41]);
  });
  it("bounds nested chapters for signed-in favorites too", async () => {
    calls.length = 0;
    await fetchFavorites("reader-id");
    expect(calls).toContainEqual(["eq", "user_id", "reader-id"]);
    expect(calls).toContainEqual(["limit", 2, { referencedTable: "series.recent_chapters" }]);
    expect(calls).toContainEqual(["eq", "series.chapter_total.published", true]);
  });
});