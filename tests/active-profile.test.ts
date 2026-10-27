import { expect, test } from "bun:test";
import { allowedAgeRatings, isWorkAllowed, MAX_PROFILES } from "../src/lib/active-profile";

const kids = (kidsMaxAge: "L" | "10" | "12") => ({ id: "x", name: "K", color: "blue", kidsMaxAge });

test("account allows 6 profiles", () => { expect(MAX_PROFILES).toBe(6); });
test("Só Livre allows only L", () => { expect(allowedAgeRatings(kids("L"))).toEqual(["L"]); });
test("até 12 blocks 14+", () => {
  expect(isWorkAllowed("12", kids("12"))).toBe(true);
  expect(isWorkAllowed("14", kids("12"))).toBe(false);
});
test("kids profile hides works without age rating", () => { expect(isWorkAllowed(null, kids("10"))).toBe(false); });
test("adult profile sees everything", () => {
  expect(isWorkAllowed("18", { id: "m", name: "P", color: "orange", kidsMaxAge: null })).toBe(true);
});
