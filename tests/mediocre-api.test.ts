import { describe, expect, it } from "bun:test";
import { chapterContentPath, isAdultTag, mediocreErrorFor, mediocrePath, normalizeChapterContent, parseMediocreRequest, titleKey } from "../src/lib/mediocre-api";

describe("MediocreScan proxy rules", () => {
  it("maps obra to its fixed path", () => {
    expect(mediocrePath(parseMediocreRequest({ operation: "obra", obraId: 20564 }))).toBe("/obras/20564");
  });
  it("maps user chapters to user 156358", () => {
    expect(mediocrePath(parseMediocreRequest({ operation: "capitulos_usuario", obraId: 20564 }))).toBe("/readings/user/156358/chapters?obr_id=20564");
  });
  it("home sends formato=1", () => {
    expect(mediocrePath({ operation: "home" })).toBe("/obras/home?formato=1");
  });
  it("rejects unknown operations", () => {
    expect(() => parseMediocreRequest({ operation: "delete" })).toThrow();
  });
  it("rejects non-numeric or URL obraId", () => {
    expect(() => parseMediocreRequest({ operation: "obra", obraId: "https://x.com" })).toThrow();
    expect(() => parseMediocreRequest({ operation: "obra", obraId: -5 })).toThrow();
  });
  it("uses the 401 message", () => {
    expect(mediocreErrorFor(401).message).toBe("O token da API está inválido ou expirou.");
  });
});

describe("MediocreScan chapter content", () => {
  it("content path only from valid metadata", () => {
    expect(chapterContentPath({ obr_id: 20564, cap_num: 1, cap_uuid: "28cc5d19-b7ad-46c4-982c-a52a2b1ed8a2" })).toBe("/obras/20564/capitulos/1/28cc5d19-b7ad-46c4-982c-a52a2b1ed8a2.json");
    expect(chapterContentPath({ obr_id: 20564, cap_num: 1, cap_uuid: "../x" })).toBeNull();
  });
  it("chapter content takes only chapter id", () => {
    expect(parseMediocreRequest({ operation: "conteudo_capitulo", capituloId: 548465, url: "https://evil" })).toEqual({ operation: "conteudo_capitulo", capituloId: 548465 });
  });
  it("orders CDN pages by ordem and resolves relative urls", () => {
    const b = normalizeChapterContent([{ url: "obras/1/capitulos/1/b.webp", ordem: 2 }, { url: "obras/1/capitulos/1/a.webp", ordem: 1 }]);
    expect(b).toEqual([{ type: "image", url: "https://cdn.mediocrescan.com/obras/1/capitulos/1/a.webp" }, { type: "image", url: "https://cdn.mediocrescan.com/obras/1/capitulos/1/b.webp" }]);
  });
  it("keeps mixed block order", () => {
    const b = normalizeChapterContent({ blocks: [{ type: "text", content: "Oi" }, { type: "image", url: "https://x.com/p.jpg" }] });
    expect(b.map((x) => x.type)).toEqual(["text", "image"]);
  });
  it("reads plain text content", () => {
    expect(normalizeChapterContent({ content: "Texto" })).toEqual([{ type: "text", text: "Texto" }]);
  });
  it("title match ignores accents and case", () => {
    expect(titleKey("Esposa  Falsa!")).toBe(titleKey("esposa falsa"));
    expect(titleKey("Diário")).toBe("diario");
  });
});

it("recentes paging uses offset of 30 per page with format", () => {
  expect(mediocrePath({ operation: "recentes", formato: 4, pagina: 3 })).toBe("/obras/atualizadas-recentes?formato=4&offset=60");
  expect(mediocrePath({ operation: "recentes" })).toBe("/obras/atualizadas-recentes");
  expect(() => parseMediocreRequest({ operation: "recentes", pagina: 0 })).toThrow();
  expect(() => parseMediocreRequest({ operation: "recentes", formato: 99 })).toThrow();
});

import { isIpBlockedBody } from "../src/lib/mediocre-api.server";
it("classifies 'IP bloqueado' as an IP block", () => {
  expect(isIpBlockedBody('{"message":"IP bloqueado.","statusCode":403}')).toBe(true);
  expect(isIpBlockedBody('{"message":"Token inválido."}')).toBe(false);
});

const parseReq = parseMediocreRequest, pathOf = mediocrePath;
it("busca por nome usa o parâmetro string e limita o texto", () => {
  expect(pathOf(parseReq({ operation: "buscar", busca: "  Pico   Martial " }))).toBe("/obras/buscar?string=Pico+Martial");
  expect(() => parseReq({ operation: "buscar", busca: "a" })).toThrow();
  expect(() => parseReq({ operation: "buscar", busca: "x".repeat(81) })).toThrow();
});
it("adicionadas recentes paginam de 20 em 20", () => {
  expect(pathOf(parseReq({ operation: "adicionados", pagina: 3 }))).toBe("/obras/adicionados-recentes?offset=40");
  expect(pathOf(parseReq({ operation: "ranking" }))).toBe("/obras/ranking");
});

describe("MediocreScan adult tag", () => {
  it("reconhece só a etiqueta de idade", () => {
    for (const tag of ["+18", "18+", " +18 ", "+ 18"]) expect(isAdultTag(tag)).toBe(true);
    for (const tag of ["18", "+1", "+8", "Adulto", "Romance", "+180"]) expect(isAdultTag(tag)).toBe(false);
  });
});
