import { describe, expect, it } from "bun:test";
import { ageRatingChoice, ageRatingUpdate } from "../src/lib/age-ratings";

describe("classificação automática no editor", () => {
  it("idade automática aparece como Automática; escolhida aparece como está", () => {
    expect(ageRatingChoice({ age_rating: "14", age_rating_auto: true })).toBe("");
    expect(ageRatingChoice({ age_rating: "12", age_rating_auto: false })).toBe("12");
    expect(ageRatingChoice({ age_rating: null, age_rating_auto: false })).toBe("");
    expect(ageRatingChoice({ age_rating: "99" })).toBe("");
  });

  it("idade escolhida fica fixa; Automática devolve às regras", () => {
    expect(ageRatingUpdate("16")).toEqual({ age_rating: "16", age_rating_auto: false });
    expect(ageRatingUpdate("")).toEqual({ age_rating: null });
    expect(ageRatingUpdate(null)).toEqual({ age_rating: null });
  });
});
