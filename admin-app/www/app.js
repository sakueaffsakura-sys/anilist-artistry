/* Estúdio Better Mangá — telas do app. A lógica de envio está em engine.js. */
(function () {
  "use strict";

  // Valores públicos do site (os mesmos do .env do projeto; não são segredos).
  const SUPABASE_URL = "https://olaqyjeicgopgolgidig.supabase.co";
  const SUPABASE_KEY = "sb_publishable_SJco4f_-TAVlgsJkGNIhNQ_VI40Ubey";
  const DEFAULT_SITE = "https://anilist-artistry.lovable.app";
  const STORE = "bm-estudio-v1";

  const $ = (id) => document.getElementById(id);
  const load = () => { try { return JSON.parse(localStorage.getItem(STORE) || "{}"); } catch (_) { return {}; } };
  let state = Object.assign({ site: DEFAULT_SITE, token: "", session: null }, load());
  const save = () => { try { localStorage.setItem(STORE, JSON.stringify(state)); } catch (_) { /* sem armazenamento */ } };

  /* ---------- conta ---------- */
  async function authRequest(grant, body) {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=${grant}`, {
      method: "POST",
      headers: { apikey: SUPABASE_KEY, "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      const msg = String(j.error_description || j.msg || j.message || "");
      throw new Error(/invalid login|invalid_grant|credentials/i.test(msg) ? "E-mail ou senha incorretos." : msg || "Não foi possível entrar.");
    }
    return { mode: "email", email: (j.user && j.user.email) || body.email || "", access: j.access_token, refresh: j.refresh_token, expires: Date.now() + (Number(j.expires_in) || 3600) * 1000 };
  }
  async function refreshSession() {
    const s = state.session;
    if (!s || s.mode !== "email" || !s.refresh) return false;
    try { state.session = await authRequest("refresh_token", { refresh_token: s.refresh }); save(); return true; }
    catch (_) { return false; }
  }
  function siteHeaders() {
    const s = state.session;
    if (!s) return {};
    return s.mode === "code" ? { "x-ingest-token": s.code } : { authorization: `Bearer ${s.access}` };
  }

  /* ---------- motor ---------- */
  const engine = BMEngine.createEngine({
    fetch: (url, init) => fetch(url, init),
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    now: () => Date.now(),
    mediocreToken: () => state.token,
    site: {
      url: () => state.site || DEFAULT_SITE,
      headers: siteHeaders,
      refresh: async () => {
        // Renova a sessão antes de expirar; se o site recusar, tenta renovar uma vez.
        return refreshSession();
      },
    },
    onEvent: onEngineEvent,
  });

  /* ---------- telas ---------- */
  function toast(text) {
    const t = $("toast"); t.textContent = text; t.hidden = false;
    clearTimeout(toast.timer); toast.timer = setTimeout(() => { t.hidden = true; }, 3500);
  }
  function show(screen) { $("login").hidden = screen !== "login"; $("main").hidden = screen !== "main"; }
  function host(url) { try { return new URL(url).host; } catch (_) { return url; } }

  /* Entrar */
  function setLoginTab(code) {
    $("tab-email").setAttribute("aria-selected", String(!code));
    $("tab-code").setAttribute("aria-selected", String(code));
    $("form-email").hidden = code; $("form-code").hidden = !code;
    $("login-error").hidden = true;
  }
  $("tab-email").onclick = () => setLoginTab(false);
  $("tab-code").onclick = () => setLoginTab(true);
  $("site-url").value = state.site;

  async function finishLogin(session, button) {
    const before = state.session;
    state.session = session;
    state.site = normalizeSite($("site-url").value) || DEFAULT_SITE;
    try {
      await engine.plan(); // confirma que a conta é administradora e que o site responde
      save(); enterMain();
    } catch (e) {
      state.session = before;
      showLoginError(e.message);
    } finally { button.disabled = false; }
  }
  function showLoginError(msg) { const el = $("login-error"); el.textContent = msg; el.hidden = false; }
  function normalizeSite(v) {
    const s = String(v || "").trim().replace(/\/+$/, "");
    if (!s) return "";
    return /^https?:\/\//i.test(s) ? s : `https://${s}`;
  }
  $("form-email").onsubmit = async (e) => {
    e.preventDefault();
    const btn = e.submitter || $("form-email").querySelector("button"); btn.disabled = true; $("login-error").hidden = true;
    try { await finishLogin(await authRequest("password", { email: $("email").value.trim(), password: $("password").value }), btn); }
    catch (err) { btn.disabled = false; showLoginError(err.message); }
  };
  $("form-code").onsubmit = async (e) => {
    e.preventDefault();
    const btn = e.submitter || $("form-code").querySelector("button"); btn.disabled = true; $("login-error").hidden = true;
    const code = $("code").value.trim();
    if (!/^[A-Za-z0-9_-]{32,128}$/.test(code)) { btn.disabled = false; showLoginError("Esse código não parece certo. Copie de novo do painel."); return; }
    await finishLogin({ mode: "code", code }, btn);
  };

  /* Principal */
  let tab = "novas", page = 1, rows = [], marks = { imported: new Set(), queued: new Set() }, loading = false, query = "";

  function enterMain() {
    show("main");
    $("who").textContent = state.session.mode === "code" ? `Código do painel · ${host(state.site)}` : `${state.session.email} · ${host(state.site)}`;
    $("token-card").hidden = Boolean(state.token);
    selectTab("novas");
    resumeHint();
  }

  async function resumeHint() {
    try {
      const p = await engine.plan();
      const n = (p.queue || []).length;
      if (n) toast(`${n} obra(s) esperando na fila do site. Abra "Fila do site" para continuar.`);
    } catch (_) { /* sem aviso */ }
  }

  document.querySelectorAll(".tabs button").forEach((b) => { b.onclick = () => selectTab(b.dataset.tab); });
  function selectTab(name) {
    tab = name; page = 1; rows = [];
    document.querySelectorAll(".tabs button").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.tab === name)));
    $("form-search").hidden = name !== "buscar";
    $("list").innerHTML = ""; $("list-meta").textContent = ""; $("more").hidden = true; $("list-empty").hidden = true;
    updateSendAll();
    if (name === "buscar") { if (query) loadPage(); else empty("Digite o nome da obra e toque em Buscar."); return; }
    loadPage();
  }
  $("form-search").onsubmit = (e) => { e.preventDefault(); query = $("search").value.trim(); if (query.length < 2) { toast("Digite pelo menos 2 letras."); return; } page = 1; rows = []; $("list").innerHTML = ""; loadPage(); };
  $("more").onclick = () => { page++; loadPage(); };

  function empty(text) { const el = $("list-empty"); el.textContent = text; el.hidden = false; }

  async function loadPage() {
    if (loading) return;
    if (!state.token && tab !== "fila") { $("token-card").hidden = false; empty("Cole a chave da MediocreScan para ver as obras."); return; }
    loading = true; $("more").hidden = true; $("list-empty").hidden = true; $("list-meta").textContent = "Carregando…";
    try {
      let found;
      if (tab === "fila") {
        const p = await engine.plan();
        const titles = new Map((p.items || []).map((i) => [i.id, i.title]));
        found = (p.queue || []).map((id) => ({ id, name: titles.get(id) || `Obra ${id}`, cover: null }));
      } else if (tab === "buscar") found = await engine.search(query, page);
      else found = await engine.list(tab, page);
      const fresh = found.filter((w) => !rows.some((r) => r.id === w.id));
      rows = rows.concat(fresh);
      const st = await engine.status(fresh.map((w) => w.id));
      st.imported.forEach((id) => marks.imported.add(id));
      st.queued.forEach((id) => marks.queued.add(id));
      fresh.forEach(renderRow);
      $("more").hidden = tab === "fila" || found.length === 0;
      if (!rows.length) empty(tab === "fila" ? "A fila do site está vazia." : "Nenhuma obra encontrada.");
    } catch (e) {
      if (!rows.length) empty(e.message); else toast(e.message);
    } finally {
      loading = false; updateMeta(); updateSendAll();
    }
  }

  function statusOf(id) {
    if (marks.imported.has(id) && !marks.queued.has(id)) return "ok";
    if (marks.queued.has(id)) return "queue";
    return "new";
  }
  function renderRow(w) {
    const li = document.createElement("li");
    li.className = "work"; li.dataset.id = String(w.id);
    const img = w.cover ? Object.assign(document.createElement("img"), { src: w.cover, alt: "", loading: "lazy" }) : Object.assign(document.createElement("div"), { className: "ph" });
    const info = document.createElement("div");
    const name = Object.assign(document.createElement("p"), { className: "work-name", textContent: w.name });
    const meta = Object.assign(document.createElement("span"), { className: "work-id", textContent: `ID ${w.id}` });
    const chip = Object.assign(document.createElement("span"), { className: "chip" });
    info.append(name, meta, document.createElement("br"), chip);
    const btn = Object.assign(document.createElement("button"), { type: "button", className: "btn" });
    btn.onclick = () => startRun([w]);
    li.append(img, info, btn);
    $("list").append(li);
    paintRow(li, w.id);
  }
  function paintRow(li, id) {
    const s = statusOf(id), chip = li.querySelector(".chip"), btn = li.querySelector("button");
    chip.className = `chip ${s === "ok" ? "ok" : s === "queue" ? "queue" : ""}`;
    chip.textContent = s === "ok" ? "Publicada" : s === "queue" ? "Na fila" : "Não enviada";
    btn.textContent = s === "ok" ? "Atualizar" : s === "queue" ? "Continuar" : "Enviar";
    btn.disabled = engine.running;
  }
  function repaint() { document.querySelectorAll(".work").forEach((li) => paintRow(li, Number(li.dataset.id))); }
  function pendingRows() { return rows.filter((w) => statusOf(w.id) !== "ok"); }
  function updateMeta() {
    if (!rows.length) { $("list-meta").textContent = ""; return; }
    const pub = rows.filter((w) => statusOf(w.id) === "ok").length;
    $("list-meta").textContent = `${rows.length} obras · ${pub} publicadas · ${rows.length - pub} para enviar`;
  }
  function updateSendAll() {
    const n = pendingRows().length, b = $("send-all");
    b.disabled = engine.running || n === 0;
    b.textContent = n ? (tab === "fila" ? `Continuar fila do site (${n})` : `Enviar não enviadas (${n})`) : "Nada para enviar nesta lista";
  }
  $("send-all").onclick = () => {
    const list = pendingRows();
    if (!list.length) return;
    if (!confirm(`Enviar ${list.length} obra(s), uma de cada vez? Cada obra vai até o último capítulo antes da próxima. Deixe o app aberto.`)) return;
    startRun(list);
  };

  /* Envio */
  let queueLeft = 0, workTotal = 0, countdown = null;
  async function startRun(list) {
    if (engine.running) return;
    if (!state.token) { toast("Cole a chave da MediocreScan primeiro."); $("token-card").hidden = false; return; }
    queueLeft = list.length;
    $("sender-idle").hidden = true; $("sender-run").hidden = false; $("log").innerHTML = "";
    setStatus("Colocando na fila do site…");
    try {
      const fresh = list.filter((w) => !marks.queued.has(w.id) && !marks.imported.has(w.id));
      if (fresh.length) { await engine.enqueue(fresh); fresh.forEach((w) => marks.queued.add(w.id)); }
    } catch (e) { log(`Fila: ${e.message}`); }
    repaint();
    keepAwake(true);
    await engine.run(list);
    keepAwake(false);
  }
  $("stop").onclick = () => { engine.stop(); setStatus("Parando depois do passo atual…"); };

  function setStatus(text, pause) { const el = $("run-status"); el.textContent = text; el.classList.toggle("pause", Boolean(pause)); }
  function setBar(done, total) { $("run-bar").firstElementChild.style.width = `${total ? Math.round((done / total) * 100) : 0}%`; $("run-bar").setAttribute("aria-valuenow", String(total ? Math.round((done / total) * 100) : 0)); }
  function log(text) {
    const li = document.createElement("li"); li.textContent = `${new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })} ${text}`;
    const ol = $("log"); ol.prepend(li); while (ol.children.length > 40) ol.lastChild.remove();
  }
  function count(ms, render) {
    clearInterval(countdown);
    const end = Date.now() + ms;
    const tick = () => { const s = Math.max(0, Math.ceil((end - Date.now()) / 1000)); render(s); if (s <= 0) clearInterval(countdown); };
    tick(); countdown = setInterval(tick, 1000);
  }

  function onEngineEvent(e) {
    switch (e.type) {
      case "run-start": $("run-queue").textContent = `${e.count} obra(s) na vez`; break;
      case "work-start":
        workTotal = e.total; setBar(0, e.total);
        $("run-work").textContent = e.name;
        $("run-queue").textContent = `${queueLeft} obra(s) na vez · ${e.total} capítulo(s) nesta`;
        log(`${e.name}: ${e.created ? "criada no site" : "já estava no site"}, ${e.total} capítulo(s) para enviar.`);
        if (!e.total) setStatus("Nenhum capítulo novo.");
        break;
      case "sending": clearInterval(countdown); setStatus(`Enviando capítulos ${e.from}${e.to > e.from ? ` e ${e.to}` : ""} de ${e.total}…`); break;
      case "progress": setBar(e.done, e.total); break;
      case "waiting": count(e.ms, (s) => setStatus(`Próximo envio em ${s} s`)); break;
      case "pause": log(`A MediocreScan travou (${e.reason}). Pausa ${e.count}/${e.max}.`); count(e.ms, (s) => setStatus(`A MediocreScan travou por excesso de pedidos. Voltando em ${s} s.`, true)); break;
      case "resume": clearInterval(countdown); setStatus("Continuando…"); break;
      case "work-done":
        queueLeft = Math.max(0, queueLeft - 1);
        marks.imported.add(e.id); marks.queued.delete(e.id); repaint(); updateMeta();
        log(`${e.name}: ${e.note ? e.note : `+${e.added} capítulo(s)${e.skipped ? `, ${e.skipped} sem conteúdo` : ""}`}.`);
        break;
      case "log": log(e.text); break;
      case "run-done": finishRun(`Pronto: ${e.works} obra(s), ${e.added} capítulo(s) enviados.`); break;
      case "run-stopped": finishRun(`Envio parado. ${e.added} capítulo(s) enviados. A obra atual continua de onde parou na próxima vez.`); break;
      case "run-error": finishRun(e.message, true); break;
    }
  }
  function finishRun(text, isError) {
    clearInterval(countdown);
    setStatus(text, isError); log(text); toast(text);
    setTimeout(() => { if (!engine.running) { $("sender-run").hidden = true; $("sender-idle").hidden = false; repaint(); updateSendAll(); } }, 6000);
    repaint(); updateSendAll();
  }

  /* Tela acesa durante o envio (quando o aparelho suporta). */
  let wakeLock = null;
  async function keepAwake(on) {
    try {
      if (on && navigator.wakeLock) wakeLock = await navigator.wakeLock.request("screen");
      if (!on && wakeLock) { await wakeLock.release(); wakeLock = null; }
    } catch (_) { /* a tela já fica acesa pelo app Android */ }
  }

  /* Chave e configurações */
  $("form-token-inline").onsubmit = (e) => {
    e.preventDefault();
    const v = $("token-inline").value.trim();
    if (v.length < 20) { toast("Essa chave parece curta demais."); return; }
    state.token = v; save(); $("token-card").hidden = true; $("token-inline").value = ""; toast("Chave salva."); selectTab(tab);
  };
  $("open-settings").onclick = () => {
    $("token").value = state.token; $("site-url-2").value = state.site;
    $("account").textContent = state.session && state.session.mode === "email" ? `Conectado como ${state.session.email}.` : "Conectado com código do painel.";
    $("settings").showModal();
  };
  $("form-settings").onsubmit = () => {
    state.token = $("token").value.trim();
    state.site = normalizeSite($("site-url-2").value) || DEFAULT_SITE;
    save(); $("token-card").hidden = Boolean(state.token);
    $("who").textContent = state.session.mode === "code" ? `Código do painel · ${host(state.site)}` : `${state.session.email} · ${host(state.site)}`;
    toast("Configurações salvas."); selectTab(tab);
  };
  $("logout").onclick = () => {
    if (engine.running) { toast("Pare o envio antes de sair."); return; }
    state.session = null; save(); $("settings").close(); $("password").value = ""; $("code").value = ""; show("login");
  };

  /* Início */
  if (state.session) enterMain(); else show("login");
  // Renova a sessão do e-mail perto de expirar.
  setInterval(() => { const s = state.session; if (s && s.mode === "email" && s.expires - Date.now() < 5 * 60_000) refreshSession(); }, 60_000);
})();
