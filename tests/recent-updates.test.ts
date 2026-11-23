import { expect, test } from "bun:test";
import { RECENT_UPDATES_LIMIT, selectRecentUpdates } from "../src/lib/recent-updates";

test("recent updates shows at most three rows of seven works and preserves their order", () => {
  expect(RECENT_UPDATES_LIMIT).toBe(21);
  const rows = Array.from({ length: 25 }, (_, index) => ({ id: index + 1 }));
  expect(selectRecentUpdates(rows).map((row) => row.id)).toEqual(Array.from({ length: 21 }, (_, index) => index + 1));
  expect(selectRecentUpdates(rows.slice(0, 2))).toEqual(rows.slice(0, 2));
});
