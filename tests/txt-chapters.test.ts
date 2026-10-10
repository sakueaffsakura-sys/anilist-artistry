import { describe, expect, test } from "bun:test";
import { parseTxtChapter, publishTxtChapters } from "../src/lib/txt-chapters";
import { compareChapterFilenames } from "../src/lib/chapter-filename";

describe("work TXT chapters", () => {
  test("dot and hyphen filenames represent the same decimal chapter", () => {
    for (const name of ["1.1.txt", "1-1.txt"]) {
      expect(parseTxtChapter(name, "https://example.com/a.webp")).toEqual({ number: 1.1, title: null, pages: ["https://example.com/a.webp"] });
    }
    expect(parseTxtChapter("2-2.txt", "https://example.com/a.webp").number).toBe(2.2);
    expect(parseTxtChapter("Capítulo 12-2 - Extra.txt", "https://example.com/a.webp").title).toBe("Extra");
  });
  test("selection sorts by normalized chapter number, not filename punctuation", () => {
    const files = ["12.txt", "2.5.txt", "2-2.txt", "1-1.txt", "2.txt", "0.txt"].map(name => ({ name }));
    expect(files.sort(compareChapterFilenames).map(file => parseTxtChapter(file.name, "https://example.com/a.webp").number)).toEqual([0, 1.1, 2, 2.2, 2.5, 12]);
  });
  test("equivalent dot and hyphen filenames cannot publish twice", async () => {
    const saved: number[] = [];
    const failures: number[] = [];
    await publishTxtChapters(["1.1.txt", "1-1.txt", "2-2.txt"].map(name => ({ name, text: async () => "https://example.com/a.webp" })), [], async chapter => { saved.push(chapter.number); }, (index, error) => { if (error) failures.push(index); });
    expect(saved).toEqual([1.1, 2.2]);
    expect(failures).toEqual([1]);
  });
  test("filename supplies chapter numbering including zero and decimals", () => {
    expect(parseTxtChapter("0.txt", "https://example.com/a.webp").number).toBe(0);
    expect(parseTxtChapter("Capítulo 12,5 - Extra.txt", "https://example.com/a.webp")).toEqual({ number: 12.5, title: "Extra", pages: ["https://example.com/a.webp"] });
  });
  test("preserves page order and rejects failed extraction files", () => {
    expect(parseTxtChapter("1.txt", "\uFEFFhttps://example.com/b.webp\r\nhttps://example.com/a.webp\nhttps://example.com/b.webp").pages).toEqual(["https://example.com/b.webp", "https://example.com/a.webp"]);
    expect(() => parseTxtChapter("3.txt", "# Erro ao analisar este capítulo\n# As imagens não carregaram a tempo")).toThrow("Nenhum link");
  });
  test("no artificial selection cap, sequential writes and no source TXT in stored payload", async () => {
    let count = 0;
    let active = 0;
    await publishTxtChapters(Array.from({ length: 1001 }, (_, i) => ({ name: `${i}.txt`, text: async () => "https://example.com/a.webp" })), [], async (chapter) => {
      active++;
      expect(active).toBe(1);
      expect(Object.keys(chapter).sort()).toEqual(["number", "pages", "title"]);
      await Promise.resolve();
      count++;
      active--;
    }, () => {});
    expect(count).toBe(1001);
  });
  test("duplicates never overwrite existing chapters and failures do not stop valid files", async () => {
    const stored: number[] = [];
    const failures: number[] = [];
    await publishTxtChapters(["0", "1", "1", "2"].map((n) => ({ name: `${n}.txt`, text: async () => "https://example.com/a.webp" })), [0], async (chapter) => { stored.push(chapter.number); }, (i, error) => { if (error) failures.push(i); });
    expect(stored).toEqual([1, 2]);
    expect(failures).toEqual([0, 2]);
  });
  test("invalid links and ambiguous numbers cannot publish", () => {
    expect(() => parseTxtChapter("obra268cap1.txt", "https://example.com/a.webp")).toThrow("Nome sem numeração");
    expect(() => parseTxtChapter("1.txt", "javascript:alert(1)")).toThrow("Link inválido");
  });
});