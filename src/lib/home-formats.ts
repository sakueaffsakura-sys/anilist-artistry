/** Abas da home, na ordem do modelo. */
export const HOME_FORMATS = ["Comic", "Comic2", "Shoujo", "Shoujo2", "Manga", "Yaoi", "Yuri", "Hentai", "English", "Novel"] as const;
export type HomeFormat = (typeof HOME_FORMATS)[number];

/**
 * Formatos gravados nas obras que cada aba reúne. "Comic" junta os quadrinhos verticais (Manhwa, Manhua, Webtoon, HQ)
 * e "Manga" junta Manga, One-shot e Doujinshi, para nenhuma obra ficar fora das abas. Comic2 e Shoujo2 pegam só o nome exato.
 * Nenhum formato aparece em duas abas.
 */
export const HOME_KINDS: Record<HomeFormat, string[]> = {
  Comic: ["Comic", "Manhwa", "Manhua", "Webtoon", "HQ"],
  Comic2: ["Comic2"],
  Shoujo: ["Shoujo"],
  Shoujo2: ["Shoujo2"],
  Manga: ["Manga", "One-shot", "Doujinshi"],
  Yaoi: ["Yaoi"],
  Yuri: ["Yuri"],
  Hentai: ["Hentai"],
  English: ["English"],
  Novel: ["Novel"],
};
