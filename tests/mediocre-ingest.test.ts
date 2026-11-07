import { describe, expect, test } from "bun:test";
import { parseIngestBody, suppliedGetter, INGEST_MAX_CHAPTERS } from "../src/lib/mediocre-ingest.server";
describe("ingest", () => {
  test("rejects more than 5 chapters", () => {
    const ch = Array.from({ length: INGEST_MAX_CHAPTERS + 1 }, (_, i) => ({ capId: i + 1, meta: {} }));
    expect(() => parseIngestBody({ action: "chapters", obraId: 1, chapters: ch })).toThrow();
    expect(INGEST_MAX_CHAPTERS).toBe(5);
  });
  test("rejects bad work id", () => { expect(() => parseIngestBody({ action: "work", obraId: -1, work: {} })).toThrow(); });
  test("getter only serves supplied data", async () => {
    const g = suppliedGetter({ "/obras/1": { a: 1 } }, null);
    expect((await g("api", "/obras/1")).ok).toBe(true);
    expect((await g("api", "/obras/2")).ok).toBe(false);
    expect((await g("cdn", "/x")).ok).toBe(false);
  });
});
