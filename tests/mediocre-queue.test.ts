import { afterEach, expect, spyOn, test } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../src/integrations/supabase/types";
import { processQueueTick, QUEUE_CHAPTER_DELAY_MS, QUEUE_MAX_ATTEMPTS } from "../src/lib/mediocre-queue.server";
import { importMediocreWork, syncMediocreChapters } from "../src/lib/mediocre-import.server";
import * as api from "../src/lib/mediocre-api.server";

type Row = Record<string, any>;
const now = Date.parse("2026-11-07T01:51:00Z");

function fixture(numbers = [1, 2], failure = "empty", tags?: unknown[]) {
  const tables: Record<string, Row[]> = {
    mediocre_settings: [{ id: 1, blocked_until: null }],
    mediocre_queue: [1, 2].map((id) => ({ id, obra_id: id, status: "waiting", created_at: id, next_run_at: new Date(now).toISOString(), created_by: null, chapters_added: 0, attempts: 0 })),
    series: [1, 2].map((id) => ({ id: `series-${id}`, source_mediocre_id: id, slug: `obra-${id}`, kind: "Comic", cover_url: "existing", banner_url: "existing" })),
    chapters: [],
  };
  const admin = { from(table: string) {
    const filters: ((r: Row) => boolean)[] = [];
    let change: Row | undefined, insert: Row | undefined, head = false, limit = Infinity, order = "";
    const result = () => {
      let data = tables[table].filter((r) => filters.every((f) => f(r)));
      if (order) data = data.slice().sort((a, b) => a[order] < b[order] ? -1 : 1);
      data = data.slice(0, limit);
      if (insert) {
        if (failure === "insert" && table === "chapters" && insert.series_id === "series-1") return { data: null, error: { message: "insert refused" } };
        tables[table].push(insert);
        data = [insert];
      }
      if (change) for (const r of data) Object.assign(r, change);
      return { data: head ? null : data, count: data.length, error: null };
    };
    const query = {
      select(_columns?: string, opts?: { head?: boolean }) { head = opts?.head ?? false; return query; },
      eq(key: string, value: unknown) { filters.push((r) => r[key] === value); return query; },
      // Só o formato usado no importador: "coluna.is.null,coluna.eq.valor".
      or(expr: string) { const parts = expr.split(",").map((p) => p.split(".")); filters.push((r) => parts.some(([k, op, v]) => (op === "is" ? r[k!] == null : String(r[k!]) === v))); return query; },
      in(key: string, values: unknown[]) { filters.push((r) => values.includes(r[key])); return query; },
      order(key: string) { order = key; return query; },
      limit(n: number) { limit = n; return query; },
      update(value: Row) { change = value; return query; },
      insert(value: Row) { insert = value; return query; },
      async maybeSingle() { const r = result(); return { ...r, data: r.data?.[0] ?? null }; },
      async single() { const r = result(); return { ...r, data: r.data?.[0] ?? null }; },
      then(resolve: (r: ReturnType<typeof result>) => unknown) { return Promise.resolve(result()).then(resolve); },
    };
    return query;
  } } as unknown as SupabaseClient<Database>;
  const get = spyOn(api, "mediocreGet").mockImplementation(async (_host, path) => {
    let data: unknown;
    if (path.startsWith("/obras/")) {
      const id = Number(path.split("/").pop());
      data = { obr_nome: `Obra ${id}`, ...(tags ? { tags } : {}), capitulos: (id === 1 ? numbers : [1]).map((n, i) => ({ cap_id: id * 100 + i, cap_num: n })) };
    } else {
      const id = Number(path.split("/").pop());
      const bad = id === 100;
      if (bad && (failure === "api" || failure === "blocked")) return { ok: false, status: 403, error: { code: failure === "blocked" ? "IP_BLOCKED" : "FORBIDDEN", message: failure === "blocked" ? "IP bloqueado" : "Acesso recusado" } };
      data = { cap_num: id < 200 ? numbers[id - 100] : 1, cap_conteudo_texto: bad && failure === "empty" ? "" : "Conteúdo" };
    }
    return { ok: true, status: 200, data, raw: JSON.stringify(data) };
  });
  return { admin, tables, get };
}

afterEach(() => { spyOn(api, "mediocreGet").mockRestore(); });

test("cada capítulo da fila espera 1 minuto", () => {
  expect(QUEUE_CHAPTER_DELAY_MS).toBe(60_000);
});

for (const failure of ["empty", "api", "invalid", "insert"]) {
  test(`capítulo ${failure}: falha após três tentativas e libera a próxima obra`, async () => {
    const { admin, tables } = fixture(failure === "invalid" ? [-1, 2] : [1, 2], failure);
    expect(QUEUE_MAX_ATTEMPTS).toBe(3);
    for (let attempt = 1; attempt <= 3; attempt++) {
      expect((await processQueueTick(admin, now + (attempt - 1) * 60_000)).state).toBe("error");
      expect(tables.mediocre_queue[0].attempts).toBe(attempt);
      expect(tables.mediocre_queue[0].status).toBe(attempt === 3 ? "error" : "running");
    }
    expect(await processQueueTick(admin, now + 3 * 60_000)).toMatchObject({ state: "chapter", obraId: 2, added: 1, remaining: 0, done: true });
    expect(tables.chapters).toHaveLength(1);
    expect(tables.chapters[0].series_id).toBe("series-2");
  });
}

test("último capítulo indisponível continua pendente, nunca concluído", async () => {
  const { admin, tables } = fixture([1]);
  expect(await importMediocreWork(admin, 1, { createdBy: null, chapterLimit: 1 })).toMatchObject({ added: 0, skipped: 1, remaining: 1 });
  expect((await processQueueTick(admin, now)).state).toBe("error");
  expect(tables.mediocre_queue[0].status).toBe("running");
});

test("bloqueio de IP pausa sem consumir tentativas", async () => {
  const { admin, tables } = fixture([1, 2], "blocked");
  expect((await processQueueTick(admin, now)).state).toBe("blocked");
  expect(tables.mediocre_queue[0].attempts).toBe(0);
  expect(tables.mediocre_queue[0].status).toBe("running");
  expect(tables.mediocre_queue[1].status).toBe("waiting");
});

test("sincronização fica pausada enquanto a fila ainda tem obras", async () => {
  const { admin, get } = fixture();
  expect(await syncMediocreChapters(admin)).toEqual({ checked: 0, added: 0 });
  expect(get).not.toHaveBeenCalled();
});

test("+18 da fonte fixa idade 18 em obra já importada, menos quando o admin escolheu", async () => {
  const { admin, tables } = fixture([1], "empty", [{ tag_nome: "+18" }, { tag_nome: "Romance" }]);
  Object.assign(tables.series[0]!, { age_rating: "14", age_rating_auto: true });
  Object.assign(tables.series[1]!, { age_rating: "16", age_rating_auto: false });
  await importMediocreWork(admin, 1, { createdBy: null, chapterLimit: 0 });
  await importMediocreWork(admin, 2, { createdBy: null, chapterLimit: 0 });
  expect(tables.series[0]).toMatchObject({ age_rating: "18", age_rating_auto: false });
  expect(tables.series[1]).toMatchObject({ age_rating: "16", age_rating_auto: false });
});

test("obra nova +18 entra com idade 18 e sem a etiqueta nos gêneros", async () => {
  const { admin, tables } = fixture([1], "empty", [{ tag_nome: "+18" }, { tag_nome: "Romance" }]);
  tables.series = [];
  expect(await importMediocreWork(admin, 1, { createdBy: null, chapterLimit: 0 })).toMatchObject({ created: true });
  expect(tables.series[0]).toMatchObject({ age_rating: "18", genres: ["Romance"], source_mediocre_id: 1 });
});

test("obra nova sem +18 deixa a idade para a classificação automática do banco", async () => {
  const { admin, tables } = fixture([1], "empty", [{ tag_nome: "Ação" }]);
  tables.series = [];
  await importMediocreWork(admin, 1, { createdBy: null, chapterLimit: 0 });
  expect(tables.series[0]!.age_rating).toBeUndefined();
});
