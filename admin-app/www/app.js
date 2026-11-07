/* Estúdio Better Mangá — telas do app (modelo do MediocreScan Reader + publicar no site). */
(function () {
  "use strict";

  // Valores públicos do site (os mesmos do .env do projeto; não são segredos).
  const SUPABASE_URL = "https://olaqyjeicgopgolgidig.supabase.co";
  const SUPABASE_KEY = "sb_publishable_SJco4f_-TAVlgsJkGNIhNQ_VI40Ubey";
  const DEFAULT_SITE = "https://anilist-artistry.lovable.app";
  const STORE = "bm-estudio-v1";

  const $ = (id) => document.getElementById(id);
  const el = (tag, props, ...kids) => { const n = Object.assign(document.createElement(tag), props || {}); kids.forEach((k) => k != null && n.append(k)); return n; };
  const load = () => { try { return JSON.parse(localStorage.getItem(STORE) || "{}"); } catch (_) { return {}; } };
  let state = Object.assign({ site: DEFAULT_SITE, token: "", session: null, font: 17 }, load());
  const save = () => { try { localStorage.setItem(STORE, JSON.stringify(state)); } catch (_) { /* sem armazenamento */ } };
  const host = (url) => { try { return new URL(url).host; } catch (_) { return url; } };

  /* ---------- conta ---------- */
  async function authRequest(grant, body) {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=${grant}`, {
      method: "POST", headers: { apikey: SUPABASE_KEY, "content-type": "application/json" }, body: JSON.stringify(body),
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
    try { state.session = await authRequest("refresh_token", { refresh_token: s.refresh }); save(); return true; } catch (_) { return false; }
  }
  const siteHeaders = () => { const s = state.session; if (!s) return {}; return s.mode === "code" ? { "x-ingest-token": s.code } : { authorization: `Bearer ${s.access}` }; };
  const whoText = () => (state.session && state.session.mode === "code" ? `Código do painel · ${host(state.site)}` : `${state.session ? state.session.email : ""} · ${host(state.site)}`);

  /* ---------- motor ---------- */
  const engine = BMEngine.createEngine({
    fetch: (url, init) => fetch(url, init),
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    now: () => Date.now(),
    mediocreToken: () => state.token,
    site: {
      url: () => state.site || DEFAULT_SITE,
      headers: siteHeaders,
      refresh: refreshSession,
      moved: (origin) => { state.site = origin; save(); $("site-url").value = origin; if (state.session) $("who").textContent = whoText(); },
    },
    onEvent: onEngineEvent,
  });

  /* ---------- utilidades ---------- */
  function toast(text) { const t = $("toast"); t.textContent = text; t.hidden = false; clearTimeout(toast.timer); toast.timer = setTimeout(() => { t.hidden = true; }, 3800); }
  function show(screen) { $("login").hidden = screen !== "login"; $("main").hidden = screen !== "main"; }
  const redact = (text) => (state.token ? String(text).split(state.token).join("[REDACTED]") : String(text));
  function openJson(title, data) {
    $("json-title").textContent = title;
    $("json-body").textContent = data == null ? "Nada para mostrar." : redact(JSON.stringify(data, null, 2));
    $("json-dialog").showModal();
  }
  $("json-close").onclick = () => $("json-dialog").close();
  $("json-copy").onclick = async () => {
    const text = $("json-body").textContent;
    try { await navigator.clipboard.writeText(text); toast("JSON copiado."); }
    catch (_) { const r = document.createRange(); r.selectNodeContents($("json-body")); const s = getSelection(); s.removeAllRanges(); s.addRange(r); toast("Texto selecionado. Toque e segure para copiar."); }
  };

  /* ---------- entrar ---------- */
  function setLoginTab(code) {
    $("tab-email").setAttribute("aria-selected", String(!code)); $("tab-code").setAttribute("aria-selected", String(code));
    $("form-email").hidden = code; $("form-code").hidden = !code; $("login-error").hidden = true;
  }
  $("tab-email").onclick = () => setLoginTab(false);
  $("tab-code").onclick = () => setLoginTab(true);
  $("site-url").value = state.site;
  const normalizeSite = (v) => { const s = String(v || "").trim().replace(/\/+$/, ""); return !s ? "" : /^https?:\/\//i.test(s) ? s : `https://${s}`; };
  function showLoginError(msg) { const e = $("login-error"); e.textContent = msg; e.hidden = false; }
  async function finishLogin(session, button) {
    const before = state.session;
    state.session = session;
    state.site = normalizeSite($("site-url").value) || DEFAULT_SITE;
    try { await engine.plan(); save(); enterMain(); }
    catch (e) { state.session = before; showLoginError(e.message); }
    finally { button.disabled = false; }
  }
  $("form-email").onsubmit = async (e) => {
    e.preventDefault();
    const btn = $("form-email").querySelector("button"); btn.disabled = true; $("login-error").hidden = true;
    try { await finishLogin(await authRequest("password", { email: $("email").value.trim(), password: $("password").value }), btn); }
    catch (err) { btn.disabled = false; showLoginError(err.message); }
  };
  $("form-code").onsubmit = async (e) => {
    e.preventDefault();
    const btn = $("form-code").querySelector("button"); btn.disabled = true; $("login-error").hidden = true;
    const code = $("code").value.trim();
    if (!/^[A-Za-z0-9_-]{32,128}$/.test(code)) { btn.disabled = false; showLoginError("Esse código não parece certo. Copie de novo do painel."); return; }
    await finishLogin({ mode: "code", code }, btn);
  };

  /* ---------- status no site ---------- */
  const marks = { imported: new Set(), queued: new Set() };
  const statusOf = (id) => (marks.queued.has(id) ? "queue" : marks.imported.has(id) ? "ok" : "new");
  async function refreshMarks(ids) {
    const want = ids.filter((id) => Number.isSafeInteger(id) && id > 0);
    if (!want.length) return;
    try {
      const st = await engine.status(want);
      want.forEach((id) => { marks.imported.delete(id); marks.queued.delete(id); });
      st.imported.forEach((id) => marks.imported.add(id)); st.queued.forEach((id) => marks.queued.add(id));
    } catch (_) { /* status é extra; a lista funciona sem ele */ }
  }

  /* ---------- rotas (# para o botão voltar do Android funcionar) ---------- */
  const TABS = { inicio: "Início", recentes: "Recentes", novas: "Novas", paravoce: "Para você", buscar: "Buscar", fila: "Fila do site" };
  const CHIPS = { recentes: [["atualizadas", "Todas"], ["ia", "Com IA"]], paravoce: [["recomendacoes", "Recomendações"], ["listas", "Listas"], ["leitura", "Leitura"]] };
  let chip = { recentes: "atualizadas", paravoce: "recomendacoes" };
  let current = { tab: "inicio" };
  window.addEventListener("hashchange", route);
  function go(hash) { if (location.hash === hash) route(); else location.hash = hash; }
  function route() {
    if ($("main").hidden) return;
    const h = location.hash.replace(/^#\/?/, "");
    const [kind, id, extra] = h.split("/");
    if (kind === "obra" && /^\d+$/.test(id)) return openWork(Number(id));
    if (kind === "cap" && /^\d+$/.test(id)) return openChapter(Number(id), /^\d+$/.test(extra || "") ? Number(extra) : null);
    openTab(TABS[kind] ? kind : "inicio");
  }
  function setView(v, title, back) {
    ["list", "work", "reader"].forEach((n) => { $(`view-${n}`).hidden = n !== v; });
    $("page-title").textContent = title; $("back").hidden = !back; $("brand").hidden = Boolean(back);
    window.scrollTo(0, 0);
    updateSendAll();
  }
  $("back").onclick = () => { if (history.length > 1) history.back(); else go("#/inicio"); };
  document.querySelectorAll(".bottom-nav button").forEach((b) => { b.onclick = () => go(`#/${b.dataset.tab}`); });
  $("open-queue").onclick = () => go("#/fila");

  /* ---------- listas ---------- */
  let page = 1, rows = [], loading = false, query = "", lastRaw = null;
  function openTab(tab) {
    current = { tab }; page = 1; rows = []; lastRaw = null;
    setView("list", TABS[tab], false);
    document.querySelectorAll(".bottom-nav button").forEach((b) => { if (b.dataset.tab === tab) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current"); });
    const chips = CHIPS[tab];
    $("chips").hidden = !chips; $("chips").innerHTML = "";
    if (chips) chips.forEach(([k, label]) => {
      const b = el("button", { type: "button", textContent: label });
      b.setAttribute("role", "tab"); b.setAttribute("aria-selected", String(chip[tab] === k));
      b.onclick = () => { chip[tab] = k; openTab(tab); };
      $("chips").append(b);
    });
    $("form-search").hidden = tab !== "buscar";
    clearList();
    if (tab === "buscar" && !query) { empty("Digite o nome da obra ou o número do ID."); updateSendAll(); return; }
    loadPage();
  }
  function clearList() { $("grid").innerHTML = ""; $("groups").innerHTML = ""; $("list-meta").textContent = ""; $("more").hidden = true; $("list-empty").hidden = true; }
  function empty(text) { const e = $("list-empty"); e.textContent = text; e.hidden = false; }
  $("form-search").onsubmit = (e) => { e.preventDefault(); query = $("search").value.trim(); if (query.length < 1) return; page = 1; rows = []; clearList(); loadPage(); };
  $("more").onclick = () => { page++; loadPage(); };

  async function loadPage() {
    if (loading) return;
    const tab = current.tab;
    if (!state.token && tab !== "fila") { $("token-card").hidden = false; empty("Cole a chave da MediocreScan para ver as obras."); return; }
    loading = true; $("more").hidden = true; $("list-empty").hidden = true; $("list-meta").textContent = "Carregando…";
    try {
      let works = [], pageable = false;
      if (tab === "fila") {
        const p = await engine.plan(); lastRaw = p;
        const titles = new Map((p.items || []).map((i) => [i.id, i.title]));
        works = (p.queue || []).map((id) => ({ id, title: titles.get(id) || `Obra ${id}`, cover: null }));
      } else if (tab === "paravoce" && chip.paravoce === "listas") {
        const r = await engine.lists(); lastRaw = r.raw; return renderGroups(r.lists);
      } else if (tab === "paravoce" && chip.paravoce === "leitura") {
        const r = await engine.reading(); lastRaw = r.raw; return renderReading(r.chapters);
      } else if (tab === "buscar") { const r = await engine.search(query, page); lastRaw = r.raw; works = r.works; pageable = !/^\d+$/.test(query); }
      else {
        const kind = tab === "inicio" ? "inicio" : tab === "novas" ? "novas" : tab === "recentes" ? chip.recentes : "recomendacoes";
        const r = await engine.list(kind, page); lastRaw = r.raw; works = r.works; pageable = kind === "novas" || kind === "atualizadas";
      }
      const fresh = works.filter((w) => !rows.some((r) => r.id === w.id));
      rows = rows.concat(fresh);
      await refreshMarks(fresh.map((w) => w.id));
      fresh.forEach((w) => $("grid").append(card(w)));
      $("more").hidden = !pageable || works.length === 0;
      if (!rows.length) empty(tab === "fila" ? "A fila do site está vazia." : "Nenhuma obra encontrada.");
    } catch (e) { if (!rows.length) empty(e.message); else toast(e.message); }
    finally { loading = false; updateMeta(); updateSendAll(); }
  }
  function card(w) {
    const s = statusOf(w.id);
    const cover = el("div", { className: "cover" }, w.cover ? el("img", { src: w.cover, alt: "", loading: "lazy" }) : null);
    if (s !== "new") cover.append(el("span", { className: `mark ${s}`, textContent: s === "ok" ? "✓" : "Fila", title: s === "ok" ? "Publicada no site" : "Na fila do site" }));
    const flags = [w.isAi ? "IA" : null, w.isOfficial ? "Oficial" : null, w.isNovel ? "Novel" : null].filter(Boolean);
    if (flags.length) cover.append(el("div", { className: "flags" }, ...flags.map((f) => el("span", { className: "flag", textContent: f }))));
    const b = el("button", { type: "button", className: "card-work" }, cover, el("p", { className: "name", textContent: w.title }));
    b.dataset.id = String(w.id);
    b.onclick = () => go(`#/obra/${w.id}`);
    return b;
  }
  function renderGroups(lists) {
    loading = false; $("list-meta").textContent = `${lists.length} listas`;
    if (!lists.length) { empty("Nenhuma lista encontrada."); return; }
    lists.forEach((l) => {
      const g = el("section", { className: "group" }, el("h2", { textContent: l.name }), el("p", { className: "muted small", textContent: `${l.works.length} obras${l.description ? ` · ${l.description}` : ""}` }));
      const grid = el("div", { className: "grid" }); l.works.forEach((w) => grid.append(card(w))); g.append(grid);
      $("groups").append(g);
    });
    rows = lists.flatMap((l) => l.works);
    refreshMarks(rows.map((w) => w.id)).then(updateSendAll);
  }
  function renderReading(chapters) {
    loading = false; $("list-meta").textContent = `${chapters.length} capítulos lidos`;
    if (!chapters.length) { empty("Nenhuma leitura encontrada."); return; }
    const ul = el("ul", { className: "chapters" });
    chapters.forEach((c) => ul.append(el("li", {}, chapterButton(c, c.workId))));
    $("groups").append(ul);
  }
  function updateMeta() {
    if (!rows.length || current.tab === "paravoce" && chip.paravoce !== "recomendacoes") return;
    const pub = rows.filter((w) => statusOf(w.id) === "ok").length;
    $("list-meta").textContent = `${rows.length} obras · ${pub} publicadas · ${rows.length - pub} para enviar`;
  }

  /* ---------- obra ---------- */
  let work = null, workRaw = null, order = "desc", thumbsMap = {};
  async function openWork(id) {
    setView("work", "Obra", true);
    if (!work || work.id !== id) {
      work = null; $("w-title").textContent = "Carregando…"; $("w-chapters").innerHTML = ""; $("w-tags").innerHTML = ""; $("w-badges").innerHTML = "";
      $("w-desc").textContent = ""; $("w-alt").textContent = ""; $("w-meta").textContent = ""; $("w-site").textContent = ""; $("w-cover").removeAttribute("src"); $("w-banner").style.backgroundImage = "";
      try {
        const r = await engine.work(id); work = r.work; workRaw = r.raw;
        if (!work) throw new Error("Formato da obra não reconhecido. Veja o JSON.");
      } catch (e) { $("w-title").textContent = e.message; $("w-publish").disabled = true; return; }
      thumbsMap = {};
      engine.thumbs(id).then((t) => { thumbsMap = t; if (work && work.id === id) renderChapters(); });
    }
    renderWork();
    await refreshMarks([id]); renderSiteStatus();
  }
  function renderWork() {
    const w = work;
    $("page-title").textContent = w.title;
    $("w-title").textContent = w.title;
    if (w.cover) $("w-cover").src = w.cover;
    $("w-banner").style.backgroundImage = w.banner || w.cover ? `url("${w.banner || w.cover}")` : "";
    $("w-alt").textContent = w.altTitles.join(" · ");
    $("w-meta").textContent = [w.format, w.status, `${w.chapters.length} capítulos`, `ID ${w.id}`].filter(Boolean).join(" · ");
    $("w-badges").innerHTML = "";
    [w.isAi ? "IA" : null, w.isOfficial ? "Oficial" : null, w.isNovel ? "Novel" : null].filter(Boolean).forEach((b) => $("w-badges").append(el("span", { className: "badge hot", textContent: b })));
    $("w-tags").innerHTML = ""; w.tags.forEach((t) => $("w-tags").append(el("span", { textContent: t })));
    $("w-desc").textContent = w.description || ""; $("w-desc").classList.add("clamp4");
    $("w-desc-more").hidden = !w.description || w.description.length < 240; $("w-desc-more").textContent = "Ver mais";
    renderChapters();
  }
  $("w-desc-more").onclick = () => { const open = $("w-desc").classList.toggle("clamp4"); $("w-desc-more").textContent = open ? "Ver mais" : "Ver menos"; };
  $("w-order").onclick = () => { order = order === "desc" ? "asc" : "desc"; $("w-order").textContent = order === "desc" ? "Mais recentes primeiro" : "Mais antigos primeiro"; renderChapters(); };
  $("w-json").onclick = () => openJson(`Obra ${work ? work.id : ""}`, workRaw);
  function sortedChapters() {
    const list = (work ? work.chapters : []).slice().sort((a, b) => (Number(a.number) || 0) - (Number(b.number) || 0));
    return order === "desc" ? list.reverse() : list;
  }
  function renderChapters() {
    const ul = $("w-chapters"); ul.innerHTML = "";
    const list = sortedChapters();
    $("w-empty").hidden = list.length > 0;
    list.forEach((c) => ul.append(el("li", {}, chapterButton(c, work.id))));
  }
  function chapterButton(c, workId) {
    const thumb = thumbsMap[String(c.id)] || thumbsMap[`n${c.number}`];
    const num = el("span", { className: "cap-num" }, thumb ? el("img", { src: thumb, alt: "", loading: "lazy" }) : document.createTextNode(c.number || "?"));
    const sub = [c.title && c.title !== c.number ? c.title : null, c.isAi ? "IA" : null, c.pages ? `${c.pages} páginas` : null, c.date ? new Date(c.date).toLocaleDateString("pt-BR") : null].filter(Boolean).join(" · ");
    const b = el("button", { type: "button" }, num, el("div", { className: "min0" }, el("p", { className: "cap-title", textContent: `Capítulo ${c.number || "?"}` }), sub ? el("p", { className: "cap-sub", textContent: sub }) : null), el("span", { className: "muted", textContent: "›" }));
    b.onclick = () => c.id && go(`#/cap/${c.id}${workId ? `/${workId}` : ""}`);
    return b;
  }
  function renderSiteStatus() {
    if (!work) return;
    const s = statusOf(work.id), b = $("w-publish");
    b.disabled = engine.running;
    b.textContent = s === "ok" ? "Atualizar capítulos no site" : s === "queue" ? "Continuar envio" : "Publicar no site";
    $("w-site").textContent = s === "ok" ? "Esta obra já está no Better Mangá. Atualizar envia só os capítulos que faltam." : s === "queue" ? "Esta obra está na fila do site e ainda tem capítulos para enviar." : "Esta obra ainda não está no Better Mangá.";
  }
  $("w-publish").onclick = () => { if (work) startRun([work]); };

  /* ---------- leitor ---------- */
  let chapterRaw = null, readerWork = null;
  async function openChapter(capId, workId) {
    setView("reader", "Capítulo", true);
    $("r-blocks").innerHTML = ""; $("r-empty").hidden = true; $("r-info").textContent = "Carregando…";
    $("r-font-minus").hidden = $("r-font-plus").hidden = true;
    if (workId && (!work || work.id !== workId)) { try { const r = await engine.work(workId); work = r.work; workRaw = r.raw; } catch (_) { /* navegação entre capítulos fica indisponível */ } }
    readerWork = work && (!workId || work.id === workId) ? work : null;
    try {
      const r = await engine.chapter(capId); chapterRaw = { capitulo: r.raw, conteudo: r.contentRaw };
      const c = r.chapter || {};
      $("page-title").textContent = `Capítulo ${c.number || ""}`.trim();
      const images = r.blocks.filter((b) => b.type === "image").length, texts = r.blocks.filter((b) => b.type === "text").length;
      $("r-info").textContent = [readerWork ? readerWork.title : null, images ? `${images} páginas` : null, texts ? "texto" : null].filter(Boolean).join(" · ");
      if (!r.blocks.length) { const e = $("r-empty"); e.textContent = "Conteúdo do capítulo não encontrado. Veja o JSON."; e.hidden = false; }
      $("r-font-minus").hidden = $("r-font-plus").hidden = texts === 0;
      r.blocks.forEach((b) => $("r-blocks").append(block(b)));
      applyFont();
      setupNav(capId);
    } catch (e) { $("r-info").textContent = ""; const x = $("r-empty"); x.textContent = e.message; x.hidden = false; setupNav(capId); }
  }
  function block(b) {
    if (b.type === "text") return el("p", { className: "text", textContent: b.text });
    if (b.type === "image") {
      const img = el("img", { src: b.url, alt: b.page ? `Página ${b.page}` : "Página", loading: "lazy", decoding: "async" });
      img.onerror = () => {
        const box = el("div", { className: "img-error" }, el("p", { textContent: "Não foi possível carregar esta página." }));
        const retry = el("button", { type: "button", className: "btn small", textContent: "Tentar de novo" });
        retry.onclick = () => { const n = block(b); box.replaceWith(n); };
        box.append(retry); img.replaceWith(box);
      };
      return img;
    }
    return el("div", { className: "unknown", textContent: "Bloco não reconhecido. Veja o JSON do capítulo." });
  }
  function applyFont() { document.querySelectorAll(".blocks .text").forEach((p) => { p.style.fontSize = `${state.font}px`; }); }
  $("r-font-minus").onclick = () => { state.font = Math.max(13, state.font - 1); save(); applyFont(); };
  $("r-font-plus").onclick = () => { state.font = Math.min(28, state.font + 1); save(); applyFont(); };
  $("r-json").onclick = () => openJson("Capítulo", chapterRaw);
  function setupNav(capId) {
    const list = readerWork ? readerWork.chapters.slice().sort((a, b) => (Number(a.number) || 0) - (Number(b.number) || 0)) : [];
    const i = list.findIndex((c) => c.id === capId);
    const prev = i > 0 ? list[i - 1] : null, next = i >= 0 && i < list.length - 1 ? list[i + 1] : null;
    const wid = readerWork ? `/${readerWork.id}` : "";
    $("r-prev").disabled = !prev; $("r-next").disabled = !next;
    $("r-prev").onclick = () => prev && go(`#/cap/${prev.id}${wid}`);
    $("r-next").onclick = () => next && go(`#/cap/${next.id}${wid}`);
    $("r-next").textContent = next ? `Capítulo ${next.number}` : "Último capítulo";
  }

  /* ---------- envio ---------- */
  const pendingRows = () => (current.tab && $("view-list").hidden === false ? rows.filter((w) => statusOf(w.id) !== "ok") : []);
  function updateSendAll() {
    const n = pendingRows().length, b = $("send-all");
    b.hidden = engine.running || n === 0;
    b.textContent = current.tab === "fila" ? `Continuar fila do site (${n})` : `Enviar não enviadas desta lista (${n})`;
    $("sender").hidden = !engine.running && b.hidden;
  }
  $("send-all").onclick = () => {
    const list = pendingRows(); if (!list.length) return;
    if (!confirm(`Enviar ${list.length} obra(s), uma de cada vez? Cada obra vai até o último capítulo antes da próxima. Deixe o app aberto.`)) return;
    startRun(list);
  };
  let queueLeft = 0, countdown = null;
  async function startRun(list) {
    if (engine.running) return;
    if (!state.token) { toast("Cole a chave da MediocreScan primeiro."); $("token-card").hidden = false; return; }
    queueLeft = list.length;
    $("sender").hidden = false; $("sender-idle").hidden = true; $("sender-run").hidden = false; $("log").innerHTML = "";
    setStatus("Colocando na fila do site…");
    try {
      const fresh = list.filter((w) => statusOf(w.id) === "new");
      if (fresh.length) { await engine.enqueue(fresh); fresh.forEach((w) => marks.queued.add(w.id)); }
    } catch (e) { log(`Fila: ${e.message}`); }
    repaint();
    await keepAwake(true);
    await engine.run(list);
    keepAwake(false);
  }
  $("stop").onclick = () => { engine.stop(); setStatus("Parando depois do passo atual…"); };
  function repaint() {
    document.querySelectorAll(".card-work").forEach((c) => { const id = Number(c.dataset.id); const w = rows.find((r) => r.id === id); if (w) c.replaceWith(card(w)); });
    renderSiteStatus(); updateMeta(); updateSendAll();
  }
  function setStatus(text, warn) { const e = $("run-status"); e.textContent = text; e.classList.toggle("pause", Boolean(warn)); }
  function setBar(done, total) { const pct = total ? Math.round((done / total) * 100) : 0; $("run-bar").firstElementChild.style.width = `${pct}%`; $("run-bar").setAttribute("aria-valuenow", String(pct)); }
  function log(text) { const li = el("li", { textContent: `${new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })} ${text}` }); const ol = $("log"); ol.prepend(li); while (ol.children.length > 40) ol.lastChild.remove(); }
  function count(ms, render) { clearInterval(countdown); const end = Date.now() + ms; const tick = () => { const s = Math.max(0, Math.ceil((end - Date.now()) / 1000)); render(s); if (s <= 0) clearInterval(countdown); }; tick(); countdown = setInterval(tick, 1000); }
  function onEngineEvent(e) {
    switch (e.type) {
      case "run-start": $("run-queue").textContent = `${e.count} obra(s) na vez`; break;
      case "work-start":
        setBar(0, e.total); $("run-work").textContent = e.name;
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
        queueLeft = Math.max(0, queueLeft - 1); marks.imported.add(e.id); marks.queued.delete(e.id); repaint();
        log(`${e.name}: ${e.note ? e.note : `+${e.added} capítulo(s)${e.skipped ? `, ${e.skipped} sem conteúdo` : ""}`}.`);
        break;
      case "log": log(e.text); break;
      case "run-done": finishRun(`Pronto: ${e.works} obra(s), ${e.added} capítulo(s) enviados.`); break;
      case "run-stopped": finishRun(`Envio parado. ${e.added} capítulo(s) enviados. A obra atual continua de onde parou na próxima vez.`); break;
      case "run-error": finishRun(e.message, true); break;
    }
  }
  function finishRun(text, isError) {
    clearInterval(countdown); setStatus(text, isError); log(text); toast(text);
    setTimeout(() => { if (!engine.running) { $("sender-run").hidden = true; $("sender-idle").hidden = false; repaint(); } }, 6000);
    repaint(); checkQueueDot();
  }
  let wakeLock = null;
  async function keepAwake(on) {
    try { if (on && navigator.wakeLock) wakeLock = await navigator.wakeLock.request("screen"); if (!on && wakeLock) { await wakeLock.release(); wakeLock = null; } }
    catch (_) { /* o app Android já mantém a tela acesa */ }
  }

  /* ---------- chave e configurações ---------- */
  $("form-token-inline").onsubmit = (e) => {
    e.preventDefault();
    const v = $("token-inline").value.trim();
    if (v.length < 20) { toast("Essa chave parece curta demais."); return; }
    state.token = v; save(); $("token-card").hidden = true; $("token-inline").value = ""; toast("Chave salva."); route();
  };
  $("open-settings").onclick = () => {
    $("token").value = state.token; $("site-url-2").value = state.site;
    $("account").textContent = state.session && state.session.mode === "email" ? `Conectado como ${state.session.email}.` : "Conectado com código do painel.";
    $("settings").showModal();
  };
  $("form-settings").onsubmit = () => {
    state.token = $("token").value.trim(); state.site = normalizeSite($("site-url-2").value) || DEFAULT_SITE;
    save(); $("token-card").hidden = Boolean(state.token); $("who").textContent = whoText(); toast("Configurações salvas."); route();
  };
  $("logout").onclick = () => {
    if (engine.running) { toast("Pare o envio antes de sair."); return; }
    state.session = null; save(); $("settings").close(); $("password").value = ""; $("code").value = ""; show("login");
  };

  async function checkQueueDot() { try { const p = await engine.plan(); $("queue-dot").hidden = !(p.queue || []).length; } catch (_) { /* sem aviso */ } }

  /* ---------- início ---------- */
  function enterMain() {
    show("main"); $("who").textContent = whoText(); $("token-card").hidden = Boolean(state.token);
    if (!location.hash) location.hash = "#/inicio"; else route();
    checkQueueDot();
  }
  if (state.session) enterMain(); else show("login");
  setInterval(() => { const s = state.session; if (s && s.mode === "email" && s.expires - Date.now() < 5 * 60_000) refreshSession(); }, 60_000);
})();
