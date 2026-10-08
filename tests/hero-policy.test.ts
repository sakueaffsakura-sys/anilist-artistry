import { describe, expect, it } from "bun:test";
import { selectHeroItems } from "../src/lib/hero-policy";

describe("Administrator-selected highlights", () => {
  it("includes only explicitly enabled works", () => {
    expect(selectHeroItems([{ id: "enabled", in_slider: true }, { id: "disabled", in_slider: false }]).map((item) => item.id)).toEqual(["enabled"]);
  });
  it("does not show another work when none are enabled", () => {
    expect(selectHeroItems([{ id: "recent", in_slider: false }])).toEqual([]);
  });
});