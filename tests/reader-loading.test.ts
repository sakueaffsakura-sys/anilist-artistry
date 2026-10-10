import { describe, expect, it, mock } from "bun:test";

const requests: Array<{ table: string; select: string; filters: Array<[string, unknown]> }> = [];
mock.module("../src/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      const request = { table, select: "", filters: [] as Array<[string, unknown]> };
      requests.push(request);
      const query = {
        select: (columns: string) => { request.select = columns; return query; },
        eq: (column: string, value: unknown) => { request.filters.push([column, value]); return query; },
        maybeSingle: async () => ({ data: null, error: null }),
      };
      return query;
    },
  },
}));

const { fetchSeriesBySlug } = await import("../src/lib/queries");
const { chapterQueryOptions } = await import("../src/lib/chapter-query");

describe("Reader loading budget", () => {
  it("loads the work index without downloading every chapter's text and images", async () => {
    requests.length = 0;
    await fetchSeriesBySlug("sample-work");
    expect(requests).toHaveLength(1);
    expect(requests[0]?.filters).toEqual([["slug", "sample-work"]]);
    expect(requests[0]?.select).toContain("chapters(id, number, title, created_at)");
    expect(requests[0]?.select).not.toMatch(/\b(pages|content)\b/);
  });

  it("requests content for exactly the opened chapter and caches it independently", async () => {
    requests.length = 0;
    const options = chapterQueryOptions("chapter-42");
    expect(options.queryKey).toEqual(["chapter-content", "chapter-42"]);
    if (typeof options.queryFn !== "function") throw new Error("Missing chapter fetcher");
    await options.queryFn({} as never);
    expect(requests).toEqual([{ table: "chapters", select: "id, pages, content", filters: [["id", "chapter-42"]] }]);
  });
});