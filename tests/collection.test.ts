import { describe, expect, test } from "bun:test";
import { collectionCaption, collectionFormatOf, pageWindow } from "../src/lib/collection";

describe("pageWindow", () => {
  test("início: 1 2 3 … última", () => {
    expect(pageWindow(1, 21)).toEqual([1, 2, 3, "gap", 21]);
  });
  test("meio: vizinhas da atual", () => {
    expect(pageWindow(10, 21)).toEqual([1, "gap", 9, 10, 11, "gap", 21]);
  });
  test("fim: … antepenúltima até a última", () => {
    expect(pageWindow(21, 21)).toEqual([1, "gap", 19, 20, 21]);
  });
  test("poucas páginas mostram todas, sem reticências", () => {
    expect(pageWindow(2, 4)).toEqual([1, 2, 3, 4]);
    expect(pageWindow(1, 1)).toEqual([1]);
  });
  test("uma página escondida vira o número, não reticências", () => {
    expect(pageWindow(4, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });
  test("página fora do intervalo é ajustada", () => {
    expect(pageWindow(99, 3)).toEqual([1, 2, 3]);
    expect(pageWindow(-4, 3)).toEqual([1, 2, 3]);
  });
});

describe("collectionFormatOf", () => {
  test("agrupa os formatos nas abas", () => {
    expect(collectionFormatOf("Manhwa")).toBe("Comic");
    expect(collectionFormatOf("Comic2")).toBe("Comic");
    expect(collectionFormatOf("One-shot")).toBe("Manga");
    expect(collectionFormatOf("Shoujo2")).toBe("Shoujo");
    expect(collectionFormatOf("Novel")).toBe("Novel");
  });
  test("formato desconhecido cai em Outros", () => {
    expect(collectionFormatOf("Xyz")).toBe("Outros");
    expect(collectionFormatOf(null)).toBe("Outros");
  });
});

describe("collectionCaption", () => {
  test("completo", () => expect(collectionCaption(100, 23, 23)).toBe("Completo · 23 caps"));
  test("capítulo mais recente", () => expect(collectionCaption(0, 80, 72)).toBe("Cap. 72"));
  test("sem número cai no total", () => expect(collectionCaption(40, 12, null)).toBe("Cap. 12"));
  test("sem capítulos", () => expect(collectionCaption(0, 0, null)).toBe("Sem capítulos"));
});
