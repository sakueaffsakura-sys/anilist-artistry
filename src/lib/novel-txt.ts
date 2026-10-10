import { prepareChapterText } from "./novel-content";
import { parseChapterFilename } from "./chapter-filename";

export function parseNovelFile(name: string, raw: string) {
  if (!/\.(txt|html?)$/i.test(name)) throw new Error("Selecione arquivos TXT ou HTML.");
  const prepared = prepareChapterText(raw.replace(/^\uFEFF/, ""));
  const filename = parseChapterFilename(name);
  const value = /\.txt$/i.test(name) ? filename?.number : prepared.number ?? filename?.number;
  if (value === undefined || value === null || value === "") throw new Error("Nome sem número: use 1.txt, 1.1.txt, 1-1.txt ou Capítulo 2 - Título.txt.");
  const number = Number(String(value).replace(",", "."));
  if (!Number.isFinite(number) || number < 0) throw new Error("Número de capítulo inválido.");
  if (prepared.content.length < 10) throw new Error("Nenhum texto de capítulo encontrado.");
  return { number, title: filename?.title || prepared.title || null, content: prepared.content, pages: [] as string[] };
}

export async function importNovelFiles(
  files: { name: string; text: () => Promise<string> }[],
  existing: Iterable<number>,
  save: (chapter: ReturnType<typeof parseNovelFile>) => Promise<void>,
  result: (index: number, error: string | null) => void,
  cancelled: () => boolean = () => false,
) {
  const taken = new Set(existing);
  for (const [index, file] of files.entries()) {
    if (cancelled()) break;
    try {
      const chapter = parseNovelFile(file.name, await file.text());
      if (taken.has(chapter.number)) throw new Error(`O capítulo ${chapter.number} já existe ou está repetido.`);
      await save(chapter);
      taken.add(chapter.number);
      result(index, null);
    } catch (error) {
      result(index, error instanceof Error ? error.message : "Falha ao importar.");
    }
  }
}