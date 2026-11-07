import { describe, expect, test } from "bun:test";
import { parseIngestBody, suppliedGetter, INGEST_MAX_CHAPTERS, INGEST_MAX_SYNC, INGEST_MAX_CHECK } from "../src/lib/mediocre-ingest.server";
describe("ingest", () => {
  test("rejects more than 5 chapters", () => {
    const ch = Array.from({ length: INGEST_MAX_CHAPTERS + 1 }, (_, i) => ({ capId: i + 1, meta: {} }));
    expect(() => parseIngestBody({ action: "chapters", obraId: 1, chapters: ch })).toThrow();
    expect(INGEST_MAX_CHAPTERS).toBe(5);
  });
  test("rejects bad work id", () => { expect(() => parseIngestBody({ action: "work", obraId: -1, work: {} })).toThrow(); });
  test("work publishes only on explicit true", () => {
    expect(parseIngestBody({ action: "work", obraId: 1, work: {} })).toMatchObject({ publish: false });
    expect(parseIngestBody({ action: "work", obraId: 1, work: {}, publish: "yes" })).toMatchObject({ publish: false });
    expect(parseIngestBody({ action: "work", obraId: 1, work: {}, publish: true })).toMatchObject({ publish: true });
  });
  test("plan caps the sync limit", () => {
    expect(parseIngestBody({ action: "plan", syncLimit: 999 })).toEqual({ action: "plan", syncLimit: INGEST_MAX_SYNC });
    expect(parseIngestBody({ action: "plan", syncLimit: 0 })).toEqual({ action: "plan", syncLimit: 0 });
    expect(() => parseIngestBody({ action: "plan", syncLimit: -1 })).toThrow();
  });
  test("finish requires non-negative counts", () => {
    expect(parseIngestBody({ action: "finish", obraId: 3, added: 2, remaining: 0 })).toEqual({ action: "finish", obraId: 3, added: 2, remaining: 0 });
    expect(() => parseIngestBody({ action: "finish", obraId: 3, added: -1, remaining: 0 })).toThrow();
    expect(() => parseIngestBody({ action: "finish", obraId: 3, added: 1 })).toThrow();
  });
  test("check and enqueue validate ids and sizes", () => {
    expect(parseIngestBody({ action: "check", ids: [3, 3, 4] })).toEqual({ action: "check", ids: [3, 4] });
    expect(() => parseIngestBody({ action: "check", ids: [0] })).toThrow();
    expect(() => parseIngestBody({ action: "check", ids: Array.from({ length: INGEST_MAX_CHECK + 1 }, (_, i) => i + 1) })).toThrow();
    expect(parseIngestBody({ action: "enqueue", items: [{ obraId: 7, title: "X" }, { obraId: 8 }] }))
      .toEqual({ action: "enqueue", items: [{ obraId: 7, title: "X" }, { obraId: 8, title: null }] });
    expect(() => parseIngestBody({ action: "enqueue", items: [] })).toThrow();
  });
  test("site management actions validate input", () => {
    const id = "28cc5d19-b7ad-46c4-982c-a52a2b1ed8a2";
    expect(parseIngestBody({ action: "site_list", filter: "x", q: "a%b" })).toEqual({ action: "site_list", filter: "todas", q: "a b", page: 1, obraId: null });
    expect(parseIngestBody({ action: "site_update", seriesId: id, patch: { published: false, views: 9 } })).toEqual({ action: "site_update", seriesId: id, patch: { published: false } });
    expect(() => parseIngestBody({ action: "site_update", seriesId: id, patch: {} })).toThrow();
    expect(() => parseIngestBody({ action: "site_work", seriesId: "1" })).toThrow();
    expect(() => parseIngestBody({ action: "site_delete", seriesId: id, confirm: "sim" })).toThrow();
    expect(parseIngestBody({ action: "chapter_update", chapterId: id, published: true })).toEqual({ action: "chapter_update", chapterId: id, published: true });
    expect(parseIngestBody({ action: "chapter_status", obraId: 12 })).toEqual({ action: "chapter_status", obraId: 12 });
    expect(() => parseIngestBody({ action: "chapter_status", obraId: 0 })).toThrow();
  });
  test("getter only serves supplied data", async () => {
    const g = suppliedGetter({ "/obras/1": { a: 1 } }, null);
    expect((await g("api", "/obras/1")).ok).toBe(true);
    expect((await g("api", "/obras/2")).ok).toBe(false);
    expect((await g("cdn", "/x")).ok).toBe(false);
  });
});
