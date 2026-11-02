import { describe, expect, it } from "bun:test";
import { mediocreErrorFor, mediocrePath, parseMediocreRequest } from "../src/lib/mediocre-api";

describe("MediocreScan proxy rules", () => {
  it("maps obra to its fixed path", () => {
    expect(mediocrePath(parseMediocreRequest({ operation: "obra", obraId: 20564 }))).toBe("/obras/20564");
  });
  it("maps user chapters to user 156358", () => {
    expect(mediocrePath({ operation: "capitulos_usuario" })).toBe("/readings/user/156358/chapters");
  });
  it("rejects unknown operations", () => {
    expect(() => parseMediocreRequest({ operation: "delete" })).toThrow();
  });
  it("rejects non-numeric or URL obraId", () => {
    expect(() => parseMediocreRequest({ operation: "obra", obraId: "https://x.com" })).toThrow();
    expect(() => parseMediocreRequest({ operation: "obra", obraId: -5 })).toThrow();
  });
  it("uses the 401 message", () => {
    expect(mediocreErrorFor(401).message).toBe("O token da API é inválido ou expirou.");
  });
});
