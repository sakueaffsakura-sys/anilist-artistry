/** Browser-safe numbering shared by image and text chapter imports. */
export function parseChapterFilename(name: string) {
  const stem = name.replace(/\.(txt|html?)$/i, "").trim();
  const match = stem.match(/^(?:cap(?:[íi]tulo|[.]?)?|chapter)?\s*(\d+(?:[.,-]\d+)?)(?:\s*[-–—_]\s*(.+))?$/i);
  if (!match?.[1]) return null;
  return {
    number: Number(match[1].replace(/[,-]/, ".")),
    title: match[2]?.trim() || null,
  };
}

export function compareChapterFilenames(a: { name: string }, b: { name: string }) {
  const first = parseChapterFilename(a.name);
  const second = parseChapterFilename(b.name);
  if (first && second && first.number !== second.number) return first.number - second.number;
  return a.name.localeCompare(b.name, "pt-BR", { numeric: true });
}