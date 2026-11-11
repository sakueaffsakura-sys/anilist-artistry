import { describe, expect, it, mock } from "bun:test";

const calls: Array<[string, ...unknown[]]> = [];
mock.module("../src/integrations/supabase/client", () => ({
  supabase: { from: (table: string) => {
    calls.push(["from", table]);
    const query: Record<string, unknown> = {};
    for (const method of ["select", "eq", "neq", "ilike", "or", "order", "range", "in", "abortSignal"]) {
      query[method] = (...args: unknown[]) => { calls.push([method, ...args]); return query; };
    }
    query.then = (resolve: (value: unknown) => unknown) => resolve({ error: null, count: 91,
      data: table === "profiles" ? [{ id: "account-a", username: "reader" }] : table === "user_roles" ? [{ user_id: "account-a", role: "uploader" }] : [{ id: "work", chapter_count_total: 557 }],
    });
    return query;
  } },
}));
const { fetchAdminWorks, fetchAdminAccounts, adminPageRange, literalSearch } = await import("../src/lib/admin-lists");

describe("Bounded admin lists", () => {
  it("fetches the second page with aggregate totals instead of chapter IDs", async () => {
    calls.length = 0;
    const result = await fetchAdminWorks(2, "One Piece", "draft");
    expect(calls).toContainEqual(["range", 30, 59]);
    expect(calls).toContainEqual(["eq", "published", false]);
    expect(calls).toContainEqual(["ilike", "title", "%One Piece%"]);
    expect(String(calls.find(call => call[0] === "select")?.[1])).toContain("chapter_count_total");
    expect(result.rows[0]?.chapter_count_total).toBe(557);
    expect(result.total).toBe(91);
  });
  it("only reads roles for accounts on the requested page", async () => {
    calls.length = 0;
    const result = await fetchAdminAccounts(1, "reader");
    expect(calls).toContainEqual(["in", "user_id", ["account-a"]]);
    expect(calls).toContainEqual(["range", 0, 29]);
    expect(result.rows[0]?.roles).toEqual(["uploader"]);
    expect(calls.some(call => call[0] === "or")).toBe(true);
  });
  it("escapes wildcard searches and clamps pages", () => {
    expect(literalSearch("  10%_  ")).toBe("%10\\%\\_%");
    expect(adminPageRange(0)).toEqual([0, 29]);
  });
});