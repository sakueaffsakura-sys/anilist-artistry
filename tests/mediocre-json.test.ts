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
