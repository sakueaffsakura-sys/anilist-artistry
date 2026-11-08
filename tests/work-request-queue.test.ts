import { describe, expect, test } from "bun:test";
import { groupRequests, parseIngestBody, queueOrder, requestGroupKey, INGEST_MAX_REQUESTS } from "../src/lib/mediocre-ingest.server";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const req = (n: number, title: string, kind = "Manhwa", created = `2026-11-0${n}T10:00:00Z`, extra: Partial<{ notes: string; mediocre_id: number }> = {}) =>
  ({ id: id(n), title, kind, notes: extra.notes ?? "", created_at: created, mediocre_id: extra.mediocre_id ?? null });

describe("pedidos dos leitores no app", () => {
  test("mesma obra pedida por vários leitores vira um grupo, mais pedidos primeiro", () => {
    const groups = groupRequests([
      req(1, "Akame ga Kill"),
      req(2, "Solo Leveling", "Manhwa"),
      req(3, "akame ga kill!", "Manga", undefined, { notes: "Por favor" }),
      req(4, "Akame ga Kill", "Novel"),
    ]);
    expect(groups.map((g) => [g.title, g.count])).toEqual([["Akame ga Kill", 2], ["Solo Leveling", 1], ["Akame ga Kill", 1]]);
    expect(groups[0]!.kinds).toEqual(["Manhwa", "Manga"]);
    expect(groups[0]!.notes).toEqual(["Por favor"]);
    expect(groups[0]!.ids).toEqual([id(1), id(3)]);
  });

  test("empate em número de pedidos: o mais antigo primeiro; obra já escolhida aparece no grupo", () => {
    const groups = groupRequests([req(5, "B"), req(2, "A", "Manga", undefined, { mediocre_id: 77 })]);
    expect(groups.map((g) => g.title)).toEqual(["A", "B"]);
    expect(groups[0]!.mediocreId).toBe(77);
  });

  test("novel fica separada dos quadrinhos de mesmo nome", () => {
    expect(requestGroupKey("Ômniscient Reader", "Novel")).toBe("omniscient reader|novel");
    expect(requestGroupKey("Omniscient Reader!", "Manhwa")).toBe("omniscient reader");
  });

  test("fila: em andamento, depois mais pedidas, depois ordem de chegada", () => {
    const order = queueOrder([
      { id: 1, status: "waiting", priority: 0, created_at: "2026-11-01" },
      { id: 2, status: "waiting", priority: 3, created_at: "2026-11-05" },
      { id: 3, status: "running", priority: 0, created_at: "2026-11-06" },
      { id: 4, status: "waiting", priority: 3, created_at: "2026-11-02" },
      { id: 5, status: "waiting", priority: 1, created_at: "2026-11-03" },
    ]).map((r) => r.id);
    expect(order).toEqual([3, 4, 2, 5, 1]);
  });

  test("ligar e recusar pedidos validam os dados", () => {
    expect(parseIngestBody({ action: "requests" })).toEqual({ action: "requests" });
    expect(parseIngestBody({ action: "request_link", ids: [id(1), id(1)], obraId: 9, title: "X" })).toEqual({ action: "request_link", ids: [id(1)], obraId: 9, title: "X" });
    expect(() => parseIngestBody({ action: "request_link", ids: ["nao-e-uuid"], obraId: 9 })).toThrow();
    expect(() => parseIngestBody({ action: "request_link", ids: [], obraId: 9 })).toThrow();
    expect(() => parseIngestBody({ action: "request_link", ids: [id(1)], obraId: 0 })).toThrow();
    expect(() => parseIngestBody({ action: "request_link", ids: Array.from({ length: INGEST_MAX_REQUESTS + 1 }, (_, i) => id(i)), obraId: 1 })).toThrow();
    expect(parseIngestBody({ action: "request_reject", ids: [id(2)], note: "  Não existe  " })).toEqual({ action: "request_reject", ids: [id(2)], note: "Não existe" });
  });
});
