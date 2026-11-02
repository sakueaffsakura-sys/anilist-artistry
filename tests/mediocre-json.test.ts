import { expect, test } from "bun:test";
import { parseMediocreLink, parseMediocrePages } from "../src/lib/mediocre-json";

test("reads chapter number from link", () => {
  expect(parseMediocreLink("https://cdn.mediocrescan.com/obras/750/capitulos/1/15835cdf-fcda-45ca-8f1b-0d8b10119255.json").number).toBe(1);
});
test("rejects other hosts", () => {
  expect(() => parseMediocreLink("https://evil.com/obras/750/capitulos/1/a.json")).toThrow();
});
test("orders pages by ordem", () => {
  expect(parseMediocrePages([{ ordem: 2, url: "obras/1/b.webp" }, { ordem: 1, url: "obras/1/a.webp" }]))
    .toEqual(["https://cdn.mediocrescan.com/obras/1/a.webp", "https://cdn.mediocrescan.com/obras/1/b.webp"]);
});
test("accepts script page wrappers and absolute CDN links", () => {
  expect(parseMediocrePages({ data: { pages: [{ src: "https://cdn.mediocrescan.com/obras/750/capitulos/1/a.webp", ordem: 1 }] } }))
    .toEqual(["https://cdn.mediocrescan.com/obras/750/capitulos/1/a.webp"]);
  expect(parseMediocrePages({ paginas: ["obras/750/a.png"] })).toEqual(["https://cdn.mediocrescan.com/obras/750/a.png"]);
});
test("rejects foreign page URLs and credentials", () => {
  for (const url of ["https://evil.com/a.webp", "https://user:pass@cdn.mediocrescan.com/a.webp", "https://cdn.mediocrescan.com:444/a.webp", "../a.webp"]) {
    expect(() => parseMediocrePages([{ url }])).toThrow();
  }
});
