import { describe, expect, test } from "bun:test";
import { fetchNovelHtml } from "./novel-fetch.server";
import { validateNovelImportUrl } from "./novel-import-policy";

const chapterUrl = "https://mediocrescan.com/capitulo/285981";
const html = (body: BodyInit | null) => new Response(body, { headers: { "content-type": "text/html; charset=utf-8" } });
const fetcher = (handler: (url: string, init?: RequestInit) => Response | Promise<Response>) =>
  ((input: RequestInfo | URL, init?: RequestInit) => Promise.resolve(handler(String(input), init))) as typeof fetch;

describe("remote novel import safeguards", () => {
  test("accepts the approved chapter domain", () => {
    expect(validateNovelImportUrl(chapterUrl).hostname).toBe("mediocrescan.com");
  });

  test("rejects credentials, custom ports, private addresses and hostname tricks", () => {
    for (const url of [
      "https://user:pass@mediocrescan.com/chapter", "https://mediocrescan.com:8443/chapter",
      "http://127.0.0.1", "http://10.0.0.1", "http://169.254.169.254", "http://[::1]",
      "http://localhost", "https://host.internal", "https://host.local",
      "https://mediocrescan.com.evil.example", "https://evil.mediocrescan.com", "file:///tmp/chapter",
    ]) expect(() => validateNovelImportUrl(url)).toThrow();
  });

  test("validates redirect before fetching the next destination", async () => {
    const urls: string[] = [];
    await expect(fetchNovelHtml(chapterUrl, fetcher((url, init) => {
      urls.push(url);
      expect(init?.redirect).toBe("manual");
      return new Response(null, { status: 302, headers: { location: "http://127.0.0.1/private" } });
    }))).rejects.toThrow();
    expect(urls).toEqual([chapterUrl]);
  });

  test("follows allowed relative redirect and reads UTF-8 across chunks", async () => {
    const bytes = new TextEncoder().encode("Olá");
    const stream = new ReadableStream({ start(controller) {
      controller.enqueue(bytes.slice(0, 3)); controller.enqueue(bytes.slice(3)); controller.close();
    } });
    const result = await fetchNovelHtml(chapterUrl, fetcher((url) => url === chapterUrl
      ? new Response(null, { status: 302, headers: { location: "/safe" } }) : html(stream)));
    expect(result).toBe("Olá");
  });

  test("rejects non-HTML responses", async () => {
    await expect(fetchNovelHtml(chapterUrl, fetcher(() => new Response("{}", {
      headers: { "content-type": "application/json" },
    })))).rejects.toThrow("HTML");
  });

  test("allows exactly 3 MB and rejects one byte more without trusting Content-Length", async () => {
    expect((await fetchNovelHtml(chapterUrl, fetcher(() => html("a".repeat(3_000_000))))).length).toBe(3_000_000);
    let cancelled = false;
    const stream = new ReadableStream({ start(controller) {
      controller.enqueue(new Uint8Array(3_000_000)); controller.enqueue(new Uint8Array(1));
    }, cancel() { cancelled = true; } });
    await expect(fetchNovelHtml(chapterUrl, fetcher(() => html(stream)))).rejects.toThrow("3 MB");
    expect(cancelled).toBe(true);
  });

  test("aborts slow response bodies after 10 seconds", async () => {
    let signal: AbortSignal | null | undefined;
    const started = Date.now();
    await expect(fetchNovelHtml(chapterUrl, fetcher((_, init) => {
      signal = init?.signal;
      return html(new ReadableStream({ start() { /* Intentionally never responds. */ } }));
    }))).rejects.toThrow("10 segundos");
    expect(signal?.aborted).toBe(true);
    expect(Date.now() - started).toBeGreaterThanOrEqual(10_000);
    expect(Date.now() - started).toBeLessThan(12_000);
  }, 15_000);
});