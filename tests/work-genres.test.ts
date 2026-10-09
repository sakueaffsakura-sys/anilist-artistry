import { describe, expect, it } from "bun:test";
import { GENRES, genreAliases, normalizeGenres } from "../src/lib/work-genres";

describe("shared work genres", () => {
  it("offers the full AniList genre set and common manga and novel genres", () => {
    for (const genre of ["Ação", "Aventura", "Comédia", "Drama", "Ecchi", "Fantasia", "Terror", "Garota Mágica", "Mecha", "Música", "Mistério", "Psicológico", "Romance", "Ficção Científica", "Cotidiano", "Esportes", "Sobrenatural", "Suspense", "Yaoi", "Yuri", "Hentai", "Manhwa", "Isekai", "Murim", "Cultivo"]) {
      if (genre === "Manhwa") continue; // A format, not a genre.
      expect(GENRES).toContain(genre);
    }
  });
  it("deduplicates imported and selected genres using Portuguese labels", () => {
    expect(normalizeGenres(["Action", " Ação ", "Fantasy", "", "Sci-Fi", "Boys' Love"])).toEqual(["Ação", "Fantasia", "Ficção Científica", "Yaoi"]);
  });
  it("preserves existing custom genres when editing a work", () => {
    expect(normalizeGenres(["Gênero antigo", "Adventure"])).toEqual(["Gênero antigo", "Aventura"]);
  });
  it("matches both old imported genres and new selections in catalog filters", () => {
    expect(genreAliases("Ação")).toEqual(["Ação", "Action"]);
    expect(genreAliases("Sci-Fi")).toEqual(["Ficção Científica", "Sci-Fi"]);
  });
});