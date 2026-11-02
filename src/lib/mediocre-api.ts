// Browser-safe helpers for the MediocreScan consultation panel.
// The token never appears here: only operation names, validation and display adapters.

export const MEDIOCRE_OPERATIONS = ["home", "recentes_ia", "recentes", "obra", "capitulos_usuario"] as const;
export type MediocreOperation = (typeof MEDIOCRE_OPERATIONS)[number];

export const MEDIOCRE_USER_ID = 156358;

export interface MediocreRequest {
  operation: MediocreOperation;
  obraId?: number;
}

export type MediocreResult =
  | { ok: true; status: number; json: string }
  | { ok: false; status: number; error: { code: string; message: string } };

/** Validates the body sent by the panel; rejects anything outside the allowlist. */
export function parseMediocreRequest(input: unknown): MediocreRequest {
  if (!input || typeof input !== "object") throw new Error("Requisição inválida.");
  const { operation, obraId } = input as Record<string, unknown>;
  if (typeof operation !== "string" || !(MEDIOCRE_OPERATIONS as readonly string[]).includes(operation)) {
    throw new Error("Operação não permitida.");
  }
  if (operation !== "obra") return { operation: operation as MediocreOperation };
  const id = typeof obraId === "number" ? obraId : typeof obraId === "string" && /^\d{1,9}$/.test(obraId) ? Number(obraId) : NaN;
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error("ID da obra inválido.");
  return { operation: "obra", obraId: id };
}

/** Maps an operation to a fixed path on back2.mediocrescan.com. Never accepts URLs. */
export function mediocrePath(req: MediocreRequest): string {
  switch (req.operation) {
    case "home": return "/obras/home";
    case "recentes_ia": return "/obras/atualizadas-recentes-ia";
    case "recentes": return "/obras/atualizadas-recentes";
    case "obra": return `/obras/${req.obraId}`;
    case "capitulos_usuario": return `/readings/user/${MEDIOCRE_USER_ID}/chapters`;
  }
}

export function mediocreErrorFor(status: number): { code: string; message: string } {
  if (status === 400) return { code: "BAD_REQUEST", message: "A requisição enviada é inválida." };
  if (status === 401) return { code: "UNAUTHORIZED", message: "O token da API é inválido ou expirou." };
  if (status === 403) return { code: "FORBIDDEN", message: "O acesso à API foi proibido." };
  if (status === 404) return { code: "NOT_FOUND", message: "O recurso solicitado não foi encontrado." };
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
    case "capitulos_usuario": return `capitulos-usuario-${MEDIOCRE_USER_ID}.json`;
  }
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
