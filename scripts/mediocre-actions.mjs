#!/usr/bin/env node
// Better Mangá — automação da MediocreScan pelo GitHub Actions.
// Roda nos servidores do GitHub (IP diferente do site, que a MediocreScan bloqueia): busca obras e
// capítulos na API e envia ao site pelo endpoint de envio (/api/public/mediocre-ingest).
//
// Ritmo (a API bloqueia envios múltiplos):
//   • uma obra por vez, até o fim: só passa para outra depois de enviar todos os capítulos;
//   • 5 capítulos por envio e espera de 1 min 12 s antes dos próximos 5;
//   • se a API travar por excesso de pedidos, pausa 1 minuto e continua do mesmo ponto;
//   • se o tempo da execução acabar no meio de uma obra, ela fica "em andamento" e a próxima
//     execução recomeça por ela.
// Ordem: obras pedidas à mão → fila de publicação → obras novas ainda não enviadas → capítulos
// novos das obras já publicadas.
//
// Variáveis (segredos do GitHub):
//   MEDIOCRE_TOKEN  chave da MediocreScan (vai só para a MediocreScan, nunca para o site)
//   CODIGO_ENVIO    código de automação gerado no painel (admin → MediocreScan)
//   SITE            endereço do site (opcional, padrão https://bettermanga.net)
//   OBRAS           IDs para puxar e publicar agora, separados por espaço (opcional)
import { appendFileSync } from "node:fs";

const SITE = (process.env.SITE || "https://bettermanga.net").trim().replace(/\/+$/, "");
const API_HOSTS = ["https://api.mediocretoons.net", "https://back2.mediocrescan.com"];
const CDN = "https://cdn.mediocrescan.com";
const TOKEN = (process.env.MEDIOCRE_TOKEN || "").trim().replace(/^Bearer\s+/i, "");
const CODE = (process.env.CODIGO_ENVIO || "").trim();
const MANUAL = [...new Set((process.env.OBRAS || "").split(/[\s,;]+/).filter((s) => /^\d{1,9}$/.test(s)).map(Number))];
const BUDGET_MS = Math.min(Number(process.env.TEMPO_MAXIMO_MIN) || 20, 50) * 60_000;

const CHAPTERS_PER_SEND = 5; // capítulos por envio
const WAIT_BETWEEN_SENDS_MS = 72_000; // 1 min 12 s antes dos próximos 5 capítulos
const LOCK_PAUSE_MS = 60_000; // pausa quando a API trava por excesso de pedidos
const MAX_PAUSES_IN_A_ROW = 5; // depois disso a execução para; a próxima tenta de novo
const API_GAP_MS = 60_000; // 1 pedido por minuto à API da MediocreScan
const CDN_GAP_MS = 1500; // páginas no CDN
const DISCOVER_LISTS = ["/obras/adicionados-recentes", "/obras/atualizadas-recentes"];
const DISCOVER_PAGES = Math.min(Number(process.env.PAGINAS_DESCOBERTA) || 2, 10);
const DISCOVER_PAGE_SIZE = { "/obras/adicionados-recentes": 20, "/obras/atualizadas-recentes": 30 };
const SYNC_WORKS = 10; // obras publicadas verificadas por execução

const started = Date.now();
const timeLeft = () => BUDGET_MS - (Date.now() - started);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const short = (path) => path.replace(/\?.*/, "");
let apiIdx = 0;
let lastPairAt = null; // início do último par enviado (vale entre obras)
let lastApiCall = 0;
let lastCdnCall = 0;
let pauses = 0;

/** Erro que para a execução inteira (token ou código inválido, travamento que não passa). */
class Fatal extends Error {}
/** O tempo da execução acabou; a obra atual fica para a próxima. */
class OutOfTime extends Error {}

if (!TOKEN || !CODE) {
  // Sem os segredos a automação fica desligada (o envio é feito pelo app Estúdio): sai sem erro, para
  // não gerar um aviso de falha a cada hora.
  console.log("::notice::Automação desligada: faltam os segredos MEDIOCRE_TOKEN e/ou CODIGO_ENVIO (GitHub → Settings → Secrets and variables → Actions). O app Estúdio continua enviando normalmente.");
  process.exit(0);
}

/** Pausa de 1 minuto quando a API trava; para a execução se travar demais seguidas vezes. */
async function lockPause(reason) {
  pauses++;
  if (pauses > MAX_PAUSES_IN_A_ROW) throw new Fatal(`A MediocreScan continua travada (${reason}) depois de ${MAX_PAUSES_IN_A_ROW} pausas. A próxima execução tenta de novo.`);
  if (timeLeft() < LOCK_PAUSE_MS + 30_000) throw new OutOfTime();
  console.log(`  ⏸ API travou (${reason}). Pausando 1 minuto… (${pauses}/${MAX_PAUSES_IN_A_ROW})`);
  await sleep(LOCK_PAUSE_MS);
}

async function mget(kind, path) {
  for (;;) {
    const wait = (kind === "api" ? lastApiCall + API_GAP_MS : lastCdnCall + CDN_GAP_MS) - Date.now();
    if (wait > 0) await sleep(wait);
    if (kind === "api") lastApiCall = Date.now(); else lastCdnCall = Date.now();
    const base = kind === "cdn" ? CDN : API_HOSTS[apiIdx];
    let r;
    try {
      r = await fetch(base + path, {
        headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0", ...(kind === "api" ? { Authorization: `Bearer ${TOKEN}` } : {}) },
        signal: AbortSignal.timeout(20_000),
      });
    } catch {
      if (kind === "api" && apiIdx < API_HOSTS.length - 1) { apiIdx++; continue; }
      throw new Error(`sem resposta da ${kind === "api" ? "API" : "CDN"} (${short(path)})`);
    }
    if (kind === "api" && r.status >= 520 && r.status <= 530 && apiIdx < API_HOSTS.length - 1) { apiIdx++; continue; }
    if (r.status === 401) throw new Fatal("A MediocreScan recusou o token (401). Gere um token novo e atualize o segredo MEDIOCRE_TOKEN.");
    // 429 e 403 = a API travou por pedidos demais (ou bloqueou o acesso): pausa 1 minuto e repete.
    if (r.status === 429) { await lockPause("429, pedidos demais"); continue; }
    if (r.status === 403) {
      const body = (await r.text().catch(() => "")).slice(0, 300);
      const isJson = (r.headers.get("content-type") || "").includes("json");
      await lockPause(/ip\s+bloquead/i.test(body) ? "403, IP bloqueado" : isJson ? "403, acesso recusado" : "403, Cloudflare");
      continue;
    }
    pauses = 0;
    if (r.status === 404) return null;
    if (!r.ok) throw new Error(`MediocreScan respondeu ${r.status} em ${short(path)}`);
    return r.json();
  }
}

async function send(body) {
  const r = await fetch(`${SITE}/api/public/mediocre-ingest`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-ingest-token": CODE },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(90_000),
  });
  const j = await r.json().catch(() => ({}));
  if (r.status === 401 || r.status === 403) throw new Fatal(`O site recusou o código de envio (${j.error || r.status}). Gere um código de automação novo no painel e atualize CODIGO_ENVIO.`);
  if (!r.ok) throw new Error(j.error || `o site respondeu ${r.status}`);
  return j;
}

const unwrap = (d) => (d && typeof d === "object" && !Array.isArray(d) && d.data && typeof d.data === "object" && !Array.isArray(d.data) ? d.data : d);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function contentPath(m) {
  const { obr_id: obra, cap_num: num, cap_uuid: uuid } = m || {};
  return Number.isSafeInteger(obra) && obra > 0 && typeof num === "number" && num >= 0 && typeof uuid === "string" && UUID.test(uuid)
    ? `/obras/${obra}/capitulos/${num}/${uuid}.json` : null;
}

/** Lista de obras de uma resposta da API (array direto ou dentro de data/obras/items/…). */
function listOf(data) {
  const d = unwrap(data);
  if (Array.isArray(d)) return d;
  if (d && typeof d === "object") for (const k of ["obras", "data", "items", "results", "lista"]) if (Array.isArray(d[k])) return d[k];
  return [];
}

/** Envia UMA obra inteira: 5 capítulos por vez, 1 min 12 s entre envios, até acabar ou o tempo acabar. */
async function pull(id, { publish }) {
  const work = await mget("api", `/obras/${id}`);
  if (!work) {
    await send({ action: "finish", obraId: id, added: 0, remaining: 0 });
    return { note: "não encontrada na MediocreScan", added: 0, skipped: 0, remaining: 0 };
  }
  const w = await send({ action: "work", obraId: id, work, publish });
  const pending = Array.isArray(w.pendingCapIds) ? w.pendingCapIds : [];
  const total = Number.isSafeInteger(w.remaining) ? w.remaining : pending.length;
  if (pending.length) console.log(`Obra ${id} (${w.slug}${w.created ? ", nova" : ""}): ${total} capítulo(s) para enviar.`);
  let added = 0, skipped = 0, tried = 0;
  let outOfTime = false;
  try {
    for (let i = 0; i < pending.length; i += CHAPTERS_PER_SEND) {
      // 1 minuto desde o último par, mesmo que tenha sido de outra obra.
      const waitMs = lastPairAt === null ? 0 : Math.max(0, WAIT_BETWEEN_SENDS_MS - (Date.now() - lastPairAt));
      if (waitMs > 0) {
        if (timeLeft() < waitMs + 60_000) throw new OutOfTime();
        await sleep(waitMs);
      }
      const chapters = [];
      const group = pending.slice(i, i + CHAPTERS_PER_SEND);
      for (const capId of group) {
        try {
          const meta = unwrap(await mget("api", `/capitulos/${capId}`));
          if (!meta || typeof meta !== "object") continue;
          const path = contentPath(meta);
          let content = null;
          if (path) {
            try { content = await mget("cdn", path); }
            catch (e) { if (e instanceof Fatal || e instanceof OutOfTime) throw e; content = null; }
          }
          chapters.push({ capId, meta, content });
        } catch (e) {
          if (e instanceof Fatal || e instanceof OutOfTime) throw e;
          console.warn(`  cap ${capId}: ${e.message}`);
        }
      }
      // Só conta como tentado depois de buscar o grupo inteiro: se travar no meio, o grupo é refeito.
      tried += group.length;
      skipped += group.length - chapters.length;
      if (chapters.length) {
        const r = await send({ action: "chapters", obraId: id, chapters });
        added += r.added || 0;
        skipped += r.skipped || 0;
      }
      lastPairAt = Date.now(); // próximo par só 1 minuto depois deste terminar
      console.log(`  ${Math.min(tried, total)}/${total} · +${added} enviados${skipped ? `, ${skipped} sem conteúdo` : ""}`);
    }
  } catch (e) {
    if (!(e instanceof OutOfTime)) throw e;
    outOfTime = true;
  }
  const remaining = Math.max(total - tried, 0);
  await send({ action: "finish", obraId: id, added, remaining });
  if (outOfTime) throw Object.assign(new OutOfTime(), { result: { slug: w.slug, added, skipped, remaining } });
  return { slug: w.slug, created: w.created, added, skipped, remaining };
}

/** Procura nas listas da API obras que ainda não estão no site nem na fila e as coloca na fila. */
async function discover() {
  const found = new Map();
  for (const list of DISCOVER_LISTS) {
    for (let page = 1; page <= DISCOVER_PAGES; page++) {
      if (timeLeft() < 3 * 60_000) return [];
      const qs = page > 1 ? `?offset=${(page - 1) * DISCOVER_PAGE_SIZE[list]}` : "";
      const data = await mget("api", list + qs);
      const rows = listOf(data);
      for (const o of rows) {
        const id = Number(o?.obr_id ?? o?.id);
        if (Number.isSafeInteger(id) && id > 0 && !found.has(id)) found.set(id, String(o?.obr_nome ?? o?.nome ?? "") || null);
      }
      if (!rows.length) break;
    }
  }
  const ids = [...found.keys()];
  const fresh = [];
  for (let i = 0; i < ids.length; i += 100) {
    const r = await send({ action: "check", ids: ids.slice(i, i + 100) });
    const known = new Set([...(r.imported || []), ...(r.queued || []), ...(r.failed || [])]);
    fresh.push(...ids.slice(i, i + 100).filter((id) => !known.has(id)));
  }
  const items = fresh.slice(0, 50).map((obraId) => ({ obraId, title: found.get(obraId) }));
  if (items.length) await send({ action: "enqueue", items });
  console.log(`Descoberta: ${ids.length} obras nas listas, ${fresh.length} ainda não enviadas${fresh.length > 50 ? " (50 colocadas na fila agora)" : ""}.`);
  return items.map((i) => i.obraId);
}

const rows = [];
let totalAdded = 0;
let unfinished = null;

/** Roda as obras em ordem, uma de cada vez; para tudo se o tempo acabar no meio de uma. */
async function runAll(ids, label, publish) {
  for (const id of ids) {
    if (timeLeft() < 2 * 60_000) throw new OutOfTime();
    try {
      const r = await pull(id, { publish });
      totalAdded += r.added;
      const detail = r.note ?? `+${r.added} capítulos${r.skipped ? `, ${r.skipped} sem conteúdo` : ""}`;
      if (r.note || r.added || r.skipped) console.log(`Obra ${id} (${label}): ${detail}`);
      rows.push(`| ${id} | ${label} | ${r.slug ?? "-"} | ${detail} |`);
    } catch (e) {
      if (e instanceof OutOfTime) {
        const r = e.result;
        if (r) { totalAdded += r.added; unfinished = id; rows.push(`| ${id} | ${label} | ${r.slug} | +${r.added}, faltam ${r.remaining} (continua na próxima) |`); }
        throw e;
      }
      if (e instanceof Fatal) throw e;
      console.error(`Obra ${id}: ${e.message}`);
      rows.push(`| ${id} | ${label} | - | erro: ${e.message} |`);
    }
  }
}

try {
  await runAll(MANUAL, "pedida", true);
  const plan = await send({ action: "plan", syncLimit: SYNC_WORKS });
  const queue = (plan.queue || []).filter((id) => !MANUAL.includes(id));
  console.log(`Fila: ${queue.length} obra(s).`);
  await runAll(queue, "fila", true);
  const fresh = await discover();
  await runAll(fresh, "nova", true);
  const sync = (plan.sync || []).filter((id) => !MANUAL.includes(id) && !fresh.includes(id));
  await runAll(sync, "atualização", false);
  console.log(`Concluído: ${totalAdded} capítulos enviados.`);
} catch (e) {
  if (e instanceof OutOfTime) {
    console.log(`Tempo desta execução acabou (${totalAdded} capítulos enviados). ${unfinished ? `A obra ${unfinished} ficou em andamento e é a primeira da próxima execução.` : "O restante fica para a próxima execução."}`);
  } else if (e instanceof Fatal) {
    console.error(`::error::${e.message}`);
    rows.push(`| - | - | - | parou: ${e.message} |`);
    process.exitCode = 1;
  } else throw e;
}

if (process.env.GITHUB_STEP_SUMMARY) {
  const md = [`### MediocreScan → Better Mangá`, ``, `${totalAdded} capítulos enviados.`, ``, `| Obra | Tipo | Slug | Resultado |`, `|---|---|---|---|`, ...rows, ``].join("\n");
  try { appendFileSync(process.env.GITHUB_STEP_SUMMARY, md); } catch { /* resumo é opcional */ }
}
