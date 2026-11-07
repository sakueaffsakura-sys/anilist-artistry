#!/usr/bin/env node
// Better Mangá — puxa obras da MediocreScan pelo SEU aparelho e envia ao site como rascunho.
// Uso:  MEDIOCRE_TOKEN=... CODIGO_ENVIO=... node mediocre-puxar.mjs 123 456
//       MEDIOCRE_TOKEN=... CODIGO_ENVIO=... node mediocre-puxar.mjs --buscar "nome da obra"
// A chave da MediocreScan nunca é enviada ao Better Mangá.
const SITE = process.env.SITE || "https://bettermanga.net";
const API = "https://api.mediocretoons.net";
const CDN = "https://cdn.mediocrescan.com";
const TOKEN = process.env.MEDIOCRE_TOKEN;
const CODE = process.env.CODIGO_ENVIO;
if (!TOKEN || !CODE) { console.error("Defina MEDIOCRE_TOKEN e CODIGO_ENVIO."); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function mget(url) {
  await sleep(1500);
  const r = await fetch(url, { headers: { Authorization: TOKEN.startsWith("Bearer ") ? TOKEN : `Bearer ${TOKEN}`, Accept: "application/json" } });
  if (!r.ok) throw new Error(`MediocreScan respondeu ${r.status} em ${url.replace(/\?.*/, "")}`);
  return r.json();
}
async function send(body) {
  const r = await fetch(`${SITE}/api/public/mediocre-ingest`, { method: "POST", headers: { "content-type": "application/json", "x-ingest-token": CODE }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `Site respondeu ${r.status}`);
  return j;
}
const unwrap = (d) => (d && typeof d === "object" && !Array.isArray(d) && d.data && typeof d.data === "object" ? d.data : d);
function contentPath(m) {
  const p = m.cap_caminho || m.cap_conteudo || m.cap_path;
  if (typeof p === "string" && p.trim()) return p.startsWith("/") ? p : `/${p}`;
  const obra = m.obr_id ?? m.obra?.obr_id, num = m.cap_num;
  return obra != null && num != null ? `/obras/${obra}/capitulos/${num}/conteudo.json` : null;
}

async function pull(id) {
  const work = await mget(`${API}/obras/${id}`);
  const w = await send({ action: "work", obraId: id, work });
  console.log(`Obra ${id} → ${w.slug} (${w.created ? "nova, rascunho" : "já existia"}); faltam ${w.pendingCapIds.length} capítulos`);
  const ids = w.pendingCapIds;
  for (let i = 0; i < ids.length; i += 5) {
    const chapters = [];
    for (const capId of ids.slice(i, i + 5)) {
      try {
        const meta = await mget(`${API}/capitulos/${capId}`);
        const path = contentPath(unwrap(meta));
        let content = null;
        if (path) { try { content = await mget(`${CDN}${path}`); } catch { content = null; } }
        chapters.push({ capId, meta, content });
      } catch (e) { console.warn(`  cap ${capId}: ${e.message}`); }
    }
    if (!chapters.length) continue;
    const r = await send({ action: "chapters", obraId: id, chapters });
    console.log(`  +${r.added} capítulos${r.skipped ? `, ${r.skipped} sem conteúdo` : ""}`);
  }
}

const args = process.argv.slice(2);
let ids = args.filter((a) => /^\d+$/.test(a)).map(Number);
const bi = args.indexOf("--buscar");
if (bi >= 0 && args[bi + 1]) {
  const res = unwrap(await mget(`${API}/obras/buscar?string=${encodeURIComponent(args[bi + 1])}`));
  const list = Array.isArray(res) ? res : res.obras || res.data || [];
  list.slice(0, 10).forEach((o) => console.log(`  ${o.obr_id}  ${o.obr_nome}`));
  if (!ids.length) { console.log("Rode de novo com o ID desejado."); process.exit(0); }
}
if (!ids.length) { console.error("Informe IDs das obras ou --buscar \"nome\"."); process.exit(1); }
for (const id of ids) { try { await pull(id); } catch (e) { console.error(`Obra ${id}: ${e.message}`); } }
console.log("Concluído. As obras novas ficam como rascunho até você publicar no painel.");
