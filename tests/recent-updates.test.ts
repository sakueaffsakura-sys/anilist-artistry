import { expect, test } from "bun:test";
import { RECENT_UPDATES_LIMIT, selectRecentUpdates } from "../src/lib/recent-updates";

test("recent updates shows at most twelve works and preserves their order", () => {
  expect(RECENT_UPDATES_LIMIT).toBe(12);
  const rows = Array.from({ length: 15 }, (_, index) => ({ id: index + 1 }));
  expect(selectRecentUpdates(rows).map((row) => row.id)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  expect(selectRecentUpdates(rows.slice(0, 2))).toEqual(rows.slice(0, 2));
});
