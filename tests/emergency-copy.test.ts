import { afterAll, describe, expect, test } from "bun:test";

const realFetch = globalThis.fetch;
const files: Record<string, unknown> = {
  "index.json": { generated_at: "2026-11-14T10:00:00Z", works: [{ id: "11111111-1111-1111-1111-111111111111", slug: "a" }] },
  "capitulos/22222222-2222-2222-2222-222222222222.json": { id: "22222222-2222-2222-2222-222222222222", series_id: "11111111-1111-1111-1111-111111111111", number: 1, title: null, created_at: "", pages: ["https://cdn.x/1.jpg", "javascript:alert(1)", 5], content: null },
};
const asked: string[] = [];
globalThis.fetch = (async (input: RequestInfo | URL) => {
  const url = String(input);
  asked.push(url);
  const key = url.replace("https://copia.test/base/", "");
  return key in files ? Response.json(files[key]) : new Response("", { status: 404 });
}) as typeof fetch;
process.env["COPIA_OBRAS_URL"] = "https://copia.test/base/";
afterAll(() => { globalThis.fetch = realFetch; });

describe("leitura da cópia", () => {
  test("lê o índice salvo", async () => {
    const { readBackupIndex } = await import("../src/lib/emergency.server");
    expect((await readBackupIndex())?.works.length).toBe(1);
  });
  test("capítulo só mantém páginas com endereço http(s)", async () => {
    const { readBackupChapter } = await import("../src/lib/emergency.server");
    expect((await readBackupChapter("22222222-2222-2222-2222-222222222222"))?.pages).toEqual(["https://cdn.x/1.jpg"]);
  });
  test("id fora do formato nunca vira caminho de arquivo", async () => {
    const { readBackupChapter } = await import("../src/lib/emergency.server");
    const before = asked.length;
    expect(await readBackupChapter("../index")).toBeNull();
    expect(asked.length).toBe(before);
  });
});
