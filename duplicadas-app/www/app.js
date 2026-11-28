/*
 * Duplicadas — tela. O token fica só neste celular; o catálogo lido fica salvo no aparelho (IndexedDB) para
 * procurar de novo sem gastar pedidos.
 *
 * No celular, a procura roda no motor nativo (serviço em primeiro plano) e continua com o app fechado: ele lê o
 * catálogo, os detalhes (sinopse, nomes, autores) e confere as capas, e guarda os resultados; a tela junta tudo ao
 * catálogo quando abre (e a cada 20 s com o app aberto) e procura as duplicadas e os problemas aqui. No navegador
 * (testes), a própria tela lê, em 4 etapas, como antes.
 *
 * Duplicadas: cada grupo é um bloco que dá para selecionar (vários de uma vez) para copiar ou deletar da lista
 * (os deletados ficam em "Apagados" e podem voltar).
 */
(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const Dup = window.Dup, MApi = window.MediocreApi;
  const fmt = (n) => Number(n || 0).toLocaleString("pt-BR");
  const LEVEL_NAME = { alta: "Certeza alta", provavel: "Provável", talvez: "Talvez" };
  const STEP_NAME = { busca: "Busca geral", adicionadas: "Lista de adicionadas", atualizadas: "Lista de atualizadas", letras: "Busca por letra", pronto: "Completo" };
  const when = (t) => new Date(t).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  const hhmm = (t) => new Date(t).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const dur = (ms) => { const s = Math.round(ms / 1000); return s < 60 ? `${s} s` : s < 3600 ? `${Math.floor(s / 60)} min${s % 60 ? ` ${s % 60} s` : ""}` : `${Math.floor(s / 3600)} h ${Math.round((s % 3600) / 60)} min`; };
  const reduced = () => window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- Guardar no celular ---------- */
  const ls = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (_) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) { /* sem espaço: segue sem salvar */ } },
    del(k) { try { localStorage.removeItem(k); } catch (_) { /* ok */ } },
  };
  /** Catálogo e papel de parede no IndexedDB (cabe muito mais que o localStorage); sem IndexedDB, localStorage. */
  const store = (() => {
    let dbp = null;
    const open = () => dbp || (dbp = new Promise((res, rej) => {
      if (!window.indexedDB) return rej(new Error("sem IndexedDB"));
      const r = indexedDB.open("duplicadas", 1);
      r.onupgradeneeded = () => r.result.createObjectStore("kv");
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    }));
    const tx = (mode, fn) => open().then((db) => new Promise((res, rej) => {
      const t = db.transaction("kv", mode), s = t.objectStore("kv"), q = fn(s);
      t.oncomplete = () => res(q && q.result); t.onerror = () => rej(t.error);
    }));
    return {
      get: (k) => tx("readonly", (s) => s.get(k)).catch(() => ls.get("dup-" + k, null)),
      set: (k, v) => tx("readwrite", (s) => s.put(v, k)).catch(() => ls.set("dup-" + k, v)),
      del: (k) => tx("readwrite", (s) => s.delete(k)).catch(() => ls.del("dup-" + k)),
    };
  })();

  // auto: procura sozinho; gap/minGap: segundos entre pedidos à API (o motor começa em gap e acelera até minGap);
  // coverThreads: capas ao mesmo tempo; deep/covers: ler detalhes e conferir capas de todas as obras;
  // deepPer/coverPer/coverGap: só no modo do navegador; wpDim/wpBlur: papel de parede.
  const settings = Object.assign({ gap: 1.5, minGap: 1, coverThreads: 3, min: 55, ignore: "", auto: true, deep: true, deepPer: 250, covers: true, coverPer: 300, coverGap: 0.8, wpDim: 55, wpBlur: 0 }, ls.get("dup-settings", {}));
  const saveSettings = () => ls.set("dup-settings", settings);
  let dismissed = new Set(ls.get("dup-dismissed", []));
  const saveDismissed = () => ls.set("dup-dismissed", Array.from(dismissed));
  // Blocos deletados da lista (ficam em "Apagados" e podem voltar).
  let deleted = ls.get("dup-deleted", []);
  const saveDeleted = () => ls.set("dup-deleted", deleted.slice(-3000));
  const getToken = () => ls.get("dup-token", "") || "";
  // Problemas dispensados ("id:desc" / "id:cover").
  let okProblems = new Set(ls.get("dup-ok", []));
  const saveOk = () => ls.set("dup-ok", Array.from(okProblems));
  // Grupos já vistos na aba Duplicadas (os outros aparecem como "Novos").
  let seen = new Set(ls.get("dup-seen", []));
  const history = ls.get("dup-history", []);

  /*
   * Pedidos: no celular, o plugin DupHttp (o mesmo caminho do Estúdio, que a MediocreScan aceita); se ele faltar, o
   * HTTP nativo do Capacitor; no navegador, fetch.
   */
  const C = window.Capacitor;
  const isNative = Boolean(C && typeof C.isNativePlatform === "function" && C.isNativePlatform());
  const plugin = (name) => {
    if (!isNative) return null;
    const reg = (window.capacitorExports && window.capacitorExports.registerPlugin) || C.registerPlugin;
    try { return reg ? reg(name) : (C.Plugins && C.Plugins[name]) || null; } catch (_) { return (C.Plugins && C.Plugins[name]) || null; }
  };
  const DupHttp = plugin("DupHttp");
  const CapHttp = isNative ? (window.capacitorExports && window.capacitorExports.CapacitorHttp) || (C.Plugins && C.Plugins.CapacitorHttp) || null : null;
  let dupHttpBroken = false;
  const missingPlugin = (msg) => /not implemented|não implementado|plugin.*(not|não)/i.test(msg);
  async function http(url, headers, token) {
    if (DupHttp && !dupHttpBroken) {
      try {
        const r = await DupHttp.get({ url, token });
        return { status: Number(r.status) || 0, data: typeof r.body === "string" ? r.body : "", via: "nativo" };
      } catch (e) {
        const msg = String((e && e.message) || e);
        // Plugin ausente nesta versão: usa o outro caminho. Erro de rede: devolve como queda (o leitor espera e tenta).
        if (missingPlugin(msg)) dupHttpBroken = true;
        else return { status: 0, data: null, error: msg, via: "nativo" };
      }
    }
    if (CapHttp) {
      const r = await CapHttp.request({ url, method: "GET", headers, responseType: "text", connectTimeout: 20000, readTimeout: 45000 });
      return { status: r.status, data: r.data, via: "capacitor" };
    }
    const r = await fetch(url, { headers });
    return { status: r.status, data: await r.text().catch(() => ""), via: "fetch" };
  }

  /**
   * Confere uma capa: {s: status, t: tipo, b: bytes, w, h, std: variação de brilho, hash, ok, err}.
   * No celular o plugin DupHttp abre a imagem no Android (não passa o arquivo para a tela); no navegador, canvas.
   * Hash = dHash (64 bits em 16 caracteres): a imagem reduzida a 9×8, cada pixel comparado com o vizinho; imagens
   * iguais (mesmo com outro nome, tamanho ou compressão) dão hashes quase iguais.
   */
  const COVER_HOSTS = /^https:\/\/([a-z0-9-]+\.)*(mediocrescan\.com|mediocretoons\.net)\/\S{1,780}$/;
  async function coverCheck(url) {
    if (!COVER_HOSTS.test(url)) {
      let host = "outro site";
      try { host = new URL(url).host || host; } catch (_) { /* endereço estranho */ }
      return { s: -1, err: host };
    }
    const t0 = Date.now();
    let info;
    if (DupHttp && !dupHttpBroken) {
      try { info = await DupHttp.cover({ url }); }
      catch (e) {
        const msg = String((e && e.message) || e);
        if (missingPlugin(msg)) dupHttpBroken = true;
        info = { s: 0, err: msg };
      }
      if (info && !("s" in info)) info = { s: 0, err: "resposta vazia" };
    }
    if (!info) info = await coverCheckWeb(url);
    if (!(info.s >= 200 && info.s < 300 && info.ok)) {
      addDiag({ path: "capa " + url.replace(/^https:\/\/[^/]+/, ""), status: info.s, ms: info.ms || Date.now() - t0, via: DupHttp && !dupHttpBroken ? "nativo" : "fetch", text: [info.t, info.err, info.ok === false && info.s >= 200 && info.s < 300 ? "não abriu como imagem" : null].filter(Boolean).join(" · ") });
    }
    return info;
  }
  async function coverCheckWeb(url) {
    let r;
    try { r = await fetch(url); } catch (e) { return { s: 0, err: String((e && e.message) || e) }; }
    const out = { s: r.status, t: r.headers.get("content-type") || "", ok: false };
    if (!r.ok) return out;
    const blob = await r.blob();
    out.b = blob.size;
    const src = URL.createObjectURL(blob);
    try {
      const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
      out.w = img.naturalWidth; out.h = img.naturalHeight;
      if (!out.w || !out.h) return out;
      const draw = (w, h) => {
        const c = document.createElement("canvas");
        c.width = w; c.height = h;
        const g = c.getContext("2d", { willReadFrequently: true });
        g.fillStyle = "#fff"; g.fillRect(0, 0, w, h);
        g.drawImage(img, 0, 0, w, h);
        const d = g.getImageData(0, 0, w, h).data;
        return (x, y) => { const i = (y * w + x) * 4; return d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114; };
      };
      const l9 = draw(9, 8);
      let hex = "";
      for (let y = 0; y < 8; y++) {
        let byte = 0;
        for (let x = 0; x < 8; x++) byte = (byte << 1) | (l9(x, y) > l9(x + 1, y) ? 1 : 0);
        hex += byte.toString(16).padStart(2, "0");
      }
      const l16 = draw(16, 16);
      let sum = 0, sq = 0;
      for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const l = l16(x, y); sum += l; sq += l * l; }
      const mean = sum / 256;
      return Object.assign(out, { ok: true, hash: hex, std: Math.sqrt(Math.max(0, sq / 256 - mean * mean)) });
    } catch (_) {
      return out;
    } finally { URL.revokeObjectURL(src); }
  }

  /* ---------- Estado ---------- */
  const cat = { works: new Map(), progress: null, lettersNext: null, savedAt: null };
  let result = null, problems = null, busy = null, reader = null, runStart = 0, waitTimer = null;

  async function loadCatalog() {
    const saved = await store.get("catalog");
    if (saved && Array.isArray(saved.works)) {
      cat.works = new Map(saved.works.map((w) => [w.id, w]));
      cat.progress = saved.progress || null;
      cat.lettersNext = saved.lettersNext || null;
      cat.savedAt = saved.savedAt || null;
      Object.assign(cat, { pagers: saved.pagers || {}, prevIds: saved.prevIds || {}, lettersBigrams: Boolean(saved.lettersBigrams), lettersDone: saved.lettersDone || null });
    }
  }
  async function saveCatalog() {
    cat.savedAt = Date.now();
    await store.set("catalog", { works: Array.from(cat.works.values()), progress: cat.progress, lettersNext: cat.lettersNext, savedAt: cat.savedAt,
      pagers: cat.pagers || {}, prevIds: cat.prevIds || {}, lettersBigrams: Boolean(cat.lettersBigrams), lettersDone: cat.lettersDone || null });
    renderStats();
  }
  function makeReader() {
    return MApi.createReader({
      http, sleep: (ms) => new Promise((r) => setTimeout(r, ms)), now: () => Date.now(), token: getToken,
      gapMs: () => Math.max(1, Number(settings.gap) || 2.5) * 1000, onEvent,
    });
  }

  /* ---------- Pequenos ajudantes de tela ---------- */
  function el(tag, props, ...kids) {
    const n = document.createElement(tag);
    if (props) for (const [k, v] of Object.entries(props)) { if (v == null) continue; if (k === "className") n.className = v; else if (k === "text") n.textContent = v; else n.setAttribute(k, v); }
    for (const c of kids) if (c != null) n.append(c);
    return n;
  }
  const SVG = "http://www.w3.org/2000/svg";
  function svg(tag, attrs) {
    const n = document.createElementNS(SVG, tag);
    for (const [k, v] of Object.entries(attrs || {})) n.setAttribute(k, v);
    return n;
  }
  let toastTimer = null;
  function toast(text, action) {
    const t = $("toast");
    t.innerHTML = "";
    t.append(el("span", { text }));
    if (action) {
      const b = el("button", { type: "button", className: "link", text: action.label });
      b.onclick = () => { hideToast(); action.run(); };
      t.append(b);
    }
    t.hidden = false;
    t.classList.remove("out");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(hideToast, action ? 6000 : 3500);
  }
  function hideToast() {
    const t = $("toast");
    if (reduced()) { t.hidden = true; return; }
    t.classList.add("out");
    setTimeout(() => { if (t.classList.contains("out")) { t.hidden = true; t.classList.remove("out"); } }, 200);
  }
  async function copyText(text, msg) {
    try { await navigator.clipboard.writeText(text); toast(msg); return; } catch (_) { /* tenta do jeito antigo */ }
    const ta = el("textarea", { style: "position:fixed;opacity:0" }); ta.value = text; document.body.append(ta); ta.select();
    try { document.execCommand("copy"); toast(msg); } catch (_) { toast("Não deu para copiar."); }
    ta.remove();
  }
  function cover(w, cls) {
    const ph = () => el("span", { className: `ph ${cls || ""}`, text: (w.title || "?").slice(0, 1) });
    if (!w.cover) return ph();
    const img = el("img", { src: w.cover, alt: "", loading: "lazy", className: cls || null });
    img.onerror = () => img.replaceWith(ph());
    return img;
  }
  /** Link da obra no site da MediocreScan (o dono quer o link, não só o ID). */
  const OBRA_URL = "https://mediocrescan.com/obra/";
  const workUrl = (w) => OBRA_URL + encodeURIComponent(String(w.id));
  const linkEl = (w) => el("a", { className: "lnk", href: workUrl(w), rel: "noopener", text: workUrl(w).replace(/^https:\/\//, "") });
  const full = (w) => cat.works.get(w.id) || w;
  function meta(w) {
    const f = full(w);
    return [f.format, f.chapters != null ? `${fmt(f.chapters)} cap.` : null, f.status].filter(Boolean).join(" · ");
  }
  /** Número que conta até o valor novo (só quando muda). */
  function countTo(node, value, suffix) {
    const to = Number(value) || 0, from = Number(node.dataset.v || 0);
    node.dataset.v = String(to);
    if (from === to || reduced() || !node.isConnected || document.hidden) { node.textContent = fmt(to) + (suffix || ""); return; }
    const t0 = performance.now(), ms = 650;
    const step = (t) => {
      const k = Math.min(1, (t - t0) / ms), e = 1 - Math.pow(1 - k, 3);
      node.textContent = fmt(Math.round(from + (to - from) * e)) + (suffix || "");
      if (k < 1 && node.dataset.v === String(to)) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
  /** Entrada em cascata dos primeiros itens de uma lista (só quando a lista abre, não a cada atualização). */
  function cascade(list) {
    if (reduced()) return;
    Array.from(list.children).slice(0, 12).forEach((li, i) => { li.style.setProperty("--i", String(i)); li.classList.add("rise"); });
  }
  /** Nota em anel (0–100), cheio na cor do nível. */
  function ring(score, level, animate) {
    const r = 17, c = 2 * Math.PI * r;
    const box = el("span", { className: `ring ${level}`, role: "img", "aria-label": `Nota ${score} de 100` });
    const s = svg("svg", { viewBox: "0 0 40 40", width: "40", height: "40" });
    s.append(svg("circle", { cx: "20", cy: "20", r: String(r), class: "ring-bg" }));
    const fg = svg("circle", { cx: "20", cy: "20", r: String(r), class: "ring-fg", "stroke-dasharray": c.toFixed(2), "stroke-dashoffset": (animate && !reduced() ? c : c * (1 - score / 100)).toFixed(2) });
    s.append(fg);
    box.append(s, el("b", { text: String(score) }));
    if (animate && !reduced()) requestAnimationFrame(() => requestAnimationFrame(() => fg.setAttribute("stroke-dashoffset", (c * (1 - score / 100)).toFixed(2))));
    return box;
  }

  /* ---------- Abas (embaixo) ---------- */
  let tab = "painel";
  function showTab(name) {
    const changed = tab !== name;
    tab = name;
    document.querySelectorAll(".bottom [data-tab]").forEach((b) => { if (b.dataset.tab === name) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current"); });
    for (const v of ["painel", "grupos", "problemas", "catalogo", "ajustes"]) {
      const view = $("v-" + v);
      view.hidden = v !== name;
      if (v === name && changed && !reduced()) { view.classList.remove("enter"); void view.offsetWidth; view.classList.add("enter"); }
    }
    if (name !== "grupos") clearSelection();
    if (name === "grupos") renderGroups(true, true);
    if (name === "problemas") renderProblems(true);
    if (name === "catalogo") renderCatalog();
    if (name === "ajustes") renderSettings();
    if (name === "painel") renderPanel();
    window.scrollTo(0, 0);
  }
  document.querySelectorAll(".bottom [data-tab]").forEach((b) => { b.onclick = () => showTab(b.dataset.tab); });

  /* ---------- Token ---------- */
  function saveToken(v) {
    v = String(v || "").trim().replace(/^bearer\s+/i, "");
    if (v.length < 10) { toast("Esse token parece curto demais. Cole o token inteiro."); return false; }
    ls.set("dup-token", v);
    settings.auto = true; saveSettings();
    renderToken(); renderPanel();
    toast("Token salvo neste celular. Procurando sozinho…");
    setTimeout(() => (BG ? bgStart({}) : autoCycle(true)), 300);
    return true;
  }
  function renderToken() {
    const t = getToken();
    $("token-saved").hidden = !t;
    $("token-form").hidden = Boolean(t);
    $("token-cancel").hidden = !t;
    $("token-mask").textContent = t ? `Token salvo ••••${t.slice(-4)} (${t.length} caracteres)` : "";
    $("token-test").disabled = !t || Boolean(busy);
    $("need-token").hidden = Boolean(t);
  }
  $("token-form").onsubmit = (e) => { e.preventDefault(); if (saveToken($("token-input").value)) { $("token-input").value = ""; $("token-status").textContent = "Token salvo neste celular."; } };
  $("quick-token").onsubmit = (e) => { e.preventDefault(); if (saveToken($("quick-input").value)) $("quick-input").value = ""; };
  $("token-change").onclick = () => { $("token-saved").hidden = true; $("token-form").hidden = false; $("token-input").focus(); };
  $("token-cancel").onclick = () => renderToken();
  $("token-eye").onclick = () => {
    const i = $("token-input"), show = i.type === "password";
    i.type = show ? "text" : "password";
    $("token-eye").setAttribute("aria-pressed", String(show));
    $("token-eye").textContent = show ? "Ocultar" : "Ver";
  };
  $("token-test").onclick = async () => {
    if (busy) return;
    busy = "test";
    $("token-status").textContent = "Testando…";
    renderToken();
    try {
      const n = await makeReader().test();
      $("token-status").textContent = n ? `Token funcionando: a MediocreScan respondeu com ${n} obras.` : "A MediocreScan respondeu, mas sem obras. Confira o token.";
    } catch (e) {
      $("token-status").textContent = e.message || String(e);
    } finally {
      busy = null; renderToken(); renderPanel();
    }
  };

  /* ---------- Diagnóstico: os últimos pedidos (caminho, status, tempo e começo da resposta; nunca o token) ---------- */
  const diag = ls.get("dup-diag", []);
  function addDiag(e) {
    diag.unshift({ at: Date.now(), path: e.path, status: e.status, ms: e.ms, via: e.via || "", text: e.text || "" });
    diag.length = Math.min(diag.length, 40);
    ls.set("dup-diag", diag);
    if (!$("diag").hidden) renderDiag();
  }
  function renderDiag() {
    const list = $("diag-list");
    list.innerHTML = "";
    $("diag-empty").hidden = diag.length > 0;
    diag.slice(0, 20).forEach((d) => {
      const ok = d.status >= 200 && d.status < 300;
      list.append(el("li", { className: ok ? "ok" : "bad" },
        el("p", { className: "d-h" }, el("b", { text: d.status ? String(d.status) : "sem resposta" }), ` ${d.path} · ${d.ms} ms${d.via ? ` · ${d.via}` : ""} · ${new Date(d.at).toLocaleTimeString("pt-BR")}`),
        d.text ? el("p", { className: "d-t", text: d.text }) : null));
    });
  }
  function diagText() {
    const st = bgStatus ? `Segundo plano: ${bgStatus.phase}; detalhes ${bgStatus.detailsDone}/${bgStatus.detailsTotal}; capas ${bgStatus.coversDone}/${bgStatus.coversTotal}; ritmo ${bgStatus.gapMs} ms (mínimo ${bgStatus.minGapMs} ms)${bgStatus.error ? `; erro: ${bgStatus.error}` : ""}` : "Segundo plano: desligado";
    return [`Duplicadas ${window.BM_VERSION || ""} — diagnóstico`, `Obras salvas: ${cat.works.size}; leitura: ${cat.progress ? JSON.stringify(cat.progress) : "nenhuma"}`, st, ""]
      .concat(diag.map((d) => `${new Date(d.at).toLocaleString("pt-BR")} ${d.status || "sem resposta"} ${d.path} ${d.ms} ms ${d.via}\n  ${d.text}`)).join("\n");
  }
  $("diag-show").onclick = () => { const d = $("diag"); d.hidden = !d.hidden; $("diag-show").textContent = d.hidden ? "Ver diagnóstico" : "Esconder diagnóstico"; if (!d.hidden) renderDiag(); };
  $("diag-copy").onclick = () => copyText(diagText(), "Diagnóstico copiado (sem o token).");

  /* ---------- Andamento das leituras (modo do navegador) ---------- */
  // Ritmo das leituras da tela, para as faixas do painel.
  const jsRate = { det: [], cov: [] };
  const rateOf = (arr) => { const now = Date.now(); while (arr.length && now - arr[0] > 5 * 60_000) arr.shift(); return arr.length < 2 ? 0 : Math.round((arr.length * 60_000) / Math.max(60_000, now - arr[0])); };
  let jsCat = null;
  function elapsed() { return dur(Date.now() - runStart); }
  function setBar(n, of) {
    const bar = $("run-bar").parentElement;
    bar.classList.toggle("indet", !of);
    if (of) $("run-bar").style.width = `${Math.min(100, Math.round((n / of) * 100))}%`;
  }
  function onEvent(e) {
    if (e.type === "req") { addDiag(e); return; }
    const run = $("run");
    if (e.type === "wait") {
      clearInterval(waitTimer);
      run.classList.add("waiting");
      let left = e.seconds;
      const tick = () => {
        $("run-text").textContent = `A MediocreScan recusou (${e.reason}). Esperando ${dur(left * 1000)} para tentar de novo (${e.attempt} de ${e.max}).`;
        left = Math.max(0, left - 1);
      };
      tick(); waitTimer = setInterval(tick, 1000);
      return;
    }
    if (e.type === "resume") { clearInterval(waitTimer); run.classList.remove("waiting"); $("run-text").textContent = "Tentando de novo…"; return; }
    if (e.type === "pager") {
      $("run-sub").textContent = e.step === "letras" ? "A busca não aceita uma letra só: usando pares de letras." : e.param ? `A lista pagina com “${e.param}”.` : "Essa lista não tem mais páginas.";
      return;
    }
    if (e.type === "method") {
      $("run-sub").textContent = e.ok ? `A busca geral funciona: ${fmt(e.totalItems)} obras em ${fmt(e.totalPages)} páginas.` : "A busca geral não lista tudo: lendo as listas de adicionadas e atualizadas.";
      return;
    }
    if (e.type === "page") {
      setBar(e.page, e.pages);
      jsCat = { step: e.step, page: e.page, pages: e.pages, count: e.count };
      $("run-text").textContent = `${STEP_NAME[e.step] || e.step}${e.letter ? ` “${e.letter}”` : ""}: página ${fmt(e.page)}${e.pages ? ` de ${fmt(e.pages)}` : ""} · +${e.added} nova${e.added === 1 ? "" : "s"}`;
      $("run-sub").textContent = `${fmt(e.count)} obras lidas${e.totalItems ? ` de ${fmt(e.totalItems)}` : ""} · ${elapsed()}`;
      $("st-works").textContent = fmt(e.count);
      renderLanes();
      return;
    }
    if (e.type === "detail" || e.type === "cover") {
      setBar(e.n, e.of);
      (e.type === "cover" ? jsRate.cov : jsRate.det).push(Date.now());
      $("run-text").textContent = `${e.type === "cover" ? "Capas" : "Detalhes"}: ${fmt(e.n)} de ${fmt(e.of)} · ${e.title}`;
      const left = (e.of - e.n) * (e.type === "cover" ? coverGapS() + 0.5 : Math.max(1, Number(settings.gap) || 2.5)) * 1000;
      $("run-sub").textContent = `${elapsed()}${left > 5000 ? ` · falta uns ${dur(left)}` : ""}`;
      if (e.n % 5 === 0) renderLanes();
    }
  }
  /** Roda uma leitura (uma de cada vez), mostrando o andamento no painel. Devolve true se terminou. */
  async function runTask(kind, fn) {
    if (busy) return false;
    if (!getToken()) { toast("Coloque o token da MediocreScan primeiro."); showTab("painel"); return false; }
    busy = kind; runStart = Date.now();
    reader = makeReader();
    $("run").hidden = false; $("run").classList.remove("waiting");
    setBar(0, 0);
    $("run-text").textContent = "Começando…"; $("run-sub").textContent = "";
    renderPanel(); renderToken();
    let ok = false;
    try { await fn(reader); ok = true; }
    catch (e) {
      if (e && e.stopped) toast("Parado. O que já foi lido está salvo.");
      else {
        toast(e.message || String(e));
        $("run-text").textContent = e.message || String(e);
        const d = diag[0];
        $("run-sub").textContent = d ? `Último pedido: ${d.status || "sem resposta"} em ${d.path}${d.text ? ` — ${d.text.slice(0, 140)}` : ""}` : "";
        lastError = e.message || String(e);
      }
    } finally {
      clearInterval(waitTimer);
      busy = null; reader = null; jsCat = null;
      await saveCatalog();
      $("run").hidden = ok || !$("run-text").textContent || /Começando/.test($("run-text").textContent);
      renderPanel(); renderToken();
    }
    return ok;
  }
  $("cat-stop").onclick = () => {
    // Parar = fica parado até ligar de novo (o interruptor mostra).
    if (BG && bgRunning()) { settings.auto = false; saveSettings(); bgStop(); renderHero(); return; }
    if (reader) reader.stop();
    $("run-text").textContent = "Parando…";
  };

  /* ---------- Procurar ---------- */
  function suspects() {
    if (!result) return [];
    const ids = new Set();
    for (const g of result.groups) for (const w of g.works) if (!full(w).detailed) ids.add(w.id);
    return Array.from(ids);
  }
  function suspectCovers() {
    if (!result) return [];
    const ids = new Set();
    for (const g of result.groups) for (const w of g.works) { const f = full(w); if (f.cover && !f.coverInfo) ids.add(w.id); }
    return Array.from(ids);
  }
  /** Obras com capa ainda não conferida, as mais novas primeiro. */
  function uncheckedCovers() {
    return Array.from(cat.works.values()).filter((w) => w.cover && !w.coverInfo).sort((a, b) => Number(b.id) - Number(a.id)).map((w) => w.id);
  }
  const coverGapS = () => Math.max(0.05, Math.min(10, Number(settings.coverGap) || 0.8));
  const coverOpts = (force) => ({ gapMs: coverGapS() * 1000, force: Boolean(force) });
  /** Obras ainda sem detalhes, as mais novas primeiro (são as que mais costumam ser repostadas). */
  function undetailed() {
    return Array.from(cat.works.values()).filter((w) => !w.detailed).sort((a, b) => Number(b.id) - Number(a.id)).map((w) => w.id);
  }
  /** Pares que não entram: "não é duplicada" e os dos blocos deletados. */
  function excluded() {
    const out = new Set(dismissed);
    for (const d of deleted) for (const k of d.pairs || []) out.add(k);
    return out;
  }
  let lastFind = 0;
  function find() {
    lastFind = Date.now();
    if (!cat.works.size) { result = null; problems = null; renderPanel(); return; }
    const all = Array.from(cat.works.values());
    result = Dup.findDuplicates(all, { min: Number(settings.min) || 55, ignore: settings.ignore, dismissed: excluded() });
    // Problemas (sinopse e capa) e, com eles, qual obra de cada grupo manter (a sem problema, se empatar).
    problems = Dup.findProblems(all, { groups: result.groups, ignore: settings.ignore, ignored: okProblems });
    const bad = new Set(problems.items.filter((it) => it.grave).map((it) => it.w.id));
    result.groups.forEach((g) => { g.keep = Dup.keepOf(g.works.map(full), bad); });
    const keys = new Set(result.groups.map((g) => g.key));
    for (const k of Array.from(selected)) if (!keys.has(k) && !k.startsWith("del:")) selected.delete(k);
    const ms = result.ms + problems.ms;
    $("find-meta").textContent = `${fmt(result.groups.length)} grupo(s) e ${fmt(problems.items.length)} problema(s) em ${fmt(cat.works.size)} obras · ${fmt(result.compared)} comparações em ${ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`}.`;
    renderPanel();
    if (tab === "grupos") renderGroups(false, false);
    if (tab === "problemas") renderProblems(false);
  }
  // Com a procura rodando, procurar de novo no máximo a cada 30 s (a lista não pula o tempo todo).
  let findTimer = null;
  function scheduleFind(soon) {
    clearTimeout(findTimer);
    const wait = soon ? 300 : Math.max(300, 30_000 - (Date.now() - lastFind));
    findTimer = setTimeout(find, wait);
  }
  const newGroups = () => (result ? result.groups.filter((g) => !seen.has(g.key)) : []);

  /* ---------- Painel ---------- */
  function renderStats() {
    const total = cat.works.size, det = Array.from(cat.works.values()).filter((w) => w.detailed).length;
    const pct = total ? Math.round((det / total) * 100) : 0;
    countTo($("st-works"), total);
    countTo($("st-detail"), pct, "%");
    $("st-detail-bar").style.width = `${pct}%`;
    countTo($("st-groups"), result ? result.groups.length : 0);
  }
  function renderPanel() {
    renderStats();
    const n = { alta: 0, provavel: 0, talvez: 0 };
    if (result) result.groups.forEach((g) => n[g.level]++);
    for (const k of Object.keys(n)) countTo($("n-" + k), n[k]);
    const fresh = newGroups();
    const tc = $("tab-count");
    const total = result ? result.groups.length : 0;
    tc.hidden = !total;
    // Rosa = quantas são novas; cinza = total.
    tc.textContent = fresh.length ? fmt(fresh.length) : fmt(total);
    tc.title = fresh.length ? `${fmt(fresh.length)} nova(s)` : `${fmt(total)} grupo(s)`;
    tc.classList.toggle("fresh", fresh.length > 0);
    // Problemas: sinopses e capas (e quantas já foram conferidas).
    const pc = problems ? problems.counts : null;
    const pt = $("tab-prob");
    pt.hidden = !(pc && pc.desc + pc.cover);
    pt.textContent = pc ? fmt(pc.desc + pc.cover) : "";
    countTo($("pr-desc"), pc ? pc.desc : 0);
    countTo($("pr-cover"), pc ? pc.cover : 0);
    $("pr-desc-sub").textContent = pc ? `${fmt(pc.descChecked)} de ${fmt(pc.total)} conferidas` : "nada conferido";
    $("pr-cover-sub").textContent = pc ? `${fmt(pc.coverChecked)} de ${fmt(pc.total)} conferidas` : "nada conferido";
    $("pr-grave").hidden = !(pc && pc.grave);
    $("pr-grave").textContent = pc ? `${fmt(pc.grave)} grave${pc.grave === 1 ? "" : "s"}` : "";
    // Novidades.
    $("news").hidden = !fresh.length;
    const nl = $("news-list"); nl.innerHTML = "";
    fresh.slice(0, 3).forEach((g) => {
      const b = el("button", { type: "button", className: `mini-row ${g.level}` },
        el("span", { className: "mini-score", text: String(g.score) }),
        el("span", { className: "mini-t", text: g.works.map((w) => full(w).title).join("  ×  ") }));
      b.onclick = () => { setFilter("todas"); $("g-q").value = String(g.works[0].id); showTab("grupos"); };
      nl.append(el("li", {}, b));
    });
    // Histórico.
    const hl = $("hist"); hl.innerHTML = "";
    $("hist-empty").hidden = history.length > 0;
    history.slice(0, 6).forEach((h) => {
      const parts = [];
      if (h.err) parts.push(h.err);
      else if (h.kind === "fim") parts.push(`Conferência completa: ${fmt(h.detalhes)} detalhes e ${fmt(h.capas)} capas`);
      else if (h.kind === "recentes") parts.push(h.novas ? `+${fmt(h.novas)} obra${h.novas === 1 ? "" : "s"} nova${h.novas === 1 ? "" : "s"} no site` : "Nenhuma obra nova no site");
      else if (h.kind === "ligada") parts.push(h.text || "Procura em segundo plano ligada");
      else {
        if (h.novas) parts.push(`+${fmt(h.novas)} obra${h.novas === 1 ? "" : "s"}`);
        if (h.detalhes) parts.push(`${fmt(h.detalhes)} detalhe${h.detalhes === 1 ? "" : "s"}`);
        if (h.capas) parts.push(`${fmt(h.capas)} capa${h.capas === 1 ? "" : "s"}`);
        parts.push(h.novos ? `${fmt(h.novos)} grupo${h.novos === 1 ? "" : "s"} novo${h.novos === 1 ? "" : "s"} (${fmt(h.grupos)} no total)` : `${fmt(h.grupos)} grupo${h.grupos === 1 ? "" : "s"}`);
        if (h.problemas != null) parts.push(`${fmt(h.problemas)} problema${h.problemas === 1 ? "" : "s"}`);
      }
      hl.append(el("li", { className: h.err ? "err" : null }, el("b", { text: when(h.at) }), el("span", { text: `${parts.join(" · ")}${h.ms ? ` · ${dur(h.ms)}` : ""}` })));
    });
    // Ferramentas.
    const p = cat.progress;
    const reading = Boolean(busy) && busy !== "test";
    $("cat-meta").textContent = !cat.works.size ? "Nada lido ainda." : p && p.step !== "pronto" ? `Leitura parada em ${STEP_NAME[p.step] || p.step}, página ${p.page}: a próxima procura continua dali.`
      : `Leitura completa${p && p.buscaOk ? " pela busca geral" : " pelas listas"}${p && p.finished ? ` em ${when(p.finished)}` : ""}.`;
    $("cat-read").textContent = p && p.step !== "pronto" && cat.works.size ? "Continuar a leitura do catálogo" : cat.works.size ? "Ler o catálogo de novo" : "Ler o catálogo";
    $("cat-letters").textContent = cat.lettersNext ? `Continuar a busca por letra (de “${cat.lettersNext}”)` : "Completar buscando por letras";
    for (const id of ["cat-read", "cat-letters", "find-run", "deep-run", "cover-run"]) $(id).disabled = reading || (!cat.works.size && id !== "cat-read");
    renderHero();
  }

  /* ---------- Faixas de andamento (catálogo, detalhes, capas) ---------- */
  function lane(key, share, text, active) {
    const row = document.querySelector(`.lane[data-l="${key}"]`);
    row.classList.toggle("active", Boolean(active));
    row.querySelector(".bar span").style.width = `${Math.max(0, Math.min(100, Math.round(share * 100)))}%`;
    $("ln-" + key).textContent = text;
  }
  function renderLanes() {
    const all = Array.from(cat.works.values());
    const total = all.length, det = all.filter((w) => w.detailed).length;
    const withCover = all.filter((w) => w.cover).length, checked = all.filter((w) => w.cover && w.coverInfo).length;
    const s = bgStatus, live = BG && bgRunning();
    const p = cat.progress;
    // Catálogo.
    let cShare = p && p.step === "pronto" ? 1 : 0, cText = p && p.step === "pronto" ? `completo · ${fmt(total)} obras` : total ? `${fmt(total)} obras até agora` : "ainda não lido";
    let cActive = false;
    if (live && s && (s.phase === "catalogo" || s.phase === "recentes")) {
      cActive = true;
      cShare = s.catPages ? s.catPage / s.catPages : s.phase === "recentes" ? 0.5 : 0;
      cText = `${s.phase === "recentes" ? "obras novas" : STEP_NAME[s.catStep] || "lendo"} · página ${fmt(s.catPage)}${s.catPages ? ` de ${fmt(s.catPages)}` : ""} · ${fmt(s.known)} obras`;
    } else if (jsCat) {
      cActive = true;
      cShare = jsCat.pages ? jsCat.page / jsCat.pages : 0.5;
      cText = `${STEP_NAME[jsCat.step] || jsCat.step} · página ${fmt(jsCat.page)}${jsCat.pages ? ` de ${fmt(jsCat.pages)}` : ""} · ${fmt(jsCat.count)} obras`;
    }
    lane("cat", cShare, cText, cActive);
    // Detalhes e capas: o que já entrou no catálogo; o ritmo vem do motor (ou da tela).
    const dRate = live && s ? s.detailsPerMin : rateOf(jsRate.det), cRate = live && s ? s.coversPerMin : rateOf(jsRate.cov);
    const dActive = live ? Boolean(s && s.detailsLeft > 0 && s.phase !== "pausa") : busy === "details" || (autoBusy && (autoStep === "suspeitas" || autoStep === "detalhes"));
    const vActive = live ? Boolean(s && s.coversLeft > 0) : busy === "covers" || (autoBusy && autoStep === "capas");
    lane("det", total ? det / total : 0, total ? `${fmt(det)} de ${fmt(total)}${dActive && dRate ? ` · ${fmt(dRate)}/min` : ""}` : "—", dActive);
    lane("cov", withCover ? checked / withCover : 0, withCover ? `${fmt(checked)} de ${fmt(withCover)}${vActive && cRate ? ` · ${fmt(cRate)}/min` : ""}` : "—", vActive);
  }

  /* ---------- Procura no celular (motor nativo, continua com o app fechado) ---------- */
  let BG = false, bgInfo = null, bgStatus = null, bgTimer = null, pulling = false, lastPull = 0, lastSave = 0;
  // Resultados já juntados na memória (mergedSeq) e já guardados no celular e confirmados ao motor (dup-bg-seq).
  let mergedSeq = ls.get("dup-bg-seq", 0);
  const FULL_EVERY_MS = 7 * 24 * 3600_000, RECENT_EVERY_MS = 6 * 3600_000;
  const bgRunning = () => Boolean(bgInfo && bgInfo.running);
  async function bgDetect() {
    if (!DupHttp || dupHttpBroken) return false;
    try { const r = await DupHttp.bgStatus(); bgApply(r); return true; } catch (e) { return false; }
  }
  function bgApply(r) {
    bgInfo = r || null;
    try { bgStatus = r && r.status ? JSON.parse(r.status) : null; } catch (_) { bgStatus = null; }
  }
  /** Plano para o motor: token, ritmo, o que ler do catálogo e as filas (suspeitas primeiro). */
  function bgPlan(opts) {
    const all = Array.from(cat.works.values());
    const p = cat.progress;
    const fullNeeded = !all.length || !p || p.step !== "pronto" || (p.finished && Date.now() - p.finished > FULL_EVERY_MS);
    const catalog = opts.catalog || (fullNeeded ? "full" : null);
    const det = [], seenIds = new Set();
    const push = (id) => { if (!seenIds.has(id) && cat.works.has(id) && !cat.works.get(id).detailed) { seenIds.add(id); det.push(id); } };
    suspects().forEach(push);
    (result && result.near ? result.near : []).forEach(push);
    if (settings.deep) undetailed().forEach(push);
    const cov = [], seenCov = new Set();
    const pushCov = (id) => { const w = cat.works.get(id); if (w && w.cover && !w.coverInfo && !seenCov.has(id)) { seenCov.add(id); cov.push([id, w.cover]); } };
    if (settings.covers) { suspectCovers().forEach(pushCov); uncheckedCovers().forEach(pushCov); }
    const ig = Dup.ignoreSet(settings.ignore), cores = new Set();
    for (const w of all) for (const t of [w.title].concat(w.alts || [])) { const c = Dup.analyze(t, ig).core; if (c.length >= 3) cores.add(c); }
    return {
      token: getToken(),
      gapMs: Math.round(Math.max(0.5, Number(settings.gap) || 1.5) * 1000),
      minGapMs: Math.round(Math.max(0.5, Number(settings.minGap) || 1) * 1000),
      coverGapMs: 250,
      coverThreads: Math.max(1, Math.min(6, Number(settings.coverThreads) || 3)),
      everyMs: RECENT_EVERY_MS,
      covers: Boolean(settings.covers),
      catalog,
      progress: catalog === "full" && p && p.step !== "pronto" ? p : catalog === "full" ? { step: "novo" } : undefined,
      pagers: cat.pagers || {},
      prevIds: cat.prevIds || {},
      known: all.map((w) => w.id),
      cores: Array.from(cores),
      skip: Array.from(Dup.skipWords(settings.ignore)),
      detailsQueue: det,
      coversQueue: cov,
    };
  }
  async function bgStart(opts) {
    if (!BG || !getToken()) return false;
    await bgPull(true);
    find();
    try {
      await DupHttp.bgStart({ plan: bgPlan(opts || {}) });
      ls.set("dup-bg-started", true);
      lastError = null;
      await bgTick(true);
      return true;
    } catch (e) {
      lastError = String((e && e.message) || e);
      toast(lastError);
      renderHero();
      return false;
    }
  }
  async function bgStop() {
    if (!BG) return;
    ls.set("dup-bg-started", false);
    try { await DupHttp.bgStop(); } catch (_) { /* já parado */ }
    toast("Procura parada. O que já foi lido está salvo.");
    setTimeout(() => bgTick(true), 600);
  }
  /**
   * Junta ao catálogo os resultados que o motor guardou (em pedaços). Guarda o catálogo e confirma ao motor (que
   * então apaga) no máximo a cada 30 s, ou já (save): nada é confirmado antes de estar guardado no celular.
   */
  async function bgPull(save) {
    if (!BG || pulling) return 0;
    pulling = true;
    lastPull = Date.now();
    let merged = 0, after = mergedSeq;
    const events = [];
    try {
      for (let round = 0; round < 400; round++) {
        const r = await DupHttp.bgPull({ after, max: 500 });
        let items = [];
        try { items = JSON.parse(r.data || "[]"); } catch (_) { items = []; }
        for (const it of items) { if (applyResult(it, events)) merged++; }
        after = Math.max(after, Number(r.last) || after);
        if (!r.more || !items.length) break;
      }
      mergedSeq = after;
      for (const h of events) addHistory(h);
      if (merged) { renderStats(); renderLanes(); }
      if (mergedSeq > ls.get("dup-bg-seq", 0) && (save || Date.now() - lastSave > 30_000)) await bgSave();
    } catch (e) {
      // Sem resultados agora: tenta na próxima.
    } finally {
      pulling = false;
    }
    return merged;
  }
  async function bgSave() {
    lastSave = Date.now();
    const upTo = mergedSeq;
    await saveCatalog();
    ls.set("dup-bg-seq", upTo);
    try { await DupHttp.bgAck({ upTo }); } catch (_) { /* confirma na próxima */ }
  }
  function applyResult(it, events) {
    const now = Date.now();
    switch (it && it.k) {
      case "w": { const w = MApi.toWork(it.o); if (w) MApi.mergeWorks(cat, [w]); return Boolean(w); }
      case "d": return Boolean(MApi.mergeDetail(cat, Number(it.id), it.o || null));
      case "c": return Boolean(MApi.applyCover(cat, Number(it.id), it.i || null, now));
      case "p": cat.progress = it.progress || cat.progress; cat.pagers = it.pagers || cat.pagers; cat.prevIds = it.prevIds || cat.prevIds; return true;
      case "r": events.push({ at: it.at || now, kind: "recentes", novas: it.added || 0 }); return true;
      case "fim": events.push({ at: now, kind: "fim", detalhes: it.details || 0, capas: it.covers || 0 }); return true;
      case "erro": lastError = it.text || "Erro na procura"; return false;
      default: return false;
    }
  }
  /** Olha o andamento do motor (a cada 2 s com o app na frente) e junta os resultados a cada 20 s. */
  async function bgTick(force) {
    if (!BG) return;
    try { bgApply(await DupHttp.bgStatus()); } catch (_) { return; }
    const seq = Number(bgInfo && bgInfo.seq) || 0;
    const idle = !bgRunning() || (bgStatus && bgStatus.phase === "espera");
    if (seq > mergedSeq && (force || idle || Date.now() - lastPull > (cat.works.size < 50 ? 2_000 : 5_000))) {
      const n = await bgPull(force || idle);
      if (n) scheduleFind(idle || force);
    }
    renderHero();
  }
  function bgLoop() {
    clearInterval(bgTimer);
    bgTimer = setInterval(() => { if (!document.hidden) bgTick(false); }, 2000);
  }
  $("bg-battery").onclick = async () => { try { await DupHttp.bgBattery(); } catch (_) { /* sem tela */ } setTimeout(() => bgTick(true), 1500); };
  $("bg-notif").onclick = async () => { try { await DupHttp.bgNotifications(); } catch (_) { /* sem permissão */ } setTimeout(() => bgTick(true), 1500); };

  /* ---------- Cartão principal: procurar sozinho ---------- */
  const AUTO_EVERY_MS = 6 * 3600_000, DEEP_AGAIN_MS = 15 * 60_000, JS_FULL_EVERY_MS = 3 * 24 * 3600_000, SUSPECT_MAX = 400, COVER_MAX = 300;
  let autoBusy = false, autoStep = null, lastError = null;
  function nextRun() { return ls.get("dup-auto-next", 0); }
  const PHASE_TITLE = { catalogo: "Lendo o catálogo", recentes: "Olhando as obras novas", detalhes: "Lendo sinopses", capas: "Conferindo capas", pausa: "Pausa", espera: "Tudo conferido", erro: "Procura parada", parado: "Procura parada" };
  function renderHero() {
    $("set-auto").checked = Boolean(settings.auto);
    const hero = $("hero");
    const offline = navigator.onLine === false;
    const s = bgStatus, live = BG && bgRunning();
    const working = live ? Boolean(s && s.phase !== "espera") : autoBusy || (Boolean(busy) && busy !== "test");
    hero.classList.toggle("on", working);
    document.body.classList.toggle("working", working);
    let title;
    if (live && s) title = PHASE_TITLE[s.phase] || "Procurando";
    else if (autoBusy) title = { catalogo: "Lendo o catálogo", suspeitas: "Conferindo suspeitas", capas: "Conferindo capas", detalhes: "Lendo detalhes" }[autoStep] || "Procurando";
    else title = busy && busy !== "test" ? "Trabalhando" : !getToken() ? "Falta o token" : offline ? "Sem internet" : !settings.auto ? "Automático desligado" : !cat.works.size ? "Pronto para começar" : BG && s && s.error ? "Procura parada" : "Tudo em dia";
    $("hero-title").textContent = title;
    $("hero-kicker").textContent = !settings.auto ? "Procurar sozinho (desligado)" : "Procurar sozinho";
    renderLanes();
    // Linha do segundo plano.
    const line = $("bg-line");
    line.hidden = !(BG && live && s);
    if (BG && live && s) {
      const leftMs = Math.max(s.detailsPerMin ? (s.detailsLeft / s.detailsPerMin) * 60_000 : 0, s.coversPerMin ? (s.coversLeft / s.coversPerMin) * 60_000 : 0);
      const parts = [s.phase === "pausa" && s.waitReason ? `${s.waitReason} · volta às ${hhmm(s.waitUntil)}` : "Rodando no celular, mesmo com o app fechado",
        s.phase !== "espera" && s.gapMs ? `ritmo ${(s.gapMs / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} s` : null,
        s.phase !== "espera" && leftMs > 60_000 ? `termina em ~${dur(leftMs)}` : null];
      $("bg-text").textContent = parts.filter(Boolean).join(" · ");
    }
    // Avisos: bateria e notificações (sem isso o Android pode parar a procura com o app fechado).
    const warn = $("bg-warn");
    const needBattery = BG && settings.auto && bgInfo && bgInfo.battery === false;
    const needNotif = BG && settings.auto && bgInfo && bgInfo.notifications === false;
    warn.hidden = !(needBattery || needNotif);
    $("bg-battery").hidden = !needBattery;
    $("bg-notif").hidden = !needNotif;
    $("bg-warn-text").textContent = needBattery ? "Para a procura continuar com o app fechado, deixe o Android não economizar bateria com ele." : "Permita os avisos para ver o andamento na barra de notificações.";
    // Texto de baixo.
    const left = undetailed().length, covLeft = settings.covers ? uncheckedCovers().length : 0;
    const missing = [settings.covers && covLeft ? `capas de ${fmt(covLeft)}` : null, settings.deep && left ? `detalhes de ${fmt(left)}` : null].filter(Boolean);
    let next;
    if (BG) {
      next = live && s && s.phase === "espera" ? `Tudo conferido. Próxima olhada nas obras novas às ${hhmm(s.nextAt)}, com o app aberto ou fechado.`
        : live ? "Pode fechar o app: a procura continua e avisa na barra de notificações. Parar guarda o que já foi feito."
        : !getToken() ? "Cole o token acima: o app lê o catálogo, procura as duplicadas e confere tudo sozinho."
        : !settings.auto ? "Ligue para ele procurar sozinho, mesmo com o app fechado."
        : (s && s.error) || lastError ? `Parou: ${(s && s.error) || lastError}` : "Toque em Atualizar agora para começar.";
    } else {
      const nr = nextRun();
      next = autoBusy ? "Deixe o app aberto. Parar guarda o que já foi feito."
        : !getToken() ? "Cole o token acima: o app lê o catálogo, procura as duplicadas e confere tudo sozinho."
        : offline ? "Volta sozinho quando a conexão voltar."
        : !settings.auto ? "Ligue para ele procurar ao abrir o app e de tempos em tempos."
        : [nr ? `Próxima procura às ${hhmm(nr)}` : "A próxima procura começa já", missing.length && cat.works.size ? `faltam ${missing.join(" e ")} obras` : null, lastError ? `último erro: ${lastError}` : null].filter(Boolean).join(" · ") + ".";
    }
    $("hero-next").textContent = next;
    const reading = live ? true : Boolean(busy) && busy !== "test";
    $("cat-stop").hidden = !(reading || autoBusy);
    $("auto-now").hidden = Boolean(!BG && (autoBusy || reading));
    $("auto-now").textContent = live ? "Buscar novas" : "Atualizar agora";
  }
  function addHistory(h) {
    history.unshift(h);
    history.length = Math.min(history.length, 20);
    ls.set("dup-history", history);
  }

  /* ---------- Procura na tela (navegador e celular sem o motor nativo) ---------- */
  async function autoCycle(force) {
    if (BG || autoBusy || busy || !settings.auto || !getToken()) return;
    if (navigator.onLine === false) { renderHero(); return; }
    if (!force && Date.now() < nextRun()) return;
    autoBusy = true; lastError = null;
    const t0 = Date.now(), before = cat.works.size, beforeKeys = new Set(result ? result.groups.map((g) => g.key) : []);
    const h = { at: t0, novas: 0, detalhes: 0, capas: 0, grupos: 0, novos: 0 };
    const step = (s) => { autoStep = s; renderHero(); };
    let ok = false;
    try {
      // 1) Catálogo: continua a leitura parada, relê tudo a cada 3 dias, senão só as obras novas.
      step("catalogo");
      const p = cat.progress;
      const fullAge = p && p.finished ? Date.now() - p.finished : Infinity;
      if (!cat.works.size || !p || p.step !== "pronto" || fullAge > JS_FULL_EVERY_MS) {
        if (p && p.step === "pronto") cat.progress = null;
        if (!(await runTask("catalog", (r) => r.readCatalog(cat, saveCatalog)))) return;
        if (!(cat.progress && cat.progress.buscaOk) && (!cat.lettersDone || (cat.progress && cat.progress.finished && cat.lettersDone < cat.progress.finished))) {
          if (!(await runTask("letters", (r) => r.readLetters(cat, saveCatalog, cat.lettersNext)))) return;
        }
      } else if (!(await runTask("recent", (r) => r.readRecent(cat, saveCatalog)))) return;
      h.novas = Math.max(0, cat.works.size - before);
      find();
      // 2) Suspeitas e quase suspeitas: detalhes (nomes alternativos, sinopse, autores, capítulos).
      step("suspeitas");
      const sus = Array.from(new Set(suspects().concat(result && result.near ? result.near.slice(0, 60) : []))).slice(0, SUSPECT_MAX);
      if (sus.length) {
        if (!(await runTask("details", (r) => r.readDetails(cat, sus, saveCatalog)))) return;
        h.detalhes += sus.length;
        find();
      }
      // 3) Capas: primeiro as das suspeitas, depois mais um pouco de todas.
      step("capas");
      const cov = settings.covers ? Array.from(new Set(suspectCovers().slice(0, COVER_MAX).concat(uncheckedCovers().slice(0, Math.max(20, Number(settings.coverPer) || 300))))) : [];
      if (cov.length) {
        if (!(await runTask("covers", (r) => r.readCovers(cat, cov, saveCatalog, coverCheck, coverOpts())))) return;
        h.capas = cov.length;
        find();
      }
      // 4) Detalhes de todas, aos poucos.
      step("detalhes");
      const rest = settings.deep ? undetailed().slice(0, Math.max(20, Number(settings.deepPer) || 250)) : [];
      if (rest.length) {
        if (!(await runTask("details", (r) => r.readDetails(cat, rest, saveCatalog)))) return;
        h.detalhes += rest.length;
        find();
      }
      ok = true;
    } finally {
      const after = result ? result.groups : [];
      h.grupos = after.length;
      h.novos = after.filter((g) => !beforeKeys.has(g.key) && !seen.has(g.key)).length;
      h.ms = Date.now() - t0;
      h.problemas = problems ? problems.items.length : 0;
      if (!ok && lastError) h.err = lastError;
      if (ok || lastError) addHistory(h);
      const more = !(cat.progress && cat.progress.step === "pronto") || (settings.deep && undetailed().length > 0) || (settings.covers && uncheckedCovers().length > 0);
      ls.set("dup-auto-next", Date.now() + (!ok && lastError ? 30 * 60_000 : more ? DEEP_AGAIN_MS : AUTO_EVERY_MS));
      if (ok) ls.set("dup-auto-last", Date.now());
      autoBusy = false; autoStep = null;
      renderPanel();
      if (ok) toast(`${h.novos ? `${fmt(h.novos)} grupo(s) novo(s) de possíveis duplicadas` : `Procura feita: ${fmt(h.grupos)} grupo(s), nenhum novo`} · ${fmt(h.problemas)} problema(s).`);
    }
  }
  $("set-auto").onchange = () => {
    settings.auto = $("set-auto").checked; saveSettings();
    if (BG) { if (settings.auto) bgStart({}); else bgStop(); }
    else if (settings.auto) autoCycle(true); else if (reader) reader.stop();
    renderHero();
  };
  $("auto-now").onclick = () => {
    if (!settings.auto) { settings.auto = true; saveSettings(); }
    if (BG) bgStart({ catalog: cat.progress && cat.progress.step === "pronto" ? "recent" : null }).then((ok) => ok && toast("Olhando as obras novas no site…"));
    else autoCycle(true);
  };
  setInterval(() => { autoCycle(false); if (!autoBusy) renderHero(); }, 60_000);
  document.addEventListener("visibilitychange", () => {
    // Indo para trás: guarda o que já juntou (e confirma ao motor).
    if (document.visibilityState !== "visible") { if (BG && mergedSeq > ls.get("dup-bg-seq", 0)) bgSave(); return; }
    if (BG) bgTick(true); else autoCycle(false);
  });
  window.addEventListener("online", () => { renderHero(); if (!BG) autoCycle(true); });
  window.addEventListener("offline", () => renderHero());

  /* ---------- Ferramentas (à mão) ---------- */
  $("cat-read").onclick = async () => {
    if (BG) { cat.progress = null; if (await bgStart({ catalog: "full" })) toast("Lendo o catálogo inteiro de novo, em segundo plano."); return; }
    if (cat.progress && cat.progress.step === "pronto") cat.progress = null;
    if (await runTask("catalog", (r) => r.readCatalog(cat, saveCatalog))) { toast(`Leitura completa: ${fmt(cat.works.size)} obras.`); find(); }
  };
  $("cat-letters").onclick = async () => {
    if (await runTask("letters", (r) => r.readLetters(cat, saveCatalog, cat.lettersNext))) { toast(`Busca por letra completa: ${fmt(cat.works.size)} obras.`); find(); }
  };
  $("find-run").onclick = () => { find(); toast(result && result.groups.length ? `${fmt(result.groups.length)} grupo(s) de possíveis duplicadas.` : "Nenhuma duplicada encontrada."); };
  $("deep-run").onclick = async () => {
    const ids = suspects();
    if (!ids.length) { toast("As suspeitas já estão conferidas."); return; }
    if (BG) { if (await bgStart({})) toast("Suspeitas na frente da fila do segundo plano."); return; }
    if (await runTask("details", (r) => r.readDetails(cat, ids, saveCatalog))) { find(); toast("Suspeitas conferidas."); }
  };
  $("cover-run").onclick = async () => {
    const ids = Array.from(new Set(suspectCovers().concat(uncheckedCovers().slice(0, Math.max(20, Number(settings.coverPer) || 300)))));
    if (!ids.length) { toast("Todas as capas já foram conferidas."); return; }
    if (BG) { if (await bgStart({})) toast("Conferindo as capas em segundo plano."); return; }
    if (await runTask("covers", (r) => r.readCovers(cat, ids, saveCatalog, coverCheck, coverOpts()))) { find(); toast(`${fmt(ids.length)} capa(s) conferida(s).`); }
  };
  document.querySelectorAll(".levels [data-go]").forEach((b) => { b.onclick = () => { setFilter(b.dataset.go); showTab("grupos"); }; });
  document.querySelectorAll("[data-gp]").forEach((b) => { b.onclick = () => { setPFilter(b.dataset.gp); showTab("problemas"); }; });
  $("news-all").onclick = () => { setFilter("novas"); showTab("grupos"); };

  /* ---------- Duplicadas: blocos, seleção, copiar e deletar ---------- */
  const PAGE = 25;
  let gFilter = "todas", gShown = PAGE, freshKeys = new Set();
  const selected = new Set();
  function setFilter(f) {
    gFilter = f; gShown = PAGE;
    clearSelection();
    document.querySelectorAll(".filters [data-f]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.f === f)));
  }
  document.querySelectorAll(".filters [data-f]").forEach((b) => { b.onclick = () => { setFilter(b.dataset.f); renderGroups(false, true); }; });
  $("g-q").oninput = () => { gShown = PAGE; renderGroups(false, false); };
  $("g-sort").onchange = () => { gShown = PAGE; renderGroups(false, true); };
  const queryOf = (raw) => { const m = /obra\/(\d+)/.exec(raw); return m ? m[1] : Dup.normalize(raw); };
  function filteredGroups() {
    if (!result) return [];
    // Link colado (mediocrescan.com/obra/123) vale como o ID.
    const q = queryOf($("g-q").value);
    const gs = result.groups.filter((g) => (gFilter === "todas" || (gFilter === "novas" ? freshKeys.has(g.key) : g.level === gFilter))
      && (!q || g.works.some((w) => String(w.id) === q || Dup.normalize([full(w).title].concat(full(w).alts || []).join(" ")).includes(q))));
    const caps = (g) => Math.max(...g.works.map((w) => Number(full(w).chapters) || 0));
    const sort = $("g-sort").value;
    if (sort === "novas") gs.sort((a, b) => (freshKeys.has(b.key) ? 1 : 0) - (freshKeys.has(a.key) ? 1 : 0) || b.score - a.score);
    else if (sort === "obras") gs.sort((a, b) => b.works.length - a.works.length || b.score - a.score);
    else if (sort === "caps") gs.sort((a, b) => caps(b) - caps(a) || b.score - a.score);
    return gs;
  }
  function filteredDeleted() {
    const q = queryOf($("g-q").value);
    return deleted.slice().reverse().filter((d) => !q || d.ids.some((id) => String(id) === q) || d.titles.some((t) => Dup.normalize(t).includes(q)));
  }
  /** Uma obra do grupo: capa, título, link, dados e se é a sugerida para manter. */
  function workCol(w, g, compact) {
    const f = full(w), keep = g.keep && g.keep.id === w.id;
    const alts = (f.alts || []).slice(0, 2).join(" · ");
    const m = meta(f);
    const facts = [f.detailed ? null : "sem detalhes ainda", f.authors && f.authors.length ? `por ${f.authors.slice(0, 2).join(", ")}` : null].filter(Boolean).join(" · ");
    return el("div", { className: `wcol${keep ? " keep" : ""}${compact ? " row-mode" : ""}` },
      cover(f, "wcover"),
      el("div", { className: "wbody" },
        keep ? el("span", { className: "keep-tag", text: `Manter: ${g.keep.why}` }) : null,
        el("p", { className: "t", text: f.title }),
        linkEl(f),
        m ? el("p", { className: "m", text: m }) : null,
        alts ? el("p", { className: "m alt", text: `Também: ${alts}` }) : null,
        facts ? el("p", { className: "m dim", text: facts }) : null));
  }
  /** Sinopse com as palavras e nomes em comum marcados. */
  function marked(text, words) {
    const p = el("p", { className: "syn" });
    const set = new Set(words);
    const cut = text.length > 420 ? text.slice(0, 420) + "…" : text;
    for (const piece of cut.split(/(\s+)/)) {
      const n = Dup.normalize(piece);
      const hit = n && (set.has(n) || n.split(" ").some((x) => set.has(x)) || set.has(n.replace(/ /g, "")));
      p.append(hit ? el("mark", { text: piece }) : document.createTextNode(piece));
    }
    return p;
  }
  /** Detalhes da nota: como ela foi feita, sinopses lado a lado e cada par do grupo. */
  function groupDetails(g) {
    const box = el("div", { className: "more-body" });
    const top = g.pairs[0];
    if (top.parts && top.parts.length) {
      const ul = el("ul", { className: "parts" });
      top.parts.forEach((x) => ul.append(el("li", { className: x.pts < 0 ? "minus" : x.base ? "base" : "plus" },
        el("span", { text: x.text }), el("b", { text: x.base ? String(x.pts) : `${x.pts > 0 ? "+" : "−"}${Math.abs(x.pts)}` }))));
      ul.append(el("li", { className: "total" }, el("span", { text: "Nota final (de 0 a 100)" }), el("b", { text: String(top.score) })));
      box.append(el("h4", { text: "Como a nota foi feita" }), ul);
    }
    const a = full(top.a), b = full(top.b);
    if (a.desc || b.desc) {
      const d = top.desc;
      const words = d ? (d.words || []).concat(d.people || []) : [];
      const head = d ? [d.sh ? `${Math.round(d.sh * 100)}% dos trechos iguais` : null, d.j ? `${Math.round(d.j * 100)}% das palavras` : null, d.people && d.people.length ? `nomes em comum: ${d.people.slice(0, 5).join(", ")}` : null].filter(Boolean).join(" · ") : "";
      box.append(el("h4", { text: "Sinopses" }), head ? el("p", { className: "m", text: head }) : null,
        el("div", { className: "syn-pair" },
          el("div", {}, el("p", { className: "syn-t", text: a.title }), a.desc ? marked(a.desc, words) : el("p", { className: "syn empty", text: a.detailed ? "Sem sinopse." : "Sinopse ainda não lida." })),
          el("div", {}, el("p", { className: "syn-t", text: b.title }), b.desc ? marked(b.desc, words) : el("p", { className: "syn empty", text: b.detailed ? "Sem sinopse." : "Sinopse ainda não lida." }))));
    }
    if (top.coverDist != null) box.append(el("p", { className: "m", text: top.coverDist <= 5 ? `Capas: a mesma imagem (diferença de ${top.coverDist} de 64 pontos).` : `Capas: diferença de ${top.coverDist} de 64 pontos${top.coverDist >= 28 ? " (bem diferentes)" : ""}.` }));
    if (g.pairs.length > 1) {
      const ul = el("ul", { className: "pairs" });
      g.pairs.slice(0, 8).forEach((p) => ul.append(el("li", {}, el("b", { text: String(p.score) }), ` ${full(p.a).title} × ${full(p.b).title}: ${p.reasons[0] || ""}`)));
      box.append(el("h4", { text: "Cada par do grupo" }), ul);
    }
    return box;
  }
  function pickBox(key, label) {
    const on = selected.has(key);
    const b = el("button", { type: "button", className: "pick", role: "checkbox", "aria-checked": String(on), "aria-label": label });
    b.onclick = (e) => { e.stopPropagation(); toggleSelect(key, b); };
    return b;
  }
  function groupCard(g, animate) {
    const li = el("li", { className: `group ${g.level}${selected.has(g.key) ? " selected" : ""}`, "data-key": g.key });
    li.append(el("div", { className: "g-head" },
      pickBox(g.key, `Selecionar o bloco ${g.works.map((w) => full(w).title).join(" e ")}`),
      ring(g.score, g.level, animate),
      el("div", { className: "g-title" },
        el("span", { className: "lvl-name", text: LEVEL_NAME[g.level] }),
        el("span", { className: "g-n", text: `${g.works.length} obras${g.pairs[0].desc && g.pairs[0].desc.people && g.pairs[0].desc.people.length >= 2 ? " · mesmos personagens" : ""}` })),
      freshKeys.has(g.key) ? el("span", { className: "new-tag", text: "Nova" }) : null));
    // Duas obras: lado a lado. Três ou mais: uma por linha.
    const two = g.works.length === 2;
    li.append(el("div", { className: two ? "compare" : "rows" }, ...g.works.map((w) => workCol(w, g, !two))));
    // Motivos em etiquetas; avisos em amarelo.
    const reasons = new Set(), notes = new Set();
    g.pairs.slice(0, 4).forEach((p) => { p.reasons.slice(0, 4).forEach((r) => reasons.add(r)); p.notes.forEach((n) => notes.add(n)); });
    li.append(el("ul", { className: "chips-why" }, ...Array.from(reasons).slice(0, 6).map((r) => el("li", { text: r }))));
    if (notes.size) li.append(el("ul", { className: "why" }, ...Array.from(notes).map((n) => el("li", { className: "warn", text: n + "." }))));
    // Detalhes (abre só quando pedir; monta na hora).
    const more = el("details", { className: "more" }, el("summary", { text: "Ver detalhes da nota e as sinopses" }));
    more.addEventListener("toggle", () => { if (more.open && !more.querySelector(".more-body")) more.append(groupDetails(g)); });
    li.append(more);
    const copy = el("button", { type: "button", className: "btn ghost small", text: "Copiar links" });
    copy.onclick = () => copyText(copyBlocks([g], "links"), "Links copiados.");
    const no = el("button", { type: "button", className: "btn ghost small", text: "Não é duplicada" });
    no.onclick = () => {
      const keys = g.pairs.map((p) => Dup.pairKey(String(p.a.id), String(p.b.id)));
      leave(li, () => {
        keys.forEach((k) => dismissed.add(k)); saveDismissed(); find();
        toast("Grupo dispensado.", { label: "Desfazer", run: () => { keys.forEach((k) => dismissed.delete(k)); saveDismissed(); find(); } });
      });
    };
    const del = el("button", { type: "button", className: "btn ghost small danger", text: "Deletar" });
    del.onclick = () => leave(li, () => deleteGroups([g]));
    li.append(el("div", { className: "g-acts" }, copy, no, del));
    return li;
  }
  /** Card que sai (some deslizando) antes de a lista mudar. */
  function leave(li, then) {
    if (reduced()) { then(); return; }
    li.classList.add("leaving");
    setTimeout(then, 220);
  }
  function deletedCard(d) {
    const key = "del:" + d.key;
    const li = el("li", { className: `group deleted ${d.level}${selected.has(key) ? " selected" : ""}`, "data-key": key });
    li.append(el("div", { className: "g-head" },
      pickBox(key, `Selecionar o bloco apagado ${d.titles.join(" e ")}`),
      ring(d.score, d.level, false),
      el("div", { className: "g-title" }, el("span", { className: "lvl-name", text: "Apagado" }), el("span", { className: "g-n", text: `em ${when(d.at)} · ${d.ids.length} obras` }))));
    const ul = el("ul", { className: "del-works" });
    d.ids.forEach((id, i) => ul.append(el("li", {}, el("span", { className: "t", text: `${d.titles[i] || id}${d.keep === id ? " (manter)" : ""}` }), el("a", { className: "lnk", href: OBRA_URL + id, rel: "noopener", text: `mediocrescan.com/obra/${id}` }))));
    li.append(ul);
    const back = el("button", { type: "button", className: "btn ghost small", text: "Restaurar" });
    back.onclick = () => leave(li, () => restoreDeleted([d.key]));
    const copy = el("button", { type: "button", className: "btn ghost small", text: "Copiar links" });
    copy.onclick = () => copyText(copyDeleted([d]), "Links copiados.");
    li.append(el("div", { className: "g-acts" }, copy, back));
    return li;
  }
  /** opening: ao abrir a aba, guarda quais eram novas (para marcar) e passa a considerar todas como vistas. */
  function renderGroups(opening, animate) {
    if (opening && result) {
      freshKeys = new Set(newGroups().map((g) => g.key));
      result.groups.forEach((g) => seen.add(g.key));
      ls.set("dup-seen", Array.from(seen).slice(-5000));
      renderPanel();
    }
    const list = $("g-list");
    list.innerHTML = "";
    $("f-del-n").textContent = deleted.length ? String(deleted.length) : "";
    $("g-sort").hidden = gFilter === "apagados";
    $("g-hint").textContent = gFilter === "apagados" ? "Selecione blocos apagados para restaurar ou copiar os links." : "Toque no quadradinho de cada bloco para selecionar vários e copiar ou deletar de uma vez.";
    if (gFilter === "apagados") {
      const ds = filteredDeleted();
      $("g-empty").hidden = ds.length > 0;
      $("g-empty").textContent = "Nenhum bloco apagado. Selecione blocos na lista e toque em Deletar: eles vêm para cá e podem voltar.";
      $("g-meta").textContent = `${fmt(ds.length)} bloco(s) apagado(s)`;
      ds.slice(0, gShown).forEach((d) => list.append(deletedCard(d)));
      $("g-more").hidden = ds.length <= gShown;
      $("g-more").textContent = `Mostrar mais (${fmt(ds.length - gShown)})`;
      $("g-copy").hidden = true;
    } else {
      const gs = filteredGroups();
      $("g-empty").hidden = gs.length > 0;
      $("g-empty").textContent = !cat.works.size ? "Ainda não há catálogo: o Painel lê sozinho assim que o token estiver salvo." : !result ? "Toque em Atualizar agora no Painel." : "Nenhum grupo com esse filtro.";
      $("g-meta").textContent = result ? `${fmt(gs.length)} bloco(s)${freshKeys.size ? ` · ${fmt(freshKeys.size)} novo(s)` : ""}${dismissed.size ? ` · ${fmt(dismissed.size)} par(es) dispensado(s)` : ""}` : "";
      gs.slice(0, gShown).forEach((g) => list.append(groupCard(g, animate)));
      $("g-more").hidden = gs.length <= gShown;
      $("g-more").textContent = `Mostrar mais (${fmt(gs.length - gShown)})`;
      $("g-copy").hidden = !gs.length;
    }
    if (animate) cascade(list);
    renderSelbar();
  }
  $("g-more").onclick = () => { gShown += PAGE; renderGroups(false, false); };
  $("g-copy").onclick = () => copyText(copyBlocks(filteredGroups(), "relatorio"), "Relatório copiado.");

  /** Texto para copiar: "links" (todas as obras), "apagar" (só as que não são a marcada Manter) ou "relatorio". */
  function copyBlocks(gs, how) {
    const lines = [];
    if (how === "relatorio") lines.push(`Duplicadas da MediocreScan — ${new Date().toLocaleString("pt-BR")}`, `${gs.length} bloco(s) em ${cat.works.size} obras`, "");
    gs.forEach((g, i) => {
      const keepId = g.keep && g.keep.id;
      if (how === "apagar") {
        g.works.filter((w) => w.id !== keepId).forEach((w) => lines.push(`${full(w).title} — ${workUrl(w)}`));
        return;
      }
      if (how === "relatorio") lines.push(`${i + 1}. ${LEVEL_NAME[g.level]} (${g.score})`);
      g.works.forEach((w) => lines.push(`${how === "relatorio" ? "   " : ""}${full(w).title}${keepId === w.id ? " (manter)" : ""} — ${workUrl(w)}`));
      if (how === "relatorio") lines.push(`   Por quê: ${g.pairs[0].reasons.join("; ")}${g.pairs[0].notes.length ? ` | ${g.pairs[0].notes.join("; ")}` : ""}`);
      lines.push("");
    });
    return lines.join("\n").trim();
  }
  function copyDeleted(ds) {
    return ds.map((d) => d.ids.map((id, i) => `${d.titles[i] || id}${d.keep === id ? " (manter)" : ""} — ${OBRA_URL}${id}`).join("\n")).join("\n\n");
  }
  function deleteGroups(gs) {
    const snaps = gs.map((g) => ({
      key: g.key, ids: g.works.map((w) => w.id), titles: g.works.map((w) => full(w).title), score: g.score, level: g.level,
      keep: g.keep ? g.keep.id : null, pairs: g.pairs.map((p) => Dup.pairKey(String(p.a.id), String(p.b.id))), at: Date.now(),
    }));
    const keys = new Set(snaps.map((s) => s.key));
    deleted = deleted.filter((d) => !keys.has(d.key)).concat(snaps);
    saveDeleted();
    gs.forEach((g) => selected.delete(g.key));
    find();
    toast(`${gs.length} bloco${gs.length === 1 ? "" : "s"} deletado${gs.length === 1 ? "" : "s"} da lista.`, { label: "Desfazer", run: () => restoreDeleted(Array.from(keys)) });
  }
  function restoreDeleted(keys) {
    const set = new Set(keys);
    const n = deleted.filter((d) => set.has(d.key)).length;
    deleted = deleted.filter((d) => !set.has(d.key));
    saveDeleted();
    keys.forEach((k) => selected.delete("del:" + k));
    find();
    if (tab === "grupos") renderGroups(false, false);
    toast(`${n} bloco${n === 1 ? "" : "s"} de volta na lista.`);
  }

  // Seleção de blocos.
  function toggleSelect(key, box) {
    if (selected.has(key)) selected.delete(key); else selected.add(key);
    const on = selected.has(key);
    if (box) {
      box.setAttribute("aria-checked", String(on));
      const card = box.closest(".group");
      if (card) card.classList.toggle("selected", on);
      if (!reduced()) { box.classList.remove("pop"); void box.offsetWidth; box.classList.add("pop"); }
    }
    renderSelbar();
  }
  function clearSelection() {
    if (!selected.size) return;
    selected.clear();
    document.querySelectorAll(".group.selected").forEach((c) => c.classList.remove("selected"));
    document.querySelectorAll(".pick[aria-checked=true]").forEach((b) => b.setAttribute("aria-checked", "false"));
    renderSelbar();
  }
  function selectedGroups() { return result ? result.groups.filter((g) => selected.has(g.key)) : []; }
  function selectedDeleted() { return deleted.filter((d) => selected.has("del:" + d.key)); }
  function renderSelbar() {
    const bar = $("selbar");
    const n = selected.size;
    const inDeleted = gFilter === "apagados";
    bar.classList.toggle("show", n > 0 && tab === "grupos");
    bar.setAttribute("aria-hidden", String(!(n > 0 && tab === "grupos")));
    document.body.classList.toggle("selecting", n > 0 && tab === "grupos");
    $("sel-n").textContent = `${n} selecionado${n === 1 ? "" : "s"}`;
    $("sel-del").textContent = inDeleted ? "Restaurar" : "Deletar";
    const visible = inDeleted ? filteredDeleted().map((d) => "del:" + d.key) : filteredGroups().map((g) => g.key);
    const all = visible.length > 0 && visible.every((k) => selected.has(k));
    $("sel-all").textContent = all ? "Nenhum" : `Todos (${fmt(visible.length)})`;
  }
  $("sel-all").onclick = () => {
    const inDeleted = gFilter === "apagados";
    const visible = inDeleted ? filteredDeleted().map((d) => "del:" + d.key) : filteredGroups().map((g) => g.key);
    const all = visible.every((k) => selected.has(k));
    if (all) visible.forEach((k) => selected.delete(k)); else visible.forEach((k) => selected.add(k));
    // Mostra todos os selecionados na tela.
    if (!all) gShown = Math.max(gShown, Math.min(visible.length, 200));
    renderGroups(false, false);
  };
  $("sel-close").onclick = () => clearSelection();
  $("sel-copy").onclick = () => {
    if (gFilter === "apagados") { copyText(copyDeleted(selectedDeleted()), "Links copiados."); return; }
    const gs = selectedGroups();
    openSheet(`Copiar ${gs.length} bloco${gs.length === 1 ? "" : "s"}`, "Escolha o que vai para a área de transferência.", [
      { label: "Links de todas as obras", run: () => copyText(copyBlocks(gs, "links"), "Links copiados.") },
      { label: "Só as para apagar (sem a marcada Manter)", run: () => copyText(copyBlocks(gs, "apagar"), "Links das obras para apagar copiados.") },
      { label: "Relatório completo (com os motivos)", run: () => copyText(copyBlocks(gs, "relatorio"), "Relatório copiado.") },
    ]);
  };
  $("sel-del").onclick = () => {
    if (gFilter === "apagados") { restoreDeleted(selectedDeleted().map((d) => d.key)); return; }
    const gs = selectedGroups();
    if (!gs.length) return;
    openSheet(`Deletar ${gs.length} bloco${gs.length === 1 ? "" : "s"}?`, "Eles saem da lista e não voltam nas próximas procuras. Ficam em “Apagados”, de onde dá para restaurar. Nada é apagado no site.", [
      { label: `Deletar ${gs.length} bloco${gs.length === 1 ? "" : "s"}`, kind: "danger", run: () => {
        const cards = gs.map((g) => document.querySelector(`.group[data-key="${CSS.escape(g.key)}"]`)).filter(Boolean);
        cards.forEach((c) => c.classList.add("leaving"));
        setTimeout(() => deleteGroups(gs), reduced() ? 0 : 220);
      } },
    ]);
  };

  /* ---------- Folha de escolhas (copiar, confirmar) ---------- */
  function openSheet(title, text, actions) {
    const sheet = $("sheet");
    $("sheet-title").textContent = title;
    $("sheet-text").textContent = text || "";
    const box = $("sheet-actions");
    box.innerHTML = "";
    actions.forEach((a) => {
      const b = el("button", { type: "button", className: `btn ${a.kind === "danger" ? "danger-fill" : "ghost"} wide-btn`, text: a.label });
      b.onclick = () => { closeSheet(); a.run(); };
      box.append(b);
    });
    const cancel = el("button", { type: "button", className: "link", text: "Cancelar" });
    cancel.onclick = closeSheet;
    box.append(cancel);
    sheet.hidden = false;
    requestAnimationFrame(() => sheet.classList.add("open"));
    box.querySelector("button").focus();
  }
  function closeSheet() {
    const sheet = $("sheet");
    sheet.classList.remove("open");
    setTimeout(() => { if (!sheet.classList.contains("open")) sheet.hidden = true; }, reduced() ? 0 : 220);
  }
  $("sheet-back").onclick = closeSheet;
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("sheet").hidden) closeSheet(); });

  /* ---------- Problemas: sinopses zuadas e capas quebradas ---------- */
  let pFilter = "todas", pShown = PAGE;
  function setPFilter(f) {
    pFilter = f; pShown = PAGE;
    document.querySelectorAll(".pfilters [data-p]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.p === f)));
  }
  document.querySelectorAll(".pfilters [data-p]").forEach((b) => { b.onclick = () => { setPFilter(b.dataset.p); renderProblems(true); }; });
  $("p-q").oninput = () => { pShown = PAGE; renderProblems(false); };
  function filteredProblems() {
    if (!problems) return [];
    const q = queryOf($("p-q").value);
    return problems.items.filter((it) => (pFilter === "todas" || (pFilter === "graves" ? it.grave : it.kind === pFilter))
      && (!q || String(it.w.id) === q || Dup.normalize(it.w.title).includes(q)));
  }
  const kb = (b) => (b >= 1048576 ? `${(b / 1048576).toFixed(1).replace(".", ",")} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
  /** Linha com o que a conferência da capa achou (tamanho, tipo, peso). */
  function coverLine(c) {
    if (!c) return null;
    if (c.s === -1) return c.err || null;
    if (!(c.s >= 200 && c.s < 300)) return c.s ? `Resposta ${c.s}${c.err ? ` · ${c.err}` : ""}` : `Sem resposta${c.err ? ` · ${c.err}` : ""}`;
    return [c.w && c.h ? `${c.w}×${c.h} px` : null, c.t ? String(c.t).split(";")[0].replace("image/", "") : null, c.b ? kb(c.b) : null].filter(Boolean).join(" · ");
  }
  function problemCard(it) {
    const f = full(it.w);
    const li = el("li", { className: `prob-card${it.grave ? " grave" : ""}` });
    const kind = el("span", { className: "kind", text: it.kind === "desc" ? "Sinopse" : "Capa" });
    const head = el("div", { className: "wbody" },
      el("div", { className: "p-head" }, kind, it.grave ? el("span", { className: "grave-tag", text: "Grave" }) : null),
      el("p", { className: "t", text: f.title }), linkEl(f));
    li.append(el("div", { className: "p-top" }, cover(f, "pcover"), head));
    const ul = el("ul", { className: "issues" });
    it.issues.forEach((x) => {
      const refs = (x.refs || []).map((id) => cat.works.get(id) || cat.works.get(Number(id))).filter(Boolean);
      ul.append(el("li", { className: x.level }, x.text, ...refs.map((o) => el("span", { className: "ref" }, " — ", el("a", { className: "lnk", href: workUrl(o), rel: "noopener", text: o.title })))));
    });
    li.append(ul);
    if (it.kind === "desc" && f.desc) li.append(el("blockquote", { className: "snip", text: f.desc.length > 260 ? f.desc.slice(0, 260) + "…" : f.desc }));
    if (it.kind === "cover") { const cl = coverLine(f.coverInfo); if (cl) li.append(el("p", { className: "m", text: cl })); }
    const copy = el("button", { type: "button", className: "btn ghost small", text: "Copiar link" });
    copy.onclick = () => copyText(`${f.title}\n${workUrl(f)}\n${it.issues.map((x) => "- " + x.text).join("\n")}`, "Link copiado.");
    const again = el("button", { type: "button", className: "btn ghost small", text: "Conferir de novo" });
    again.onclick = () => recheck(f.id, it.kind);
    const ok = el("button", { type: "button", className: "btn ghost small", text: "Ignorar" });
    ok.onclick = () => leave(li, () => {
      okProblems.add(it.key); saveOk(); find();
      toast("Problema ignorado.", { label: "Desfazer", run: () => { okProblems.delete(it.key); saveOk(); find(); } });
    });
    li.append(el("div", { className: "g-acts" }, copy, again, ok));
    return li;
  }
  /** Lê de novo os detalhes ou a capa de uma obra (depois de arrumar no site). */
  async function recheck(id, kind) {
    if (busy) { toast(autoBusy ? "Espere a procura automática terminar (ou toque em Parar no Painel)." : "Espere a leitura terminar."); return; }
    const done = await runTask("recheck", async (r) => {
      if (kind === "desc") await r.readDetails(cat, [id], saveCatalog, { force: true });
      else await r.readCovers(cat, [id], saveCatalog, coverCheck, coverOpts(true));
    });
    if (!done) return;
    find();
    const still = problems && problems.items.some((it) => it.w.id === id && it.kind === kind);
    toast(still ? "Conferido: o problema continua." : "Conferido: está tudo certo agora.");
  }
  function renderProblems(animate) {
    const list = $("p-list");
    list.innerHTML = "";
    const warn = $("p-warn");
    warn.innerHTML = "";
    (problems ? problems.warnings : []).forEach((w) => warn.append(el("p", { text: w })));
    warn.hidden = !warn.childElementCount;
    const its = filteredProblems();
    const c = problems ? problems.counts : null;
    $("p-cover-meta").textContent = c ? `Sinopses conferidas em ${fmt(c.descChecked)} de ${fmt(c.total)} obras e capas em ${fmt(c.coverChecked)}. O resto entra aos poucos na procura automática.` : "";
    $("p-meta").textContent = c ? `${fmt(its.length)} obra(s)${okProblems.size ? ` · ${fmt(okProblems.size)} ignorado(s)` : ""}` : "";
    $("p-empty").hidden = its.length > 0;
    $("p-empty").textContent = !cat.works.size ? "Ainda não há catálogo: o Painel lê sozinho assim que o token estiver salvo." : !problems ? "Toque em Atualizar agora no Painel." : problems.items.length ? "Nenhum problema com esse filtro." : "Nenhum problema nas obras conferidas até agora.";
    its.slice(0, pShown).forEach((it) => list.append(problemCard(it)));
    $("p-more").hidden = its.length <= pShown;
    $("p-more").textContent = `Mostrar mais (${fmt(its.length - pShown)})`;
    $("p-copy").hidden = !its.length;
    if (animate) cascade(list);
  }
  $("p-more").onclick = () => { pShown += PAGE; renderProblems(false); };
  $("p-copy").onclick = () => {
    const its = filteredProblems();
    const lines = [`Problemas na MediocreScan — ${new Date().toLocaleString("pt-BR")}`, `${its.length} obra(s)`, ""];
    its.forEach((it, i) => {
      lines.push(`${i + 1}. ${it.kind === "desc" ? "Sinopse" : "Capa"}${it.grave ? " (grave)" : ""}: ${full(it.w).title} — ${workUrl(it.w)}`);
      it.issues.forEach((x) => lines.push(`   - ${x.text}`));
      lines.push("");
    });
    copyText(lines.join("\n"), "Relatório copiado.");
  };

  /* ---------- Catálogo ---------- */
  let cShown = 50;
  $("c-q").oninput = () => { cShown = 50; renderCatalog(); };
  function groupOf(id) { return result ? result.groups.find((g) => g.works.some((w) => w.id === id)) : null; }
  function renderCatalog() {
    const typed = $("c-q").value.trim(), fromLink = /obra\/(\d+)/.exec(typed);
    const q = fromLink ? fromLink[1] : typed;
    const all = Array.from(cat.works.values());
    const list = $("c-list");
    list.innerHTML = "";
    if (!all.length) { $("c-meta").textContent = "Ainda não há catálogo: o Painel lê sozinho assim que o token estiver salvo."; $("c-more").hidden = true; return; }
    const hits = !q ? [] : /^\d+$/.test(q) ? all.filter((w) => String(w.id) === q) : Dup.search(all, q, { ignore: settings.ignore });
    $("c-meta").textContent = !q ? `${fmt(all.length)} obras salvas. Digite uma palavra-chave para achar obras parecidas à mão.` : `${fmt(hits.length)} obra(s) com “${q}”.`;
    hits.slice(0, cShown).forEach((w) => {
      const g = groupOf(w.id);
      const dupe = g ? el("button", { type: "button", className: "dupe", text: `${LEVEL_NAME[g.level]}: ${g.works.length} obras parecidas` }) : null;
      if (dupe) dupe.onclick = () => { setFilter("todas"); $("g-q").value = String(w.id); showTab("grupos"); };
      const probs = problems ? problems.items.filter((it) => it.w.id === w.id) : [];
      const pb = probs.map((it) => {
        const b = el("button", { type: "button", className: `dupe prob${it.grave ? " grave" : ""}`, text: it.kind === "desc" ? "Sinopse com problema" : "Capa com problema" });
        b.onclick = () => { setPFilter("todas"); $("p-q").value = String(w.id); showTab("problemas"); };
        return b;
      });
      const m = meta(w);
      list.append(el("li", { className: "work" }, cover(w), el("div", {}, el("p", { className: "t", text: w.title }), linkEl(w), m ? el("p", { className: "m", text: m }) : null,
        w.alts && w.alts.length ? el("p", { className: "m", text: `Também: ${w.alts.slice(0, 3).join(" · ")}` }) : null, dupe || pb.length ? el("div", { className: "tags" }, dupe, ...pb) : null)));
    });
    $("c-more").hidden = hits.length <= cShown;
    $("c-more").textContent = `Mostrar mais (${fmt(hits.length - cShown)})`;
  }
  $("c-more").onclick = () => { cShown += 50; renderCatalog(); };

  /* ---------- Ajustes ---------- */
  function renderSettings() {
    renderToken();
    $("set-gap").value = String(settings.gap);
    $("set-min-gap").value = String(settings.minGap);
    $("set-threads").value = String(settings.coverThreads);
    $("set-min").value = String(settings.min);
    $("set-ignore").value = settings.ignore;
    $("set-deep").checked = Boolean(settings.deep);
    $("set-deep-n").value = String(settings.deepPer);
    $("set-covers").checked = Boolean(settings.covers);
    $("set-cover-n").value = String(settings.coverPer);
    document.querySelectorAll(".js-only").forEach((n) => { n.hidden = BG; });
    document.querySelectorAll(".bg-only").forEach((n) => { n.hidden = !BG; });
    $("app-version").textContent = `Versão ${window.BM_VERSION || "de teste"} · ${BG ? "procura no celular (continua com o app fechado)" : `pedidos pelo ${DupHttp && !dupHttpBroken ? "plugin nativo" : CapHttp ? "HTTP do Capacitor" : "navegador"}`} · ${fmt(cat.works.size)} obras salvas.`;
  }
  // Mudou o ritmo ou o que conferir: manda o plano de novo para o motor (uma vez, depois de parar de mexer).
  let replanTimer = null;
  function replan() { if (!BG || !settings.auto) return; clearTimeout(replanTimer); replanTimer = setTimeout(() => bgStart({}), 1200); }
  const num = (id, lo, hi, d) => { const v = Number($(id).value); const out = Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d; $(id).value = String(out); return out; };
  $("set-gap").onchange = () => { settings.gap = num("set-gap", 0.5, 60, 1.5); saveSettings(); replan(); };
  $("set-min-gap").onchange = () => { settings.minGap = num("set-min-gap", 0.5, 30, 1); saveSettings(); replan(); };
  $("set-threads").onchange = () => { settings.coverThreads = Math.round(num("set-threads", 1, 6, 3)); saveSettings(); replan(); };
  $("set-min").onchange = () => { settings.min = Number($("set-min").value) || 55; saveSettings(); find(); };
  $("set-ignore").onchange = () => { settings.ignore = $("set-ignore").value; saveSettings(); find(); };
  $("set-deep").onchange = () => { settings.deep = $("set-deep").checked; saveSettings(); renderHero(); replan(); };
  $("set-deep-n").onchange = () => { settings.deepPer = Math.round(num("set-deep-n", 20, 2000, 250)); saveSettings(); };
  $("set-covers").onchange = () => { settings.covers = $("set-covers").checked; saveSettings(); renderHero(); replan(); };
  $("set-cover-n").onchange = () => { settings.coverPer = Math.round(num("set-cover-n", 20, 3000, 300)); saveSettings(); };
  $("set-reset-ok").onclick = () => { const n = okProblems.size; okProblems = new Set(); saveOk(); find(); toast(n ? `${n} problema(s) de volta na lista.` : "Nenhum problema ignorado."); };
  $("set-reset-dismissed").onclick = () => { const n = dismissed.size; dismissed = new Set(); saveDismissed(); find(); toast(n ? `${n} par(es) de volta na lista.` : "Nenhum par dispensado."); };
  $("set-clear").onclick = async () => {
    if (busy) return;
    if (!confirm("Apagar o catálogo salvo neste celular? O token e o papel de parede continuam.")) return;
    if (BG) {
      // Descarta o que o motor ainda tinha guardado para juntar.
      try { await DupHttp.bgStop(); const r = await DupHttp.bgStatus(); const seq = Number(r && r.seq) || 0; mergedSeq = seq; ls.set("dup-bg-seq", seq); await DupHttp.bgAck({ upTo: seq }); } catch (_) { /* ok */ }
    }
    cat.works = new Map(); cat.progress = null; cat.lettersNext = null; cat.savedAt = null; result = null; problems = null;
    cat.pagers = {}; cat.prevIds = {}; cat.lettersBigrams = false; cat.lettersDone = null;
    await store.del("catalog");
    ls.del("dup-auto-next");
    renderPanel(); renderSettings(); toast("Catálogo apagado.");
  };

  /* ---------- Papel de parede: imagem da galeria, reduzida e guardada no celular ---------- */
  let wallUrl = null;
  async function shrinkImage(file) {
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error("Não deu para abrir essa imagem.")); i.src = url; });
      const k = Math.min(1, 1800 / Math.max(img.naturalWidth || 1, img.naturalHeight || 1));
      const c = document.createElement("canvas");
      c.width = Math.max(1, Math.round(img.naturalWidth * k)); c.height = Math.max(1, Math.round(img.naturalHeight * k));
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      const blob = await new Promise((res) => c.toBlob(res, "image/jpeg", 0.86));
      if (!blob) throw new Error("Não deu para preparar essa imagem.");
      return blob;
    } finally { URL.revokeObjectURL(url); }
  }
  function applyWallLook() {
    const root = document.documentElement.style;
    root.setProperty("--dim", String((Number(settings.wpDim) || 0) / 100));
    root.setProperty("--blur", `${Number(settings.wpBlur) || 0}px`);
    $("wp-dim").value = String(settings.wpDim); $("wp-blur").value = String(settings.wpBlur);
    $("wp-dim-v").textContent = `${settings.wpDim}%`; $("wp-blur-v").textContent = Number(settings.wpBlur) ? `${settings.wpBlur}` : "nada";
  }
  async function loadWall() {
    const v = await store.get("wallpaper");
    if (wallUrl) { URL.revokeObjectURL(wallUrl); wallUrl = null; }
    let src = null;
    if (v instanceof Blob) src = wallUrl = URL.createObjectURL(v);
    else if (typeof v === "string" && v.startsWith("data:image/")) src = v;
    $("wall").hidden = !src;
    document.body.classList.toggle("has-wall", Boolean(src));
    document.documentElement.style.setProperty("--wall-img", src ? `url("${src}")` : "none");
    $("wp-prev").style.backgroundImage = src ? `url("${src}")` : "";
    $("wp-prev").textContent = src ? "" : "Sem imagem";
    $("wp-remove").hidden = !src;
    $("wp-pick").textContent = src ? "Trocar imagem" : "Escolher da galeria";
    applyWallLook();
  }
  $("wp-pick").onclick = () => $("wp-file").click();
  $("wp-file").onchange = async () => {
    const f = $("wp-file").files && $("wp-file").files[0];
    $("wp-file").value = "";
    if (!f) return;
    try {
      await store.set("wallpaper", await shrinkImage(f));
      await loadWall();
      toast("Papel de parede salvo.");
    } catch (e) { toast(e.message || "Não deu para usar essa imagem."); }
  };
  $("wp-remove").onclick = async () => { await store.del("wallpaper"); ls.del("dup-wallpaper"); await loadWall(); toast("Fundo tirado."); };
  $("wp-dim").oninput = () => { settings.wpDim = Number($("wp-dim").value); applyWallLook(); };
  $("wp-blur").oninput = () => { settings.wpBlur = Number($("wp-blur").value); applyWallLook(); };
  $("wp-dim").onchange = $("wp-blur").onchange = () => saveSettings();

  /* ---------- Início ---------- */
  (async () => {
    renderToken();
    loadWall().catch(() => {});
    await loadCatalog();
    BG = await bgDetect();
    if (BG) {
      // Parada pelo botão da notificação (com o app fechado): fica parada até ligar de novo aqui.
      if (bgInfo && bgInfo.auto === false && ls.get("dup-bg-started", false)) { settings.auto = false; saveSettings(); ls.set("dup-bg-started", false); }
      renderSettings();
      if (settings.auto && getToken()) {
        // Junta o que o motor leu com o app fechado e manda o plano de novo (com as suspeitas na frente).
        const was = bgRunning();
        await bgStart({});
        if (!was) addHistory({ at: Date.now(), kind: "ligada", text: "Procura em segundo plano ligada" });
      } else {
        await bgPull(true);
        if (cat.works.size) find(); else renderPanel();
      }
      bgLoop();
      renderPanel();
    } else {
      if (cat.works.size) find(); else renderPanel();
      renderSettings();
      setTimeout(() => autoCycle(false), 1200);
    }
    document.body.classList.add("ready");
  })();
})();
