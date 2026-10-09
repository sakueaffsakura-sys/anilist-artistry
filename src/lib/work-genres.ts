/** Shared Portuguese labels; aliases keep older imports searchable without rewriting rows. */
const ALIASES: Record<string, string> = {
  Action: "Ação", Adventure: "Aventura", Comedy: "Comédia", Drama: "Drama",
  Ecchi: "Ecchi", Fantasy: "Fantasia", Horror: "Terror", "Mahou Shoujo": "Garota Mágica",
  Mecha: "Mecha", Music: "Música", Mystery: "Mistério", Psychological: "Psicológico",
  Romance: "Romance", "Sci-Fi": "Ficção Científica", "Slice of Life": "Cotidiano",
  Sports: "Esportes", Supernatural: "Sobrenatural", Thriller: "Suspense",
  "Boys' Love": "Yaoi", "Girls' Love": "Yuri", Hentai: "Hentai",
};

export const GENRES = [
  ...Object.values(ALIASES), "Artes Marciais", "Apocalipse", "Comédia Romântica",
  "Crime", "Cultivo", "Demônios", "Distopia", "Dungeon", "Escolar", "Espaço",
  "Fantasia Sombria", "Faroeste", "Gastronomia", "Gore", "Harem", "Harem Reverso",
  "Histórico", "Isekai", "Josei", "LitRPG", "Magia", "Militar", "Mitologia",
  "Murim", "Policial", "Pós-apocalíptico", "Reencarnação", "Regressão", "Seinen",
  "Shoujo", "Shounen", "Sistema", "Sobrevivência", "Super-heróis", "Tragédia",
  "Vampiros", "Viagem no Tempo", "Video Games", "Vilã", "Wuxia", "Xianxia",
  "Xuanhuan", "Zumbis", "Aventura Espacial", "Drama Familiar", "Fantasia Urbana",
].sort((a, b) => a.localeCompare(b, "pt-BR"));

export function genreLabel(value: string): string {
  const trimmed = value.trim();
  const key = Object.keys(ALIASES).find((alias) => alias.toLowerCase() === trimmed.toLowerCase());
  return key ? ALIASES[key] ?? trimmed : GENRES.find((genre) => genre.toLowerCase() === trimmed.toLowerCase()) ?? trimmed;
}

export function normalizeGenres(values: readonly string[]): string[] {
  return [...new Set(values.map(genreLabel).filter(Boolean))];
}

export function genreAliases(value: string): string[] {
  const label = genreLabel(value);
  return [...new Set([label, value, ...Object.keys(ALIASES).filter((key) => ALIASES[key] === label)])];
}