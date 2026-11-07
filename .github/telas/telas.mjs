// Fotografa as telas do site (celular e computador) para conferir o visual sem precisar de um aparelho.
// Roda no GitHub Actions contra o site compilado localmente, com os dados públicos reais do banco.
// As páginas que pedem conta usam um login de teste só no navegador: os pedidos ao banco vão como
// visitante (sem token) e nada é gravado (escritas são respondidas aqui mesmo, sem ir ao banco).
// O papel de administrador também é simulado só no navegador, para fotografar o painel.
// Coleção e histórico do leitor de teste são montados com obras públicas reais (o banco não devolve
// dados de conta para visitantes).
import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW_PATH || "playwright");

const BASE = process.env.BASE_URL || "http://127.0.0.1:3000";
const SUPA = "https://olaqyjeicgopgolgidig.supabase.co";
const OUT = "telas";
const USER = "00000000-0000-4000-8000-0000000000aa";
const WORK = process.env.OBRA || "lookism";
const WORK_ID = process.env.OBRA_ID || "9beba6cf-b796-4d13-98ff-d6413267824f";
const LIST_ID = process.env.LISTA_ID || "03317d53-c5d3-4aaa-b782-308371305405";
const PROFILE = process.env.PERFIL || "admin";
const CHAPTER = process.env.CAPITULO || "1";
const GROUPS = new Set((process.env.GRUPOS || "leitura,conta,admin").split(",").map((g) => g.trim()).filter(Boolean));
mkdirSync(OUT, { recursive: true });

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const exp = Math.floor(Date.now() / 1000) + 3600;
const user = { id: USER, aud: "authenticated", role: "authenticated", email: "teste@bettermanga.net", app_metadata: { provider: "email" }, user_metadata: { username: "leitor-teste" }, created_at: "2026-01-01T00:00:00Z" };
const jwt = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: USER, role: "authenticated", aud: "authenticated", exp, email: user.email })}.teste`;
const session = { access_token: jwt, refresh_token: "teste", expires_in: 3600, expires_at: exp, token_type: "bearer", user };

/** Tira o "series!inner(...)" do select e os parâmetros "series.x" para buscar as obras direto. */
function innerSeriesQuery(url) {
  const u = new URL(url);
  const select = u.searchParams.get("select") || "";
  const start = select.indexOf("series!inner(");
  if (start < 0) return null;
  let depth = 0;
  let end = -1;
  for (let i = start + "series!inner".length; i < select.length; i++) {
    if (select[i] === "(") depth++;
    else if (select[i] === ")" && --depth === 0) { end = i; break; }
  }
  if (end < 0) return null;
  const q = new URL(`${SUPA}/rest/v1/series`);
  q.searchParams.set("select", select.slice(start + "series!inner(".length, end));
  for (const [k, v] of u.searchParams) if (k.startsWith("series.")) q.searchParams.set(k.slice("series.".length), v);
  q.searchParams.set("published", "eq.true");
  q.searchParams.set("order", "updated_at.desc");
  q.searchParams.set("limit", "8");
  return q;
}

/**
 * Coleção e histórico do leitor de teste, feitos com obras públicas. Só para listas da conta de teste
 * que trazem a obra junto (series!inner); a posição de leitura de uma obra específica fica vazia.
 */
async function demoRows(route, url, headers) {
  const u = new URL(url);
  const table = u.pathname.split("/").pop();
  if (table !== "favorites" && table !== "reading_history") return null;
  if (u.searchParams.get("user_id") !== `eq.${USER}`) return null;
  const q = innerSeriesQuery(url);
  if (!q) return null;
  q.searchParams.set("select", `${q.searchParams.get("select")},demo_ch:chapters(id,number)`);
  q.searchParams.set("demo_ch.order", "number.asc");
  q.searchParams.set("demo_ch.limit", "1");
  const res = await route.fetch({ url: q.toString(), headers });
  const rows = await res.json();
  if (!Array.isArray(rows)) return null;
  return rows.map((row, i) => {
    const { demo_ch, ...series } = row;
    const ch = demo_ch?.[0] ?? null;
    const when = new Date(Date.now() - i * 5400000).toISOString();
    return { series_id: series.id, created_at: when, updated_at: when, progress: [0.35, 0.8, 0.1, 1, 0.5, 0.65, 0.2, 0.9][i % 8], chapter_id: ch?.id ?? null, chapters: ch, series };
  });
}

const log = [];
async function setup(context, { signedIn, admin }) {
  await context.addInitScript(({ s, id, on }) => {
    try {
      if (on) {
        localStorage.setItem("sb-olaqyjeicgopgolgidig-auth-token", JSON.stringify(s));
        localStorage.setItem(`bm-profile-chosen:${id}`, "1");
      }
      localStorage.setItem("bm-cookie-consent", "1");
    } catch { /* sem armazenamento */ }
  }, { s: session, id: USER, on: signedIn });
  await context.route(`${SUPA}/**`, async (route) => {
    const req = route.request();
    const url = req.url();
    if (url.includes("/auth/v1/user")) return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(user) });
    if (url.includes("/auth/v1/token")) return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(session) });
    if (url.includes("/auth/v1/")) return route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
    const method = req.method();
    if (admin && method === "GET" && url.includes("/rest/v1/user_roles")) {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([{ role: "admin" }]) });
    }
    // Escritas não saem daqui; funções só de leitura (rankings, get_*) vão ao banco normalmente.
    const readOnlyRpc = /\/rest\/v1\/rpc\/(get_|obra_ranking|xp_ranking)/.test(url);
    if (method !== "GET" && method !== "HEAD" && !readOnlyRpc) {
      return route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
    }
    const headers = { ...req.headers() };
    delete headers.authorization;
    try {
      if (signedIn && method === "GET") {
        const demo = await demoRows(route, url, headers).catch((e) => { log.push(`demo falhou ${url.slice(0, 120)}: ${e.message}`); return null; });
        if (demo) return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(demo) });
      }
      const res = await route.fetch({ headers });
      return route.fulfill({ response: res });
    } catch (e) {
      log.push(`falha ao buscar ${url.slice(0, 200)}: ${e.message.split("\n")[0]}`);
      return route.abort();
    }
  });
}

async function settle(page) {
  await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});
  // Espera as imagens visíveis terminarem.
  await page.evaluate(async () => {
    const imgs = [...document.images].filter((i) => i.getBoundingClientRect().top < innerHeight * 1.5);
    await Promise.race([Promise.all(imgs.map((i) => (i.complete ? null : new Promise((r) => { i.onload = i.onerror = r; })))), new Promise((r) => setTimeout(r, 6000))]);
  });
  await page.waitForTimeout(900);
}

async function shoot(page, name, { steps = 1 } = {}) {
  for (let i = 0; i < steps; i++) {
    if (i > 0) {
      const moved = await page.evaluate(() => { const before = scrollY; scrollBy(0, innerHeight * 0.9); return scrollY !== before; });
      if (!moved) break;
      await settle(page);
    }
    await page.screenshot({ path: `${OUT}/${name}-${String(i + 1).padStart(2, "0")}.jpg`, type: "jpeg", quality: 72 });
  }
}

const VIEWS = {
  celular: { viewport: { width: 360, height: 780 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  computador: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
};

const s = (celular, computador = 1) => ({ celular, computador });
const PAGES = [
  // leitura
  { group: "leitura", name: "inicio", path: "/", steps: s(8, 5) },
  { group: "leitura", name: "inicio-logado", path: "/", signedIn: true, steps: s(2) },
  { group: "leitura", name: "catalogo", path: "/catalogo", signedIn: true, steps: s(3, 2) },
  { group: "leitura", name: "busca", path: "/catalogo?q=solo&view=lista", signedIn: true, steps: s(2) },
  { group: "leitura", name: "obra", path: `/obra/${WORK}`, signedIn: true, steps: s(6, 3) },
  { group: "leitura", name: "leitor", path: `/obra/${WORK}/${CHAPTER}`, signedIn: true, steps: s(2), end: true },
  // conta
  { group: "conta", name: "entrar", path: "/auth", steps: s(1) },
  { group: "conta", name: "perfis", path: "/perfis", signedIn: true, steps: s(1) },
  { group: "conta", name: "colecao", path: "/biblioteca", signedIn: true, steps: s(3, 2) },
  { group: "conta", name: "historico", path: "/historico", signedIn: true, steps: s(2) },
  { group: "conta", name: "perfil", path: `/u/${PROFILE}`, signedIn: true, steps: s(3, 2) },
  { group: "conta", name: "listas", path: "/listas", signedIn: true, steps: s(2) },
  { group: "conta", name: "lista", path: `/listas/${LIST_ID}`, signedIn: true, steps: s(2) },
  { group: "conta", name: "ranking", path: "/ranking", signedIn: true, steps: s(2) },
  { group: "conta", name: "leitores", path: "/ranking-leitores", signedIn: true, steps: s(2) },
  { group: "conta", name: "pedidos", path: "/pedidos", signedIn: true, steps: s(2) },
  { group: "conta", name: "reels", path: "/reels", signedIn: true, steps: s(1) },
  // painel
  { group: "admin", name: "admin", path: "/admin", signedIn: true, admin: true, steps: s(3, 2) },
  { group: "admin", name: "admin-obras", path: "/admin/obras", signedIn: true, admin: true, steps: s(2) },
  { group: "admin", name: "admin-editar", path: `/admin/${WORK_ID}`, signedIn: true, admin: true, steps: s(3, 2) },
  { group: "admin", name: "admin-nova", path: "/admin/nova", signedIn: true, admin: true, steps: s(2) },
  { group: "admin", name: "admin-novels", path: "/admin/novels", signedIn: true, admin: true, steps: s(2) },
  { group: "admin", name: "admin-mediocre", path: "/admin/mediocre", signedIn: true, admin: true, steps: s(2) },
  { group: "admin", name: "admin-home", path: "/admin/home", signedIn: true, admin: true, steps: s(2) },
  { group: "admin", name: "admin-generos", path: "/admin/generos", signedIn: true, admin: true, steps: s(1) },
  { group: "admin", name: "admin-contas", path: "/admin/contas", signedIn: true, admin: true, steps: s(1) },
  { group: "admin", name: "admin-pedidos", path: "/admin/pedidos", signedIn: true, admin: true, steps: s(1) },
  { group: "admin", name: "admin-suporte", path: "/admin/suporte", signedIn: true, admin: true, steps: s(1) },
  { group: "admin", name: "admin-manutencao", path: "/admin/manutencao", signedIn: true, admin: true, steps: s(1) },
  { group: "admin", name: "admin-imagens", path: "/admin/imagens", signedIn: true, admin: true, steps: s(1) },
  { group: "admin", name: "admin-molduras", path: "/admin/molduras", signedIn: true, admin: true, steps: s(1) },
  { group: "admin", name: "admin-selos", path: "/admin/selos", signedIn: true, admin: true, steps: s(1) },
  { group: "admin", name: "admin-app", path: "/admin/app", signedIn: true, admin: true, steps: s(1) },
].filter((p) => GROUPS.has(p.group));

const browser = await chromium.launch();
for (const [viewName, view] of Object.entries(VIEWS)) {
  for (const p of PAGES) {
    const context = await browser.newContext({ ...view, locale: "pt-BR", timezoneId: "America/Manaus", colorScheme: "dark" });
    await setup(context, { signedIn: Boolean(p.signedIn), admin: Boolean(p.admin) });
    const page = await context.newPage();
    page.on("pageerror", (e) => log.push(`[${viewName} ${p.name}] erro na página: ${e.message}`));
    page.on("console", (m) => { if (m.type() === "error") log.push(`[${viewName} ${p.name}] console: ${m.text().slice(0, 300)}`); });
    page.on("response", (r) => { if (r.status() >= 400 && !r.url().includes("click-sound")) log.push(`[${viewName} ${p.name}] ${r.status()} ${r.request().method()} ${r.url().slice(0, 260)}`); });
    try {
      await page.goto(BASE + p.path, { waitUntil: "domcontentloaded", timeout: 45000 });
      await settle(page);
      log.push(`[${viewName} ${p.name}] ${page.url()} título: ${await page.title()}`);
      // Página mais larga que a tela = rolagem para o lado no celular.
      const wide = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
      if (wide > 1) log.push(`[${viewName} ${p.name}] AVISO: página ${wide}px mais larga que a tela`);
      await shoot(page, `${p.name}-${viewName}`, { steps: p.steps[viewName] });
      if (p.end) {
        await page.evaluate(() => scrollTo(0, document.body.scrollHeight));
        await settle(page);
        await page.screenshot({ path: `${OUT}/${p.name}-${viewName}-fim.jpg`, type: "jpeg", quality: 72 });
      }
    } catch (e) {
      log.push(`[${viewName} ${p.name}] FALHOU: ${e.message.split("\n")[0]}`);
    }
    await context.close();
  }
}
await browser.close();
writeFileSync(`${OUT}/registro.txt`, log.join("\n") + "\n");
console.log(log.join("\n"));
