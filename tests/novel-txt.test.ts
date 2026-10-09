import { expect, test } from "bun:test";
import { importNovelFiles, parseNovelFile } from "../src/lib/novel-txt";

test("TXT numbering and title come from filename, including zero and decimals", () => {
  expect(parseNovelFile("Capítulo 2,5 - Extra.txt", "Um parágrafo de texto.")).toEqual({ number: 2.5, title: "Extra", content: "Um parágrafo de texto.", pages: [] });
  expect(parseNovelFile("0.txt", "Um parágrafo de texto.").number).toBe(0);
  expect(() => parseNovelFile("novel.txt", "Um parágrafo de texto.")).toThrow("Nome sem número");
});
test("TXT import preserves illustrations in paragraph order", () => {
  const content = "Antes da imagem.\n\n[img:https://example.com/a.webp]\n\nDepois da imagem.";
  expect(parseNovelFile("1.txt", content).content).toBe(content);
});
test("imports sequentially without a count cap and stores no source file", async () => {
  let saved = 0;
  let active = 0;
  await importNovelFiles(Array.from({ length: 1001 }, (_, i) => ({ name: `${i}.txt`, text: async () => "Texto do capítulo completo." })), [], async (chapter) => {
    active++;
    expect(active).toBe(1);
    expect(Object.keys(chapter).sort()).toEqual(["content", "number", "pages", "title"]);
    await Promise.resolve();
    active--;
    saved++;
  }, () => {});
  expect(saved).toBe(1001);
});
test("duplicates cannot overwrite chapters and errors do not stop the batch", async () => {
  const saved: number[] = [];
  const failures: number[] = [];
  await importNovelFiles(["1", "2", "2", "3"].map(n => ({ name: `${n}.txt`, text: async () => "Texto do capítulo completo." })), [1], async c => { saved.push(c.number); }, (i, error) => { if (error) failures.push(i); });
  expect(saved).toEqual([2, 3]);
  expect(failures).toEqual([0, 2]);
});