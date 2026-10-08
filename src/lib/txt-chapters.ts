export type TxtChapter = { number: number; title: string | null; pages: string[] };

/** A TXT describes one image chapter; the filename supplies its number. */
export function parseTxtChapter(name: string, raw: string): TxtChapter {
  if (!/\.txt$/i.test(name)) throw new Error("Selecione um arquivo TXT.");
  const stem = name.replace(/\.txt$/i, "").trim();
  const match = stem.match(/^(?:cap(?:[íi]tulo|itulo|[.]?)?|chapter)?\s*(\d+(?:[.,]\d+)?)(?:\s*[-–—_]\s*(.+))?$/i);
  if (!match?.[1]) throw new Error("Nome sem numeração: use 0.txt ou Capítulo 12 - Título.txt.");
  const number = Number(match[1].replace(",", "."));
  if (!Number.isFinite(number) || number < 0 || number > 100000) throw new Error("Número do capítulo inválido.");
  const pages: string[] = [];
  const seen = new Set<string>();
  for (const [i, line] of raw.replace(/^\uFEFF/, "").split(/\r?\n/).entries()) {
    const value = line.trim();
    if (!value || value.startsWith("#")) continue;
    let url: URL;
    try { url = new URL(value); } catch { throw new Error(`Link inválido na linha ${i + 1}.`); }
    if (!/^https?:$/.test(url.protocol) || url.username || url.password || /\s/.test(value)) {
      throw new Error(`Link inválido na linha ${i + 1}.`);
    }
    if (!seen.has(value)) { pages.push(value); seen.add(value); }
  }
  if (!pages.length) throw new Error("Nenhum link de página encontrado no TXT.");
  const title = match[2]?.trim() || null;
  if (title && title.length > 150) throw new Error("Título muito longo (máx. 150).");
  return { number, title, pages };
}

/** No slice/count limit: read and save one file at a time. */
export async function publishTxtChapters(
  files: { name: string; text: () => Promise<string> }[],
  existing: Iterable<number>,
  save: (chapter: TxtChapter) => Promise<void>,
  onResult: (index: number, error: string | null) => void,
  cancelled: () => boolean = () => false,
) {
  const taken = new Set(existing);
  for (let index = 0; index < files.length; index++) {
    if (cancelled()) break;
    const file = files[index];
    if (!file) continue;
    try {
      const chapter = parseTxtChapter(file.name, await file.text());
      if (taken.has(chapter.number)) throw new Error(`O capítulo ${chapter.number} já existe ou está repetido no lote.`);
      await save(chapter);
      taken.add(chapter.number);
      onResult(index, null);
    } catch (error) {
      onResult(index, error instanceof Error ? error.message : "Falha ao publicar capítulo.");
    }
  }
}