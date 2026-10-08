import { describe, expect, test } from "bun:test";
import { extractChapter, parseNovelContent, prepareChapterText } from "../src/lib/novel-content";

describe("illustrated novels", () => {
  test("keeps illustrations between the original paragraphs", () => {
    const result = extractChapter('<div class="prose"><p>Antes &amp; agora<img src="https://example.com/a.webp">Depois</p><img src="https://example.com/b.webp"><p>Fim.</p></div><p>Comentário externo</p>');
    expect(parseNovelContent(result.content)).toEqual([
      { type: "text", text: "Antes & agora" },
      { type: "image", src: "https://example.com/a.webp" },
      { type: "text", text: "Depois" },
      { type: "image", src: "https://example.com/b.webp" },
      { type: "text", text: "Fim." },
    ]);
  });
  test("saving imported content retains image URLs unchanged", () => {
    const content = "Antes.\n\n[img:https://example.com/image.webp?size=100&v=2]\n\nDepois.";
    expect(prepareChapterText(content).content).toBe(content);
  });
  test("resolves lazy images against the chapter address", () => {
    const result = extractChapter('<p>Texto.</p><img data-src="../image.webp">', "https://example.com/novel/1/");
    expect(parseNovelContent(result.content)[1]).toEqual({ type: "image", src: "https://example.com/novel/image.webp" });
  });
  test("rejects executable and local image sources", () => {
    expect(parseNovelContent(extractChapter('<p>Texto.</p><img src="javascript:alert(1)"><img src="file:///etc/passwd"><script>bad()</script>').content)).toEqual([{ type: "text", text: "Texto." }]);
  });
  test("plain text chapters remain compatible", () => {
    expect(parseNovelContent("Primeiro.\n\nSegundo.")).toEqual([{ type: "text", text: "Primeiro." }, { type: "text", text: "Segundo." }]);
  });
});