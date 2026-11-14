#!/usr/bin/env node
// Better Mangá — cópia de emergência das obras no GitHub.
// Baixa do site todas as obras publicadas e seus capítulos publicados e grava em arquivos JSON
// (pasta passada como argumento). Quando o banco do site cai, o site lê esses arquivos e as obras
// continuam no ar em /emergencia.
//
// Só baixa os capítulos que ainda não estão na cópia (COMPLETA=true baixa tudo de novo) e apaga os
// que saíram do site. Variáveis: CODIGO_ENVIO (código do painel), SITE (opcional).
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync, existsSync, appendFileSync } from "node:fs";
import { join } from "node:path";

const SITE = (process.env.SITE || "https://bettermanga.net").trim().replace(/\/+$/, "");
const CODE = (process.env.CODIGO_ENVIO || "").trim();
const FULL = process.env.COMPLETA === "true";
const OUT = process.argv[2];
const BUDGET_MS = Math.min(Number(process.env.TEMPO_MAXIMO_MIN) || 40, 50) * 60_000;
const BATCH = 40;
const started = Date.now();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function output(key, value) {
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${key}=${value}\n`);
}

async function call(body, tries = 4) {
  for (let i = 1; ; i++) {
    try {
      const res = await fetch(`${SITE}/api/public/backup-export`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-ingest-token": CODE },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(60_000),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401 || res.status === 403) throw Object.assign(new Error(data.error || `HTTP ${res.status}`), { fatal: true });
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      return data;
    } catch (e) {
      if (e.fatal || i >= tries) throw e;
      await sleep(5_000 * i);
    }
  }
}

function writeIfChanged(file, value) {
  const text = JSON.stringify(value);
  if (existsSync(file) && readFileSync(file, "utf8") === text) return false;
  writeFileSync(file, text);
  return true;
}

async function main() {
  if (!OUT) throw new Error("Informe a pasta da cópia.");
  if (!CODE) { console.log("CODIGO_ENVIO ainda não foi salvo nos segredos do GitHub; nada a copiar."); output("mudou", "false"); return; }
  mkdirSync(join(OUT, "obras"), { recursive: true });
  mkdirSync(join(OUT, "capitulos"), { recursive: true });

  const works = [];
  for (let offset = 0; ; ) {
    const { rows, pageSize } = await call({ part: "works", offset });
    works.push(...rows);
    if (rows.length < pageSize) break;
    offset += rows.length;
  }
  const workIds = new Set(works.map((w) => w.id));
  console.log(`${works.length} obras publicadas.`);

  const bySeries = new Map();
  for (let offset = 0; ; ) {
    const { rows, pageSize } = await call({ part: "chapter-index", offset });
    for (const c of rows) {
      if (!workIds.has(c.series_id) || !UUID.test(c.id)) continue;
      if (!bySeries.has(c.series_id)) bySeries.set(c.series_id, []);
      bySeries.get(c.series_id).push({ id: c.id, number: c.number, title: c.title, created_at: c.created_at });
    }
    if (rows.length < pageSize) break;
    offset += rows.length;
  }

  let changed = 0;
  const allChapters = new Set();
  for (const w of works) {
    const chapters = (bySeries.get(w.id) ?? []).sort((a, b) => Number(a.number) - Number(b.number));
    chapters.forEach((c) => allChapters.add(c.id));
    if (writeIfChanged(join(OUT, "obras", `${w.id}.json`), { chapters })) changed++;
  }
  for (const f of readdirSync(join(OUT, "obras"))) {
    if (!workIds.has(f.replace(/\.json$/, ""))) { rmSync(join(OUT, "obras", f)); changed++; }
  }
  const saved = new Set(readdirSync(join(OUT, "capitulos")).map((f) => f.replace(/\.json$/, "")));
  for (const id of saved) {
    if (!allChapters.has(id)) { rmSync(join(OUT, "capitulos", `${id}.json`)); saved.delete(id); changed++; }
  }

  const todo = [...allChapters].filter((id) => FULL || !saved.has(id));
  console.log(`${allChapters.size} capítulos publicados; ${todo.length} para baixar.`);
  let fetched = 0;
  for (let i = 0; i < todo.length; i += BATCH) {
    if (Date.now() - started > BUDGET_MS) { console.log("Tempo da execução acabou; o resto fica para a próxima."); break; }
    const { rows } = await call({ part: "chapters", ids: todo.slice(i, i + BATCH) });
    for (const c of rows) {
      if (!UUID.test(c.id)) continue;
      const pages = Array.isArray(c.pages) ? c.pages.filter((u) => typeof u === "string") : [];
      if (writeIfChanged(join(OUT, "capitulos", `${c.id}.json`), { id: c.id, series_id: c.series_id, number: c.number, title: c.title, created_at: c.created_at, pages, content: c.content ?? null })) changed++;
      saved.add(c.id);
      fetched++;
    }
    await sleep(400);
  }

  const counts = new Map([...bySeries].map(([id, list]) => [id, list.length]));
  const indexWorks = works.map((w) => ({ ...w, chapter_count: counts.get(w.id) ?? 0 }));
  const prev = existsSync(join(OUT, "index.json")) ? JSON.parse(readFileSync(join(OUT, "index.json"), "utf8")) : null;
  const same = prev && JSON.stringify(prev.works) === JSON.stringify(indexWorks) && prev.chapters_saved === saved.size;
  if (!same || changed) {
    writeFileSync(join(OUT, "index.json"), JSON.stringify({ generated_at: new Date().toISOString(), works: indexWorks, chapters_saved: saved.size }));
    changed++;
  }
  console.log(`${fetched} capítulos baixados; ${saved.size} na cópia.`);
  output("mudou", changed ? "true" : "false");
}

main().catch((e) => { console.error(`Falha: ${e.message}`); process.exit(1); });
