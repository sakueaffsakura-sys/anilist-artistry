// Browser-safe helpers for the MediocreScan consultation panel and public showcase.
// The token never appears here: only operation names, validation and display adapters.

export const MEDIOCRE_OPERATIONS = ["home", "recentes_ia", "recentes", "obra", "capitulo", "conteudo_capitulo", "thumbs_capitulos", "capitulos_usuario"] as const;
export type MediocreOperation = (typeof MEDIOCRE_OPERATIONS)[number];
/** Operations visitors may call; personal endpoints stay admin-only. */
export const PUBLIC_OPERATIONS: readonly MediocreOperation[] = ["home", "recentes_ia", "recentes", "obra", "capitulo", "conteudo_capitulo", "thumbs_capitulos"];

export const MEDIOCRE_USER_ID = 156358;

export interface MediocreRequest {
  operation: MediocreOperation;
  obraId?: number;
  capituloId?: number;
  /** Only for "recentes": API format filter and 1-based page (30 per page, sent as offset). */
  formato?: number;
  pagina?: number;
}

export const RECENTES_PAGE_SIZE = 30;

export type MediocreResult =
  | { ok: true; status: number; json: string }
  | { ok: false; status: number; error: { code: string; message: string } };

function positiveId(value: unknown, label: string): number {
  const id = typeof value === "number" ? value : typeof value === "string" && /^\d{1,9}$/.test(value) ? Number(value) : NaN;
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error(`${label} inválido.`);
  return id;
}

/** Validates the body sent by the browser; rejects anything outside the allowlist. */
export function parseMediocreRequest(input: unknown): MediocreRequest {
  if (!input || typeof input !== "object") throw new Error("Requisição inválida.");
  const { operation, obraId, capituloId, formato, pagina } = input as Record<string, unknown>;
  if (typeof operation !== "string" || !(MEDIOCRE_OPERATIONS as readonly string[]).includes(operation)) {
    throw new Error("Operação não permitida.");
  }
  const op = operation as MediocreOperation;
  if (op === "obra" || op === "capitulos_usuario" || op === "thumbs_capitulos") return { operation: op, obraId: positiveId(obraId, "ID da obra") };
  // Chapter content takes only the chapter id: the server reads uuid/number from the API metadata itself.
  if (op === "capitulo" || op === "conteudo_capitulo") return { operation: op, capituloId: positiveId(capituloId, "ID do capítulo") };
  if (op === "recentes") {
    const out: MediocreRequest = { operation: op };
    if (formato !== undefined && formato !== null) { const f = positiveId(formato, "Formato"); if (f > 50) throw new Error("Formato inválido."); out.formato = f; }
    if (pagina !== undefined && pagina !== null) { const pg = positiveId(pagina, "Página"); if (pg > 1000) throw new Error("Página inválida."); out.pagina = pg; }
    return out;
  }
  return { operation: op };
}

/** Reads the API's pagination block, when present. */
export function extractPagination(data: unknown): { page: number; totalPages: number; totalItems: number } | null {
  const p = data && typeof data === "object" ? (data as Record<string, unknown>)["pagination"] : null;
  if (!p || typeof p !== "object") return null;
  const o = p as Record<string, unknown>;
  const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
  return { page: n(o["currentPage"]) || 1, totalPages: n(o["totalPages"]) || 1, totalItems: n(o["totalItems"]) };
}

/** Maps an operation to a fixed path on back2.mediocrescan.com. Never accepts URLs. */
export function mediocrePath(req: MediocreRequest): string {
  switch (req.operation) {
    case "home": return "/obras/home?formato=1"; // API requires a format id; 1 is the main catalog
    case "recentes_ia": return "/obras/atualizadas-recentes-ia";
    case "recentes": {
      const qs = new URLSearchParams();
      if (req.formato) qs.set("formato", String(req.formato));
      if (req.pagina && req.pagina > 1) qs.set("offset", String((req.pagina - 1) * RECENTES_PAGE_SIZE));
      const q = qs.toString();
      return "/obras/atualizadas-recentes" + (q ? `?${q}` : "");
    }
    case "obra": return `/obras/${req.obraId}`;
    case "capitulo": case "conteudo_capitulo": return `/capitulos/${req.capituloId}`;
    case "thumbs_capitulos": return `/obras/${req.obraId}/thumbs-capitulos.json`; // served by the CDN host
    case "capitulos_usuario": return `/readings/user/${MEDIOCRE_USER_ID}/chapters?obr_id=${req.obraId}`;
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Builds the CDN content path only from confirmed chapter metadata; null when unusable. */
export function chapterContentPath(meta: unknown): string | null {
  if (!meta || typeof meta !== "object") return null;
  const m = meta as Record<string, unknown>;
  const obr = m["obr_id"], num = m["cap_num"], uuid = m["cap_uuid"];
  if (typeof obr !== "number" || !Number.isSafeInteger(obr) || obr <= 0) return null;
  if (typeof num !== "number" || !Number.isFinite(num) || num < 0) return null;
  if (typeof uuid !== "string" || !UUID.test(uuid)) return null;
  return `/obras/${obr}/capitulos/${num}/${uuid}.json`;
}

export function mediocreErrorFor(status: number): { code: string; message: string } {
  if (status === 400) return { code: "BAD_REQUEST", message: "A requisição enviada é inválida." };
  if (status === 401) return { code: "UNAUTHORIZED", message: "O token da API está inválido ou expirou." };
  if (status === 403) return { code: "FORBIDDEN", message: "O acesso à API foi negado." };
  if (status === 404) return { code: "NOT_FOUND", message: "O recurso não foi encontrado." };
  if (status === 429) return { code: "RATE_LIMITED", message: "O limite de requisições foi atingido. Tente novamente mais tarde." };
  if (status >= 500) return { code: "UPSTREAM_ERROR", message: "A API apresentou um erro interno." };
  return { code: "NETWORK", message: "Não foi possível conectar à API." };
}

export function mediocreFileName(req: MediocreRequest): string {
  switch (req.operation) {
    case "home": return "obras-home.json";
    case "recentes": return "obras-recentes.json";
    case "recentes_ia": return "obras-recentes-ia.json";
    case "obra": return `obra-${req.obraId}.json`;
    case "capitulo": return `capitulo-${req.capituloId}.json`;
    case "conteudo_capitulo": return `conteudo-capitulo-${req.capituloId}.json`;
    case "thumbs_capitulos": return `thumbs-capitulos-${req.obraId}.json`;
    case "capitulos_usuario": return `capitulos-usuario-${MEDIOCRE_USER_ID}-obra-${req.obraId}.json`;
  }
}

/** Normalized chapter content blocks, in original order. */
export type ContentBlock = { type: "image"; url: string } | { type: "text"; text: string } | { type: "unknown"; raw: unknown };

const IMG_KEYS = ["imagem", "image", "url", "src", "image_url"];
const TXT_KEYS = ["texto", "text", "content", "conteudo", "cap_conteudo_texto"];
const CDN = "https://cdn.mediocrescan.com/";

function imageUrl(v: unknown): string | null {
  if (typeof v !== "string" || !v || v.includes("..")) return null;
  try {
    const u = new URL(v.replace(/^\/+/, ""), CDN);
    return u.protocol === "https:" && !u.username && !u.password ? u.toString() : null;
  } catch { return null; }
}

/** Accepts arrays, {paginas|pages|images|blocks|data}, plain text or mixed blocks. */
export function normalizeChapterContent(data: unknown): ContentBlock[] {
  if (typeof data === "string") return data.trim() ? [{ type: "text", text: data }] : [];
  let list: unknown = data;
  if (data && typeof data === "object" && !Array.isArray(data)) {
    const o = data as Record<string, unknown>;
    list = o["blocks"] ?? o["paginas"] ?? o["pages"] ?? o["images"] ?? o["data"];
    if (list === undefined) {
      const t = TXT_KEYS.map((k) => o[k]).find((v) => typeof v === "string" && v.trim());
      return typeof t === "string" ? [{ type: "text", text: t }] : [];
    }
  }
  if (!Array.isArray(list)) return [];
  const rows = list.map((item, index) => {
    const order = item && typeof item === "object" ? Number((item as Record<string, unknown>)["ordem"] ?? (item as Record<string, unknown>)["pagina"] ?? (item as Record<string, unknown>)["number"] ?? index) : index;
    return { order: Number.isFinite(order) ? order : index, index, item };
  }).sort((a, b) => a.order - b.order || a.index - b.index);
  return rows.map(({ item }): ContentBlock => {
    if (typeof item === "string") { const u = /\.(webp|jpe?g|png|gif|avif)(\?|$)/i.test(item) ? imageUrl(item) : null; return u ? { type: "image", url: u } : { type: "text", text: item }; }
    if (!item || typeof item !== "object") return { type: "unknown", raw: item };
    const o = item as Record<string, unknown>;
    const kind = typeof o["type"] === "string" ? o["type"] : "";
    if (kind !== "text") for (const k of IMG_KEYS) { const u = imageUrl(o[k]); if (u && (kind === "image" || k !== "content")) return { type: "image", url: u }; }
    for (const k of TXT_KEYS) { const t = o[k]; if (typeof t === "string" && t.trim()) return { type: "text", text: t }; }
    return { type: "unknown", raw: item };
  });
}

/** Normalize a title for exact matching: case, Latin accents, punctuation spacing. */
export function titleKey(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

type Row = Record<string, unknown>;
const isRow = (v: unknown): v is Row => Boolean(v) && typeof v === "object" && !Array.isArray(v);

/**
 * Detects the list inside an unknown response: a direct array, or the first array found
 * under common keys (data, obras, chapters, capitulos, items, results), one level deep.
 * Returns null when no list of objects can be identified (diagnostic mode shows raw JSON).
 */
export function extractList(data: unknown): Row[] | null {
  if (Array.isArray(data)) return data.filter(isRow);
  if (!isRow(data)) return null;
  for (const key of ["data", "obras", "chapters", "capitulos", "items", "results", "lista"]) {
    const value = data[key];
    if (Array.isArray(value)) return value.filter(isRow);
    if (isRow(value)) { const inner = extractList(value); if (inner) return inner; }
  }
  // Home payloads may group shelves: merge every array of objects carrying obr_id.
  const merged: Row[] = [];
  for (const value of Object.values(data)) {
    if (Array.isArray(value)) merged.push(...value.filter((x): x is Row => isRow(x) && "obr_id" in x));
  }
  return merged.length ? merged : null;
}

/** Unwraps `{ data: {...} }` style responses to the work object itself. */
export function extractWork(data: unknown): Row | null {
  if (!isRow(data)) return null;
  if ("obr_id" in data || "obr_nome" in data) return data;
  for (const key of ["data", "obra"]) if (isRow(data[key])) return extractWork(data[key]);
  return null;
}

export function text(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "string" || typeof v === "number") return String(v);
  if (typeof v === "boolean") return v ? "Sim" : "Não";
  return null;
}

/** Only flags IA when the payload explicitly carries an IA marker field. */
export function hasIaFlag(row: Row): boolean {
  return Object.entries(row).some(([k, v]) => /(^|_)ia($|_)/i.test(k) && (v === true || v === 1 || v === "1"));
}

export function tagNames(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((t) => (typeof t === "string" ? t : isRow(t) ? text(t["nome"] ?? t["tag_nome"] ?? t["name"]) : null)).filter((x): x is string => Boolean(x));
}

const MEDIA = "https://api.mediocretoons.net/media/obras";
/** List endpoints use short keys (id, nome, imagem as bare file name); detail uses obr_*. */
export function pick(row: Row, ...keys: string[]): unknown {
  for (const k of keys) if (row[k] !== undefined && row[k] !== null && row[k] !== "") return row[k];
  return null;
}
export function workImage(row: Row, kind: "capa" | "banner" = "capa"): string | null {
  const id = text(pick(row, "obr_id", "id"));
  const v = text(kind === "capa" ? pick(row, "obr_imagem", "imagem") : pick(row, "obr_banner", "banner"));
  if (!v) return null;
  if (/^https:\/\//.test(v)) return v;
  if (!id || !/^[\w.-]+$/.test(v)) return null;
  return `${MEDIA}/${id}/${kind}?f=${encodeURIComponent(v)}`;
}
