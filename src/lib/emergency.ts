// Modo de emergência: quando o banco do site cai, as obras são lidas da cópia salva no GitHub.
// Módulo seguro para o navegador (sem segredos nem chamadas ao servidor).

export const EMERGENCY_PATH = "/emergencia";

/** Sem conta não há perfil infantil nem verificação de idade, então +16 e +18 ficam fora da emergência. */
export const EMERGENCY_HIDDEN_AGES = ["16", "18"] as const;

export function isEmergencyPath(path: string) {
  return path === EMERGENCY_PATH || path.startsWith(`${EMERGENCY_PATH}/`);
}

export function emergencyVisible(ageRating: string | null | undefined) {
  return !(EMERGENCY_HIDDEN_AGES as readonly string[]).includes(String(ageRating ?? "").trim());
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type BackupWork = {
  id: string; slug: string; title: string; alt_titles: string[] | null;
  cover_url: string | null; banner_url: string | null; synopsis: string | null;
  genres: string[] | null; age_rating: string | null; kind: string; status: string;
  rating: number; views: number; author: string | null; artist: string | null;
  chapter_count: number; latest_chapter_number: number | null; latest_chapter_at: string | null;
  updated_at: string;
};
export type BackupChapterRef = { id: string; number: number; title: string | null; created_at: string };
export type BackupChapter = BackupChapterRef & { series_id: string; pages: string[]; content: string | null };
export type BackupIndex = { generated_at: string; works: BackupWork[]; chapters_saved?: number };

export function visibleWorks(works: BackupWork[]) {
  return works.filter((w) => emergencyVisible(w.age_rating));
}

function fold(s: string) {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

export function searchBackupWorks(works: BackupWork[], term: string) {
  const q = fold(term.trim());
  if (!q) return works;
  return works.filter((w) => [w.title, ...(w.alt_titles ?? [])].some((t) => fold(t ?? "").includes(q)));
}

/** Capítulos em ordem crescente; devolve o anterior e o próximo do capítulo atual. */
export function chapterNeighbors(chapters: BackupChapterRef[], id: string) {
  const sorted = [...chapters].sort((a, b) => Number(a.number) - Number(b.number));
  const i = sorted.findIndex((c) => c.id === id);
  return { prev: i > 0 ? sorted[i - 1] : null, next: i >= 0 && i < sorted.length - 1 ? sorted[i + 1] : null };
}

export function pageList(raw: unknown): string[] {
  return Array.isArray(raw) ? raw.filter((u): u is string => typeof u === "string" && /^https?:\/\//i.test(u)) : [];
}
