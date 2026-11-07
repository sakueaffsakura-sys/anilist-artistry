// Fotografa as telas do site (celular e computador) para conferir o visual sem precisar de um aparelho.
// Roda no GitHub Actions contra o site compilado localmente, com os dados públicos reais do banco.
// As páginas que pedem conta usam um login de teste só no navegador: os pedidos ao banco vão como
// visitante (sem token) e nada é gravado (escritas são respondidas aqui mesmo, sem ir ao banco).
import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW_PATH || "playwright");

const BASE = process.env.BASE_URL || "http://127.0.0.1:3000";
const SUPA = "https://olaqyjeicgopgolgidig.supabase.co";
const OUT = "telas";
const USER = "00000000-0000-4000-8000-0000000000aa";
const WORK = process.env.OBRA || "lookism";
const CHAPTER = process.env.CAPITULO || "1";
mkdirSync(OUT, { recursive: true });

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const exp = Math.floor(Date.now() / 1000) + 3600;
const user = { id: USER, aud: "authenticated", role: "authenticated", email: "teste@bettermanga.net", app_metadata: { provider: "email" }, user_metadata: { username: "leitor-teste" }, created_at: "2026-01-01T00:00:00Z" };
const jwt = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: USER, role: "authenticated", aud: "authenticated", exp, email: user.email })}.teste`;
const session = { access_token: jwt, refresh_token: "teste", expires_in: 3600, expires_at: exp, token_type: "bearer", user };

const log = [];
async function setup(context, signedIn) {
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
    if (method !== "GET" && method !== "HEAD" && !url.includes("/rest/v1/rpc/get_")) {
      return route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
    }
    const headers = { ...req.headers() };
    delete headers.authorization;
    try {
      const res = await route.fetch({ headers });
      return route.fulfill({ response: res });
    } catch (e) {
      log.push(`falha ao buscar ${url}: ${e.message}`);
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
  celular: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  computador: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
};

const PAGES = [
  { name: "inicio", path: "/", signedIn: false, steps: { celular: 8, computador: 5 } },
  { name: "inicio-logado", path: "/", signedIn: true, steps: { celular: 2, computador: 1 } },
  { name: "catalogo", path: "/catalogo", signedIn: true, steps: { celular: 4, computador: 2 } },
  { name: "busca", path: "/catalogo?q=solo", signedIn: true, steps: { celular: 2, computador: 1 } },
  { name: "obra", path: `/obra/${WORK}`, signedIn: true, steps: { celular: 6, computador: 3 } },
  { name: "leitor", path: `/obra/${WORK}/${CHAPTER}`, signedIn: true, steps: { celular: 2, computador: 1 }, end: true },
];

const browser = await chromium.launch();
for (const [viewName, view] of Object.entries(VIEWS)) {
  for (const p of PAGES) {
    const context = await browser.newContext({ ...view, locale: "pt-BR", timezoneId: "America/Manaus", colorScheme: "dark" });
    await setup(context, p.signedIn);
    const page = await context.newPage();
    page.on("pageerror", (e) => log.push(`[${viewName} ${p.name}] erro na página: ${e.message}`));
    page.on("console", (m) => { if (m.type() === "error") log.push(`[${viewName} ${p.name}] console: ${m.text().slice(0, 300)}`); });
    page.on("response", (r) => { if (r.status() >= 400) log.push(`[${viewName} ${p.name}] ${r.status()} ${r.request().method()} ${r.url().slice(0, 260)}`); });
    try {
      await page.goto(BASE + p.path, { waitUntil: "domcontentloaded", timeout: 45000 });
      await settle(page);
      log.push(`[${viewName} ${p.name}] ${page.url()} título: ${await page.title()}`);
      await shoot(page, `${p.name}-${viewName}`, { steps: p.steps[viewName] });
      if (p.end) {
        await page.evaluate(() => scrollTo(0, document.body.scrollHeight));
        await settle(page);
        await page.screenshot({ path: `${OUT}/${p.name}-${viewName}-fim.jpg`, type: "jpeg", quality: 72 });
      }
    } catch (e) {
      log.push(`[${viewName} ${p.name}] FALHOU: ${e.message}`);
    }
    await context.close();
  }
}
await browser.close();
writeFileSync(`${OUT}/registro.txt`, log.join("\n") + "\n");
console.log(log.join("\n"));
