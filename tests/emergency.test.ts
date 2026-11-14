import { describe, expect, test } from "bun:test";
import { chapterNeighbors, emergencyVisible, isEmergencyPath, searchBackupWorks, visibleWorks, type BackupWork } from "../src/lib/emergency";

const work = (id: string, age: string | null, title = id): BackupWork => ({
  id, slug: id, title, alt_titles: null, cover_url: null, banner_url: null, synopsis: null, genres: null,
  age_rating: age, kind: "Mangá", status: "Em andamento", rating: 0, views: 0, author: null, artist: null,
  chapter_count: 0, latest_chapter_number: null, latest_chapter_at: null, updated_at: "2026-01-01",
});

describe("modo de emergência", () => {
  test("obras +16 ficam escondidas", () => expect(emergencyVisible("16")).toBe(false));
  test("obras +18 ficam escondidas", () => expect(emergencyVisible("18")).toBe(false));
  test("obras 14 continuam visíveis", () => expect(emergencyVisible("14")).toBe(true));
  test("lista filtra só as adultas", () => {
    expect(visibleWorks([work("a", "L"), work("b", "18"), work("c", "16"), work("d", null)]).map((w) => w.id)).toEqual(["a", "d"]);
  });
  test("busca ignora acentos", () => {
    expect(searchBackupWorks([work("a", "L", "Solo Leveling"), work("b", "L", "Ação")], "acao").map((w) => w.id)).toEqual(["b"]);
  });
  test("vizinhos seguem o número do capítulo", () => {
    const n = chapterNeighbors([{ id: "c3", number: 3, title: null, created_at: "" }, { id: "c1", number: 1, title: null, created_at: "" }, { id: "c2", number: 2, title: null, created_at: "" }], "c2");
    expect([n.prev?.id, n.next?.id]).toEqual(["c1", "c3"]);
  });
  test("só caminhos /emergencia contam como emergência", () => {
    expect([isEmergencyPath("/emergencia"), isEmergencyPath("/emergencia/obra/x"), isEmergencyPath("/emergenciax")]).toEqual([true, true, false]);
  });
});
