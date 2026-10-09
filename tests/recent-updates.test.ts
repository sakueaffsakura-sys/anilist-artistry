import { expect, test } from "bun:test";
import { selectRecentUpdates } from "../src/lib/recent-updates";

test("recent updates shows at most seven works and preserves their order", () => {
  const rows = Array.from({ length: 10 }, (_, index) => ({ id: index + 1 }));
  expect(selectRecentUpdates(rows).map((row) => row.id)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  expect(selectRecentUpdates(rows.slice(0, 2))).toEqual(rows.slice(0, 2));
});