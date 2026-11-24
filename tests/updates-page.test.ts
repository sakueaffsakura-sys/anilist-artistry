import { describe, expect, test } from "bun:test";
import { UPDATES_PAGE_SIZE, formatAccent, splitUpdatesPage, updatesOffset } from "../src/lib/updates-page";

describe("página Atualizados", () => {
  test("a página 1 começa na primeira obra e cada página avança 42", () => {
    expect(UPDATES_PAGE_SIZE).toBe(42);
    expect(updatesOffset(1)).toBe(0);
    expect(updatesOffset(2)).toBe(42);
    expect(updatesOffset(5)).toBe(168);
  });

  test("número de página inválido cai na página 1", () => {
    expect(updatesOffset(0)).toBe(0);
    expect(updatesOffset(-3)).toBe(0);
    expect(updatesOffset(Number.NaN)).toBe(0);
    expect(updatesOffset(2.9)).toBe(42);
  });

  test("a obra extra pedida só serve para saber se há próxima página", () => {
    const full = Array.from({ length: UPDATES_PAGE_SIZE + 1 }, (_, index) => index);
    const withNext = splitUpdatesPage(full);
    expect(withNext.items).toHaveLength(UPDATES_PAGE_SIZE);
    expect(withNext.hasNext).toBe(true);
    expect(splitUpdatesPage(full.slice(0, UPDATES_PAGE_SIZE)).hasNext).toBe(false);
    expect(splitUpdatesPage([])).toEqual({ items: [], hasNext: false });
  });

  test("só o Comic2 usa o roxo", () => {
    expect(formatAccent("Comic2")).toBe("violet");
    expect(formatAccent("Comic")).toBe("orange");
    expect(formatAccent("Novel")).toBe("orange");
  });
});
