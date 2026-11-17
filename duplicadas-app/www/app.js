/*
 * Duplicadas — tela. O token fica só neste celular (localStorage); o catálogo lido fica salvo no aparelho
 * (IndexedDB) para continuar depois e procurar de novo sem gastar pedidos.
 */
(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const Dup = window.Dup, MApi = window.MediocreApi;
  const fmt = (n) => Number(n || 0).toLocaleString("pt-BR");
  const LEVEL_NAME = { alta: "Certeza alta", provavel: "Provável", talvez: "Talvez" };
  const STEP_NAME = { busca: "Busca geral", adicionadas: "Lista de adicionadas", atualizadas: "Lista de atualizadas", letras: "Busca por letra" };

  /* ---------- Guardar no celular ---------- */
  const ls = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (_) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) { /* sem espaço: segue sem salvar */ } },
    del(k) { try { localStorage.removeItem(k); } catch (_) { /* ok */ } },
  };
  /** Catálogo no IndexedDB (cabe muito mais que o localStorage); sem IndexedDB, usa o localStorage. */
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

  const settings = Object.assign({ gap: 2.5, min: 55, ignore: "" }, ls.get("dup-settings", {}));
  const saveSettings = () => ls.set("dup-settings", settings);
  let dismissed = new Set(ls.get("dup-dismissed", []));
  const saveDismissed = () => ls.set("dup-dismissed", Array.from(dismissed));
  const getToken = () => ls.get("dup-token", "") || "";

  /* ---------- Pedidos: HTTP nativo do Capacitor (sem bloqueio de CORS); no navegador, fetch ---------- */
  const native = window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform() && window.Capacitor.Plugins && window.Capacitor.Plugins.CapacitorHttp;
  async function http(url, headers) {
    if (native) {
      const r = await native.request({ url, method: "GET", headers, responseType: "json", connectTimeout: 20000, readTimeout: 45000 });
      return { status: r.status, data: r.data };
    }
    const r = await fetch(url, { headers });
    let data = null;
    try { data = await r.json(); } catch (_) { data = null; }
    return { status: r.status, data };
  }

  /* ---------- Estado ---------- */
  const cat = { works: new Map(), progress: null, lettersNext: null, savedAt: null };
  let result = null, busy = null, reader = null, runStart = 0, waitTimer = null;

  async function loadCatalog() {
    const saved = await store.get("catalog");
    if (saved && Array.isArray(saved.works)) {
      cat.works = new Map(saved.works.map((w) => [w.id, w]));
      cat.progress = saved.progress || null;
      cat.lettersNext = saved.lettersNext || null;
      cat.savedAt = saved.savedAt || null;
    }
  }
  async function saveCatalog() {
    cat.savedAt = Date.now();
    await store.set("catalog", { works: Array.from(cat.works.values()), progress: cat.progress, lettersNext: cat.lettersNext, savedAt: cat.savedAt });
    $("cat-count").textContent = fmt(cat.works.size);
  }

  function makeReader() {
    return MApi.createReader({
      http, sleep: (ms) => new Promise((r) => setTimeout(r, ms)), now: () => Date.now(), token: getToken,
      gapMs: () => Math.max(1, Number(settings.gap) || 2.5) * 1000, onEvent,
    });
  }

  /* ---------- Toast ---------- */
  let toastTimer = null;
  function toast(text, action) {
    const t = $("toast");
    t.innerHTML = "";
    t.append(document.createTextNode(text));
    if (action) {
      const b = document.createElement("button");
      b.type = "button"; b.className = "link"; b.style.color = "#7fd9ec"; b.style.marginLeft = "10px"; b.textContent = action.label;
      b.onclick = () => { t.hidden = true; action.run(); };
      t.append(b);
    }
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, action ? 6000 : 3500);
  }

  /* ---------- Abas ---------- */
  function showTab(name) {
    document.querySelectorAll(".tabs [data-tab]").forEach((b) => { if (b.dataset.tab === name) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current"); });
    for (const v of ["analise", "grupos", "catalogo"]) $("v-" + v).hidden = v !== name;
    if (name === "grupos") renderGroups();
    if (name === "catalogo") renderCatalog();
    window.scrollTo(0, 0);
  }
  document.querySelectorAll(".tabs [data-tab]").forEach((b) => { b.onclick = () => showTab(b.dataset.tab); });

  /* ---------- Token ---------- */
  function renderToken() {
    const t = getToken();
    $("token-saved").hidden = !t;
    $("token-form").hidden = Boolean(t);
    $("token-cancel").hidden = !t;
    $("token-mask").textContent = t ? `Token salvo ••••${t.slice(-4)} (${t.length} caracteres)` : "";
    $("token-test").disabled = !t || Boolean(busy);
  }
  $("token-form").onsubmit = (e) => {
    e.preventDefault();
    const v = $("token-input").value.trim().replace(/^bearer\s+/i, "");
    if (v.length < 10) { $("token-status").textContent = "Esse token parece curto demais. Cole o token inteiro."; return; }
    ls.set("dup-token", v);
    $("token-input").value = "";
    $("token-status").textContent = "Token salvo neste celular.";
    renderToken(); renderCat();
  };
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
      busy = null; renderToken(); renderCat();
    }
  };

  /* ---------- Leitura do catálogo ---------- */
  function renderCat() {
    $("cat-count").textContent = fmt(cat.works.size);
    const p = cat.progress;
    const when = cat.savedAt ? new Date(cat.savedAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : null;
    const reading = busy === "catalog" || busy === "letters" || busy === "details";
    if (!reading) {
      $("cat-meta").textContent = !cat.works.size ? "Nada lido ainda. A leitura passa por todas as páginas da MediocreScan, uma de cada vez. Deixe o app aberto: a tela fica acesa."
        : p && p.step !== "pronto" ? `Leitura parada em ${STEP_NAME[p.step] || p.step}, página ${p.page}. Toque em Continuar para seguir de onde parou. Salvo em ${when}.`
        : `Leitura completa${p && p.buscaOk ? " pela busca geral" : " pelas listas"}, salva em ${when}.`;
    }
    $("cat-read").textContent = p && p.step !== "pronto" && cat.works.size ? "Continuar leitura" : cat.works.size ? "Ler de novo (atualizar)" : "Ler todas as obras";
    $("cat-read").hidden = reading;
    $("cat-stop").hidden = !reading;
    $("cat-letters").hidden = reading || !cat.works.size;
    $("cat-letters").textContent = cat.lettersNext ? `Continuar a busca por letra (de “${cat.lettersNext}”)` : "Completar buscando cada letra (mais demorado)";
    $("find-run").disabled = !cat.works.size || reading;
    $("deep-run").disabled = reading;
    $("token-test").disabled = !getToken() || Boolean(busy);
  }
  function elapsed() {
    const s = Math.round((Date.now() - runStart) / 1000);
    return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, "0")} s`;
  }
  function onEvent(e) {
    const run = $("run");
    if (e.type === "wait") {
      clearInterval(waitTimer);
      run.classList.add("waiting");
      let left = e.seconds;
      const tick = () => {
        $("run-text").textContent = `A MediocreScan recusou (${e.reason}). Esperando ${left >= 60 ? `${Math.floor(left / 60)} min ${String(left % 60).padStart(2, "0")} s` : `${left} s`} para tentar de novo (${e.attempt} de ${e.max}).`;
        left = Math.max(0, left - 1);
      };
      tick(); waitTimer = setInterval(tick, 1000);
      return;
    }
    if (e.type === "resume") { clearInterval(waitTimer); run.classList.remove("waiting"); $("run-text").textContent = "Tentando de novo…"; return; }
    if (e.type === "method") {
      $("run-sub").textContent = e.ok ? `A busca geral funciona: ${fmt(e.totalItems)} obras em ${fmt(e.totalPages)} páginas.` : "A busca geral não lista tudo: lendo as listas de adicionadas e atualizadas.";
      return;
    }
    if (e.type === "page") {
      const bar = $("run-bar").parentElement;
      bar.classList.toggle("indet", !e.pages);
      if (e.pages) $("run-bar").style.width = `${Math.min(100, Math.round((e.page / e.pages) * 100))}%`;
      $("run-text").textContent = `${STEP_NAME[e.step] || e.step}${e.letter ? ` “${e.letter}”` : ""}: página ${fmt(e.page)}${e.pages ? ` de ${fmt(e.pages)}` : ""} · +${e.added} nova${e.added === 1 ? "" : "s"}`;
      if (!/A busca geral/.test($("run-sub").textContent) || e.step !== "busca") $("run-sub").textContent = `${fmt(e.count)} obras lidas · ${elapsed()}`;
      else $("run-sub").textContent = `${fmt(e.count)} de ${fmt(e.totalItems)} obras · ${elapsed()}`;
      $("cat-count").textContent = fmt(e.count);
      return;
    }
    if (e.type === "detail") {
      $("run-bar").parentElement.classList.remove("indet");
      $("run-bar").style.width = `${Math.round((e.n / e.of) * 100)}%`;
      $("run-text").textContent = `Detalhes: ${e.n} de ${e.of} · ${e.title}`;
      $("run-sub").textContent = elapsed();
    }
  }
  async function runTask(kind, fn) {
    if (busy) return;
    if (!getToken()) { toast("Coloque o token da MediocreScan primeiro."); $("token-input").focus(); return; }
    busy = kind; runStart = Date.now();
    reader = makeReader();
    $("run").hidden = false; $("run").classList.remove("waiting");
    $("run-bar").style.width = "0%"; $("run-bar").parentElement.classList.add("indet");
    $("run-text").textContent = "Começando…"; $("run-sub").textContent = "";
    $("cat-meta").textContent = "Deixe o app aberto enquanto lê: a tela fica acesa. Parar guarda o que já foi lido.";
    renderCat(); renderToken();
    let ok = false;
    try { await fn(reader); ok = true; }
    catch (e) {
      if (e && e.stopped) toast("Leitura parada. O que já foi lido está salvo.");
      else { toast(e.message || String(e)); $("run-text").textContent = e.message || String(e); }
    } finally {
      clearInterval(waitTimer);
      busy = null; reader = null;
      await saveCatalog();
      $("run").hidden = ok || !$("run-text").textContent || /Começando/.test($("run-text").textContent);
      renderCat(); renderToken();
    }
    return ok;
  }
  $("cat-read").onclick = async () => {
    // Leitura completa feita: recomeça do zero (mantém as obras e soma as novas).
    if (cat.progress && cat.progress.step === "pronto") cat.progress = null;
    const ok = await runTask("catalog", (r) => r.readCatalog(cat, saveCatalog));
    if (ok) { toast(`Leitura completa: ${fmt(cat.works.size)} obras.`); find(); }
  };
  $("cat-letters").onclick = async () => {
    const ok = await runTask("letters", (r) => r.readLetters(cat, saveCatalog, cat.lettersNext));
    if (ok) { toast(`Busca por letra completa: ${fmt(cat.works.size)} obras.`); find(); }
  };
  $("cat-stop").onclick = () => { if (reader) reader.stop(); $("run-text").textContent = "Parando…"; };

  /* ---------- Procurar ---------- */
  function suspects() {
    if (!result) return [];
    const ids = new Set();
    for (const g of result.groups) for (const w of g.works) if (!cat.works.get(w.id) || !cat.works.get(w.id).detailed) ids.add(w.id);
    return Array.from(ids);
  }
  function find() {
    if (!cat.works.size) return;
    result = Dup.findDuplicates(Array.from(cat.works.values()), { min: Number(settings.min) || 55, ignore: settings.ignore, dismissed });
    const n = { alta: 0, provavel: 0, talvez: 0 };
    result.groups.forEach((g) => n[g.level]++);
    $("levels").hidden = false;
    for (const k of Object.keys(n)) $("n-" + k).textContent = fmt(n[k]);
    $("find-meta").textContent = `${fmt(result.groups.length)} grupo(s) em ${fmt(cat.works.size)} obras · ${fmt(result.compared)} comparações em ${result.ms < 1000 ? `${result.ms} ms` : `${(result.ms / 1000).toFixed(1)} s`}.`;
    const tc = $("tab-count");
    tc.hidden = !result.groups.length; tc.textContent = fmt(result.groups.length);
    const sus = suspects();
    $("deep").hidden = !sus.length;
    const secs = Math.round(sus.length * Math.max(1, Number(settings.gap) || 2.5));
    $("deep-text").textContent = sus.length ? `Para confirmar com nomes alternativos, sinopse e número de capítulos, o app lê os detalhes das ${fmt(sus.length)} obras suspeitas (1 pedido cada, uns ${secs < 120 ? `${secs} s` : `${Math.round(secs / 60)} min`}).` : "";
    gShown = PAGE; renderGroups();
  }
  $("find-run").onclick = () => { find(); toast(result && result.groups.length ? `${fmt(result.groups.length)} grupo(s) de possíveis duplicadas.` : "Nenhuma duplicada encontrada."); };
  $("deep-run").onclick = async () => {
    const ids = suspects();
    if (!ids.length) return;
    const ok = await runTask("details", (r) => r.readDetails(cat, ids, saveCatalog));
    if (ok) { find(); toast("Suspeitas conferidas: a lista foi atualizada."); }
  };
  document.querySelectorAll(".levels [data-go]").forEach((b) => { b.onclick = () => { setFilter(b.dataset.go); showTab("grupos"); }; });

  /* ---------- Grupos ---------- */
  const PAGE = 30;
  let gFilter = "todas", gShown = PAGE;
  function setFilter(f) {
    gFilter = f; gShown = PAGE;
    document.querySelectorAll(".filters [data-f]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.f === f)));
  }
  document.querySelectorAll(".filters [data-f]").forEach((b) => { b.onclick = () => { setFilter(b.dataset.f); renderGroups(); }; });
  $("g-q").oninput = () => { gShown = PAGE; renderGroups(); };
  function filteredGroups() {
    if (!result) return [];
    const q = Dup.normalize($("g-q").value);
    return result.groups.filter((g) => (gFilter === "todas" || g.level === gFilter) && (!q || g.works.some((w) => String(w.id) === q || Dup.normalize([w.title].concat(w.alts || []).join(" ")).includes(q))));
  }
  function el(tag, props, ...kids) {
    const n = document.createElement(tag);
    if (props) for (const [k, v] of Object.entries(props)) { if (v == null) continue; if (k === "className") n.className = v; else if (k === "text") n.textContent = v; else n.setAttribute(k, v); }
    for (const c of kids) if (c != null) n.append(c);
    return n;
  }
  function cover(w, style) {
    if (w.cover) {
      const img = el("img", { src: w.cover, alt: "", loading: "lazy", style });
      img.onerror = () => img.replaceWith(el("span", { className: "ph", style, text: (w.title || "?").slice(0, 1) }));
      return img;
    }
    return el("span", { className: "ph", style, text: (w.title || "?").slice(0, 1) });
  }
  function meta(w) {
    const full = cat.works.get(w.id) || w;
    return [`#${full.id}`, full.format, full.chapters != null ? `${fmt(full.chapters)} cap.` : null, full.status].filter(Boolean).join(" · ");
  }
  function groupCard(g) {
    const li = el("li", { className: `group ${g.level}` });
    li.append(el("div", { className: "g-head" },
      el("span", { className: "badge" }, el("b", { text: String(g.score) }), LEVEL_NAME[g.level]),
      el("span", { className: "g-n", text: `${g.works.length} obras` })));
    const stack = el("div", { className: "stack", "aria-hidden": "true" });
    g.works.slice(0, 5).forEach((w, i) => stack.append(cover(cat.works.get(w.id) || w, `left:${i * 34}px;transform:rotate(${i % 2 ? 2 : -2}deg) translateY(${i % 2 ? 3 : 0}px);z-index:${10 - i}`)));
    li.append(stack);
    const ol = el("ol", { className: "g-works" });
    for (const w of g.works) {
      const full = cat.works.get(w.id) || w;
      const alts = (full.alts || []).slice(0, 3).join(" · ");
      ol.append(el("li", {}, el("div", {}, el("p", { className: "t", text: full.title }), el("p", { className: "m", text: meta(full) }), alts ? el("p", { className: "m", text: `Também: ${alts}` }) : null)));
    }
    li.append(ol);
    const why = el("ul", { className: "why" });
    const idx = new Map(g.works.map((w, i) => [String(w.id), i + 1]));
    for (const p of g.pairs.slice(0, 4)) {
      const tag = g.works.length > 2 ? el("span", { className: "pair", text: `${idx.get(String(p.a.id))} e ${idx.get(String(p.b.id))}: ` }) : null;
      why.append(el("li", {}, tag, p.reasons.slice(0, 3).join("; ") + "."));
      for (const n of p.notes) why.append(el("li", { className: "warn" }, tag ? tag.cloneNode(true) : null, n + "."));
    }
    li.append(why);
    const copy = el("button", { type: "button", className: "btn ghost small", text: "Copiar IDs" });
    copy.onclick = () => copyText(g.works.map((w) => `${w.id} — ${(cat.works.get(w.id) || w).title}`).join("\n"), "IDs copiados.");
    const no = el("button", { type: "button", className: "btn ghost small", text: "Não é duplicada" });
    no.onclick = () => {
      const keys = g.pairs.map((p) => Dup.pairKey(String(p.a.id), String(p.b.id)));
      keys.forEach((k) => dismissed.add(k)); saveDismissed(); find();
      toast("Grupo dispensado.", { label: "Desfazer", run: () => { keys.forEach((k) => dismissed.delete(k)); saveDismissed(); find(); } });
    };
    li.append(el("div", { className: "g-acts" }, copy, no));
    return li;
  }
  function renderGroups() {
    const list = $("g-list");
    list.innerHTML = "";
    const gs = filteredGroups();
    $("g-empty").hidden = gs.length > 0;
    $("g-empty").textContent = !cat.works.size ? "Leia o catálogo na aba Análise e toque em Procurar agora." : !result ? "Toque em Procurar agora na aba Análise." : "Nenhum grupo com esse filtro.";
    $("g-meta").textContent = result ? `${fmt(gs.length)} grupo(s)${dismissed.size ? ` · ${fmt(dismissed.size)} par(es) dispensado(s)` : ""}` : "";
    gs.slice(0, gShown).forEach((g) => list.append(groupCard(g)));
    $("g-more").hidden = gs.length <= gShown;
    $("g-more").textContent = `Mostrar mais (${fmt(gs.length - gShown)})`;
    $("g-copy").hidden = !gs.length;
  }
  $("g-more").onclick = () => { gShown += PAGE; renderGroups(); };
  $("g-copy").onclick = () => {
    const gs = filteredGroups();
    const lines = [`Duplicadas da MediocreScan — ${new Date().toLocaleString("pt-BR")}`, `${gs.length} grupo(s) em ${cat.works.size} obras`, ""];
    gs.forEach((g, i) => {
      lines.push(`${i + 1}. ${LEVEL_NAME[g.level]} (${g.score})`);
      g.works.forEach((w) => lines.push(`   ${w.id} — ${(cat.works.get(w.id) || w).title}`));
      lines.push(`   Por quê: ${g.pairs[0].reasons.join("; ")}${g.pairs[0].notes.length ? ` | ${g.pairs[0].notes.join("; ")}` : ""}`);
      lines.push("");
    });
    copyText(lines.join("\n"), "Relatório copiado.");
  };
  async function copyText(text, msg) {
    try { await navigator.clipboard.writeText(text); toast(msg); return; } catch (_) { /* tenta do jeito antigo */ }
    const ta = el("textarea", { style: "position:fixed;opacity:0" }); ta.value = text; document.body.append(ta); ta.select();
    try { document.execCommand("copy"); toast(msg); } catch (_) { toast("Não deu para copiar."); }
    ta.remove();
  }

  /* ---------- Catálogo ---------- */
  let cShown = 50;
  $("c-q").oninput = () => { cShown = 50; renderCatalog(); };
  function groupOf(id) { return result ? result.groups.find((g) => g.works.some((w) => w.id === id)) : null; }
  function renderCatalog() {
    const q = $("c-q").value.trim();
    const all = Array.from(cat.works.values());
    const list = $("c-list");
    list.innerHTML = "";
    if (!all.length) { $("c-meta").textContent = "Leia o catálogo na aba Análise primeiro."; $("c-more").hidden = true; return; }
    const hits = !q ? [] : /^\d+$/.test(q) ? all.filter((w) => String(w.id) === q) : Dup.search(all, q, { ignore: settings.ignore });
    $("c-meta").textContent = !q ? `${fmt(all.length)} obras salvas. Digite uma palavra-chave para achar obras parecidas à mão.` : `${fmt(hits.length)} obra(s) com “${q}”.`;
    hits.slice(0, cShown).forEach((w) => {
      const g = groupOf(w.id);
      const dupe = g ? el("button", { type: "button", className: "dupe", text: `${LEVEL_NAME[g.level]}: ${g.works.length} obras parecidas` }) : null;
      if (dupe) dupe.onclick = () => { setFilter("todas"); $("g-q").value = String(w.id); showTab("grupos"); };
      list.append(el("li", { className: "work" }, cover(w), el("div", {}, el("p", { className: "t", text: w.title }), el("p", { className: "m", text: meta(w) }),
        w.alts && w.alts.length ? el("p", { className: "m", text: `Também: ${w.alts.slice(0, 3).join(" · ")}` }) : null, dupe)));
    });
    $("c-more").hidden = hits.length <= cShown;
    $("c-more").textContent = `Mostrar mais (${fmt(hits.length - cShown)})`;
  }
  $("c-more").onclick = () => { cShown += 50; renderCatalog(); };

  /* ---------- Ajustes ---------- */
  $("set-gap").value = String(settings.gap);
  $("set-min").value = String(settings.min);
  $("set-ignore").value = settings.ignore;
  $("set-gap").onchange = () => { const v = Number($("set-gap").value); settings.gap = Number.isFinite(v) ? Math.max(1, Math.min(60, v)) : 2.5; $("set-gap").value = String(settings.gap); saveSettings(); find(); };
  $("set-min").onchange = () => { settings.min = Number($("set-min").value) || 55; saveSettings(); find(); };
  $("set-ignore").onchange = () => { settings.ignore = $("set-ignore").value; saveSettings(); find(); };
  $("set-reset-dismissed").onclick = () => { const n = dismissed.size; dismissed = new Set(); saveDismissed(); find(); toast(n ? `${n} par(es) de volta na lista.` : "Nenhum par dispensado."); };
  $("set-clear").onclick = async () => {
    if (busy) return;
    if (!confirm("Apagar o catálogo salvo neste celular? O token continua salvo.")) return;
    cat.works = new Map(); cat.progress = null; cat.lettersNext = null; cat.savedAt = null; result = null;
    await store.del("catalog");
    $("levels").hidden = true; $("deep").hidden = true; $("find-meta").textContent = ""; $("tab-count").hidden = true;
    renderCat(); toast("Catálogo apagado.");
  };

  /* ---------- Início ---------- */
  (async () => {
    renderToken();
    await loadCatalog();
    renderCat();
    if (cat.works.size) find();
    if (window.BM_VERSION) $("find-meta").title = `Versão ${window.BM_VERSION}`;
  })();
})();
