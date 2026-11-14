// Lê a cópia de emergência salva no GitHub (branch copia-obras) e diz se o banco está fora do ar.
import { UUID_RE, pageList, type BackupChapter, type BackupChapterRef, type BackupIndex } from "./emergency";

const INDEX_TTL_MS = 5 * 60_000;
const ITEM_TTL_MS = 30 * 60_000;
const MAX_ITEMS = 300;
const DOWN_TTL_MS = 15_000;

let indexCache: { at: number; value: BackupIndex } | null = null;
const itemCache = new Map<string, { at: number; value: unknown }>();
let lastDownAt = 0;

/** true quando o banco responde; uma falha é lembrada por alguns segundos para não insistir a cada pedido. */
export async function isDatabaseUp(): Promise<boolean> {
  if (Date.now() - lastDownAt < DOWN_TTL_MS) return false;
  try {
    const { readMaintenance } = await import("./maintenance.server");
    await readMaintenance(false);
    return true;
  } catch {
    lastDownAt = Date.now();
    return false;
  }
}

export function backupConfigured() {
  return Boolean(process.env["COPIA_OBRAS_URL"]?.trim());
}

async function getJson<T>(path: string): Promise<T | null> {
  const base = (process.env["COPIA_OBRAS_URL"] ?? "").trim().replace(/\/+$/, "");
  if (!/^https:\/\//i.test(base)) return null;
  const token = (process.env["COPIA_OBRAS_TOKEN"] ?? "").trim();
  const headers: Record<string, string> = { Accept: "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`${base}/${path}`, { headers, signal: AbortSignal.timeout(15_000) });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Cópia indisponível (${res.status}).`);
  return (await res.json()) as T;
}

export async function readBackupIndex(): Promise<BackupIndex | null> {
  if (indexCache && Date.now() - indexCache.at < INDEX_TTL_MS) return indexCache.value;
  try {
    const value = await getJson<BackupIndex>("index.json");
    if (!value || !Array.isArray(value.works)) return indexCache?.value ?? null;
    indexCache = { at: Date.now(), value };
    return value;
  } catch {
    return indexCache?.value ?? null; // última cópia lida continua valendo se o GitHub falhar
  }
}

async function cached<T>(key: string, path: string): Promise<T | null> {
  const hit = itemCache.get(key);
  if (hit && Date.now() - hit.at < ITEM_TTL_MS) return hit.value as T;
  try {
    const value = await getJson<T>(path);
    if (value === null) return null;
    if (itemCache.size >= MAX_ITEMS) itemCache.delete(itemCache.keys().next().value as string);
    itemCache.set(key, { at: Date.now(), value });
    return value;
  } catch {
    return (hit?.value as T) ?? null;
  }
}

export async function readBackupWorkChapters(seriesId: string): Promise<BackupChapterRef[]> {
  if (!UUID_RE.test(seriesId)) return [];
  const data = await cached<{ chapters?: BackupChapterRef[] }>(`w:${seriesId}`, `obras/${seriesId}.json`);
  return Array.isArray(data?.chapters) ? data.chapters : [];
}

export async function readBackupChapter(id: string): Promise<BackupChapter | null> {
  if (!UUID_RE.test(id)) return null;
  const data = await cached<BackupChapter>(`c:${id}`, `capitulos/${id}.json`);
  if (!data || !UUID_RE.test(String(data.series_id))) return null;
  return { ...data, pages: pageList(data.pages), content: typeof data.content === "string" ? data.content : null };
}
