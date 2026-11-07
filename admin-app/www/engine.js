/*
 * Estúdio Better Mangá — lógica de envio (sem tela).
 * O celular busca na MediocreScan (pelo IP dele, que não está bloqueado) e envia ao site.
 * Ritmo: uma obra por vez até o fim, 2 capítulos por envio, 20 s entre envios,
 * pausa de 1 minuto quando a API trava. Roda no app e nos testes (Node).
 */
(function (root) {
  "use strict";

  // Todas as rotas da API usam o domínio novo; o caminho continua o mesmo.
  const API_HOSTS = ["https://api.mediocretoons.net"];
  const CDN = "https://cdn.mediocrescan.com";
  // 2 capítulos por envio e 1 minuto de espera antes dos próximos 2.
  // apiGapMs: durante o envio, 1 pedido à API da MediocreScan por minuto (as páginas no CDN não contam).
  const PACE = { perSend: 2, waitMs: 60000, lockMs: 60000, maxLocksInRow: 5, gapMs: 1500, apiGapMs: 60000, netRetries: 3, netWaitMs: 20000 };
  const LIST_PAGE = { "/obras/adicionados-recentes": 20, "/obras/atualizadas-recentes": 30 };
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  class Stopped extends Error { constructor() { super("Envio parado."); } }
  class Fatal extends Error {}

  const unwrap = (d) => (d && typeof d === "object" && !Array.isArray(d) && d.data && typeof d.data === "object" && !Array.isArray(d.data) ? d.data : d);
  function listOf(data) {
    const d = unwrap(data);
    if (Array.isArray(d)) return d;
    if (d && typeof d === "object") for (const k of ["obras", "data", "items", "results", "lista"]) if (Array.isArray(d[k])) return d[k];
    return [];
  }
  function contentPath(m) {
    const obra = m && m.obr_id, num = m && m.cap_num, uuid = m && m.cap_uuid;
    return Number.isSafeInteger(obra) && obra > 0 && typeof num === "number" && num >= 0 && typeof uuid === "string" && UUID.test(uuid)
      ? `/obras/${obra}/capitulos/${num}/${uuid}.json` : null;
  }
  function coverOf(o, id) {
    const v = o.obr_imagem || o.imagem;
    if (typeof v !== "string" || !v) return null;
    if (/^https:\/\//.test(v)) return v;
    return /^[\w.-]+$/.test(v) ? `${CDN}/obras/${id}/${encodeURIComponent(v)}` : null;
  }
  /** Normaliza um item de lista/busca da API para {id, name, cover}. */
  function toWork(o) {
    const id = Number(o && (o.obr_id ?? o.id));
    if (!Number.isSafeInteger(id) || id <= 0) return null;
    return { id, name: String(o.obr_nome ?? o.nome ?? `Obra ${id}`), cover: coverOf(o, id) };
  }

  /**
   * deps: fetch, sleep(ms), now(), mediocreToken(), site: { url(), headers(), refresh() },
   * onEvent({type, ...}) para a tela acompanhar.
   */
  function createEngine(deps) {
    const emit = (e) => { try { deps.onEvent && deps.onEvent(e); } catch (_) { /* tela não deve parar o envio */ } };
    // lastPairAt vale para o app inteiro: entre lotes, entre obras e entre envios seguidos.
    let apiIdx = 0, lastApiCall = null, lastCdnCall = null, locksInRow = 0, stopFlag = false, running = false, lastLockEnd = null, lastPairAt = null;
    // Horários guardados no celular: se o app reiniciar, a espera de 1 minuto continua valendo.
    try {
      const saved = deps.pace && deps.pace.load ? deps.pace.load() : null;
      const fresh = (v) => (Number.isFinite(v) && v <= deps.now() && deps.now() - v < 10 * 60_000 ? v : null);
      if (saved) { lastApiCall = fresh(saved.api); lastPairAt = fresh(saved.pair); lastLockEnd = fresh(saved.lock); }
    } catch (_) { /* sem horários guardados */ }
    const savePace = () => { try { if (deps.pace && deps.pace.save) deps.pace.save({ api: lastApiCall, pair: lastPairAt, lock: lastLockEnd }); } catch (_) { /* ok */ } };

    function checkStop() { if (stopFlag) throw new Stopped(); }
    /** Espera em pedaços curtos para o botão "Parar" responder rápido. */
    async function wait(ms) {
      const end = deps.now() + ms;
      while (deps.now() < end) { checkStop(); await deps.sleep(Math.min(500, end - deps.now())); }
      checkStop();
    }
    /** Falha de conexão no meio do envio: espera e tenta de novo, em vez de pular o capítulo. */
    async function netRetry(where, attempt, detail) {
      if (attempt >= PACE.netRetries) throw new Fatal(`Sem resposta ${where} depois de ${PACE.netRetries} tentativas (${detail}). O envio parou aqui e continua deste ponto quando você tocar em Continuar.`);
      emit({ type: "net-retry", where, detail, attempt: attempt + 1, max: PACE.netRetries, ms: PACE.netWaitMs });
      await wait(PACE.netWaitMs);
    }

    /**
     * 1 minuto a cada 2 capítulos, sempre: conta do fim do último par enviado, mesmo que tenha sido
     * de outra obra ou de outro envio. Depois de uma pausa por travamento, conta do fim da pausa.
     */
    async function pairWait() {
      const marks = [lastPairAt, lastLockEnd].filter((v) => v !== null);
      if (!marks.length) return;
      const ms = Math.max(0, PACE.waitMs - (deps.now() - Math.max(...marks)));
      if (ms > 0) { emit({ type: "waiting", ms }); await wait(ms); }
    }

    async function lockPause(reason) {
      locksInRow++;
      if (locksInRow > PACE.maxLocksInRow) throw new Fatal(`A MediocreScan continua travada (${reason}). Tente de novo mais tarde.`);
      emit({ type: "pause", ms: PACE.lockMs, reason, count: locksInRow, max: PACE.maxLocksInRow });
      await wait(PACE.lockMs);
      lastLockEnd = deps.now(); savePace();
      emit({ type: "resume" });
    }

    /** patient=true (envio): espera 1 min quando a API trava. false (navegação): avisa e não trava a tela. */
    async function mediocre(kind, path, patient) {
      if (patient === undefined) patient = true;
      const token = (deps.mediocreToken() || "").trim().replace(/^Bearer\s+/i, "");
      if (!token && kind === "api") throw new Fatal("Cole sua chave da MediocreScan nas configurações.");
      let netFails = 0;
      for (;;) {
        checkStop();
        // Durante o envio: 1 minuto entre pedidos à API; navegação fora do envio só evita toques duplos.
        const slow = patient || running;
        const last = kind === "api" ? lastApiCall : lastCdnCall;
        const gapMs = kind === "api" ? (slow ? PACE.apiGapMs : 250) : (slow ? PACE.gapMs : 250);
        const gap = last === null ? 0 : last + gapMs - deps.now();
        if (gap > 0) {
          if (kind === "api" && gap > 2000) emit({ type: "api-wait", ms: gap });
          await wait(gap);
        }
        if (kind === "api") { lastApiCall = deps.now(); savePace(); } else lastCdnCall = deps.now();
        let r;
        try {
          r = await deps.fetch((kind === "cdn" ? CDN : API_HOSTS[apiIdx]) + path, {
            headers: Object.assign({ Accept: "application/json" }, kind === "api" ? { Authorization: `Bearer ${token}` } : {}),
          });
        } catch (_) {
          if (kind === "api" && apiIdx < API_HOSTS.length - 1) { apiIdx++; continue; }
          if (!patient) throw new Error("Sem conexão com a MediocreScan. Confira a internet do celular.");
          await netRetry("da MediocreScan", netFails++, "sem conexão"); continue;
        }
        if (kind === "api" && r.status >= 520 && r.status <= 530 && apiIdx < API_HOSTS.length - 1) { apiIdx++; continue; }
        if (r.status === 401) throw new Fatal("A MediocreScan recusou sua chave (401). Cole uma chave nova nas configurações.");
        if (r.status === 429 || r.status === 403) {
          const body = r.status === 403 ? String(await r.text().catch(() => "")).slice(0, 300) : "";
          const reason = r.status === 429 ? "pedidos demais" : /ip\s+bloquead/i.test(body) ? "IP bloqueado" : "acesso recusado";
          if (!patient) throw new Error(`A MediocreScan pediu uma pausa (${reason}). Tente de novo em 1 minuto.`);
          await lockPause(reason);
          continue;
        }
        locksInRow = 0;
        if (r.status === 404) return null;
        if (r.status >= 500 && patient) { await netRetry("da MediocreScan", netFails++, `erro ${r.status}`); continue; }
        if (!r.ok) throw new Error(`A MediocreScan respondeu ${r.status}.`);
        try { return await r.json(); }
        catch (_) { if (!patient) throw new Error("Resposta incompleta da MediocreScan."); await netRetry("da MediocreScan", netFails++, "resposta incompleta"); continue; }
      }
    }

    async function site(body, retried, hops, netFails) {
      checkStop();
      hops = hops || 0; netFails = netFails || 0;
      const endpoint = `${deps.site.url().replace(/\/+$/, "")}/api/public/mediocre-ingest`;
      let r;
      try {
        r = await deps.fetch(endpoint, {
          method: "POST",
          headers: Object.assign({ "content-type": "application/json" }, deps.site.headers()),
          body: JSON.stringify(body),
        });
      } catch (_) {
        if (!running) throw new Error("Sem conexão com o site. Confira a internet e o endereço do site.");
        await netRetry("do site", netFails, "sem conexão");
        return site(body, retried, hops, netFails + 1);
      }
      // O site pode responder que mudou de endereço (ex.: domínio próprio). Segue e passa a usar o novo.
      if (r.status === 301 || r.status === 302 || r.status === 303 || r.status === 307 || r.status === 308) {
        const loc = r.headers && typeof r.headers.get === "function" ? r.headers.get("location") : null;
        let next = null;
        try { next = loc ? new URL(loc, endpoint) : null; } catch (_) { next = null; }
        const here = new URL(endpoint);
        if (next && next.protocol === "https:" && next.origin !== here.origin && hops < 3) {
          if (deps.site.moved) deps.site.moved(next.origin);
          emit({ type: "log", text: `O site agora responde em ${next.host}.` });
          return site(body, retried, hops + 1);
        }
        if (next && next.origin === here.origin && /manutencao/.test(next.pathname)) throw new Fatal("O site está em manutenção. Tente de novo depois.");
        throw new Fatal(`O site redirecionou o pedido${next ? ` para ${next.host}${next.pathname}` : ""}. Coloque o endereço certo em "Endereço do site".`);
      }
      const j = await r.json().catch(() => ({}));
      if (r.status === 401 && !retried && (await deps.site.refresh())) return site(body, true, hops);
      if (r.status === 401) throw new Fatal(j.error || "Sua sessão acabou. Entre de novo.");
      if (r.status === 403) throw new Fatal(j.error || "Esta conta não é administradora do site.");
      if (r.status === 503) throw new Fatal("O site está em manutenção. Tente de novo depois.");
      if (r.status >= 500 && running) { await netRetry("do site", netFails, `erro ${r.status}`); return site(body, retried, hops, netFails + 1); }
      if (!r.ok) throw new Error(j.error || `O site respondeu ${r.status}.`);
      return j;
    }

    const P = root.BMParse;
    const browse = (path) => mediocre("api", path, false);
    /** Listas de obras. kind: inicio | novas | atualizadas | ia | recomendacoes. */
    async function list(kind, page) {
      const off = (size) => (page > 1 ? `offset=${(page - 1) * size}` : "");
      let raw;
      if (kind === "inicio") {
        try { raw = await browse("/obras/home"); }
        catch (e) { if (!/400/.test(e.message)) throw e; raw = await browse("/obras/home?formato=1"); }
      } else if (kind === "ia") raw = await browse("/obras/atualizadas-recentes-ia");
      else if (kind === "recomendacoes") raw = await browse("/recomendacoes/minhas");
      else if (kind === "atualizadas") { const q = off(LIST_PAGE["/obras/atualizadas-recentes"]); raw = await browse(`/obras/atualizadas-recentes${q ? `?${q}` : ""}`); }
      else { const q = off(LIST_PAGE["/obras/adicionados-recentes"]); raw = await browse(`/obras/adicionados-recentes${q ? `?${q}` : ""}`); }
      return { works: P.parseWorks(raw), raw };
    }
    async function search(text, page) {
      const t = String(text).replace(/\s+/g, " ").trim().slice(0, 80);
      // Número puro: abre direto pelo ID, como no leitor.
      if (/^\d{1,9}$/.test(t)) { const w = await work(Number(t)); return { works: w.work ? [w.work] : [], raw: w.raw }; }
      const q = new URLSearchParams({ string: t });
      if (page > 1) q.set("pagina", String(page));
      const raw = await browse(`/obras/buscar?${q}`);
      return { works: P.parseWorks(raw), raw };
    }
    async function lists() { const raw = await browse("/listas"); return { lists: P.parseLists(raw), raw }; }
    async function reading() { const raw = await browse("/readings/user/156358/chapters"); return { chapters: P.findList(raw).map(P.parseChapter).filter(Boolean), raw }; }
    async function work(id) {
      const raw = await browse(`/obras/${id}`);
      if (!raw) throw new Error("Obra não encontrada na MediocreScan.");
      return { work: P.parseWorkResponse(raw), raw };
    }
    /** Conteúdo de um capítulo: dados na API, páginas/texto no CDN (caminho montado só com dados da API). */
    async function chapter(capId) {
      const raw = await browse(`/capitulos/${capId}`);
      if (!raw) throw new Error("Capítulo não encontrado.");
      const meta = unwrap(raw);
      const ch = P.parseChapterResponse(raw);
      const path = contentPath(meta);
      let blocks = [], contentRaw = null;
      if (path) {
        try { contentRaw = await mediocre("cdn", path, false); blocks = contentRaw ? P.normalizeContent(contentRaw, `${CDN}${path}`) : []; }
        catch (_) { blocks = []; }
      }
      if (!blocks.length && ch && ch.text) blocks = P.paragraphs(ch.text);
      return { chapter: ch, blocks, raw, contentRaw };
    }
    async function thumbs(workId) {
      try { const raw = await mediocre("cdn", `/obras/${workId}/thumbs-capitulos.json`, false); return raw ? P.parseThumbs(raw, `${CDN}/obras/${workId}/`) : {}; }
      catch (_) { return {}; }
    }
    /** Quais IDs já estão no site e quais já estão na fila. */
    async function status(ids) {
      const imported = new Set(), queued = new Set();
      for (let i = 0; i < ids.length; i += 100) {
        const r = await site({ action: "check", ids: ids.slice(i, i + 100) });
        (r.imported || []).forEach((id) => imported.add(id));
        (r.queued || []).forEach((id) => queued.add(id));
      }
      return { imported, queued };
    }
    const plan = () => site({ action: "plan", syncLimit: 0 });
    async function enqueue(works) {
      for (let i = 0; i < works.length; i += 50) await site({ action: "enqueue", items: works.slice(i, i + 50).map((w) => ({ obraId: w.id, title: w.name || w.title || null })) });
    }

    /** Capítulos da lista da obra, por ID (para não pedir cada capítulo à API quando der). */
    function listEntries(work) {
      const w = unwrap(work);
      const map = new Map();
      (w && Array.isArray(w.capitulos) ? w.capitulos : []).forEach((c) => { const cid = Number(c && (c.cap_id ?? c.id)); if (Number.isSafeInteger(cid)) map.set(cid, c); });
      return { map, obrId: Number(w && (w.obr_id ?? w.id)) || null };
    }
    /**
     * Dados + conteúdo de um capítulo. Se a lista da obra já tem o UUID, vai direto às páginas no CDN
     * (nenhum pedido à API); senão pede o capítulo à API, respeitando 1 pedido por minuto.
     */
    async function chapterData(capId, entries) {
      const e = entries.map.get(capId);
      if (e && typeof e.cap_uuid === "string") {
        const meta = Object.assign({ obr_id: entries.obrId }, e);
        const path = contentPath(meta);
        if (path) {
          let content = null;
          try { content = await mediocre("cdn", path); } catch (err) { if (err instanceof Stopped || err instanceof Fatal) throw err; }
          if (content) return { meta, content };
        }
      }
      const meta = unwrap(await mediocre("api", `/capitulos/${capId}`));
      if (!meta || typeof meta !== "object") return null;
      const path = contentPath(meta);
      let content = null;
      if (path) { try { content = await mediocre("cdn", path); } catch (err) { if (err instanceof Stopped || err instanceof Fatal) throw err; } }
      return { meta, content };
    }

    /** Envia UMA obra inteira; se parar no meio, o site guarda onde parou. */
    async function sendWork(id, name) {
      const work = await mediocre("api", `/obras/${id}`);
      if (!work) {
        await site({ action: "finish", obraId: id, added: 0, remaining: 0 });
        emit({ type: "work-done", id, name, added: 0, skipped: 0, note: "não encontrada na MediocreScan" });
        return { added: 0, skipped: 0, remaining: 0 };
      }
      const w = await site({ action: "work", obraId: id, work, publish: true });
      const pending = Array.isArray(w.pendingCapIds) ? w.pendingCapIds : [];
      const total = Number.isSafeInteger(w.remaining) ? w.remaining : pending.length;
      const entries = listEntries(work);
      const title = (unwrap(work) && unwrap(work).obr_nome) || name || `Obra ${id}`;
      emit({ type: "work-start", id, name: title, slug: w.slug, created: w.created, total });
      let added = 0, skipped = 0, tried = 0;
      try {
        for (let i = 0; i < pending.length; i += PACE.perSend) {
          await pairWait();
          const group = pending.slice(i, i + PACE.perSend);
          emit({ type: "sending", from: tried + 1, to: tried + group.length, total });
          const chapters = [];
          for (const capId of group) {
            try {
              const data = await chapterData(capId, entries);
              if (!data) continue;
              chapters.push({ capId, meta: data.meta, content: data.content });
            } catch (e) {
              if (e instanceof Stopped || e instanceof Fatal) throw e;
              emit({ type: "log", text: `Capítulo ${capId}: ${e.message}` });
            }
          }
          tried += group.length;
          skipped += group.length - chapters.length;
          if (chapters.length) {
            const r = await site({ action: "chapters", obraId: id, chapters });
            added += r.added || 0;
            skipped += r.skipped || 0;
          }
          lastPairAt = deps.now(); savePace(); // o próximo par só sai 1 minuto depois deste terminar
          emit({ type: "progress", id, done: Math.min(tried, total), total, added, skipped });
        }
      } finally {
        // Mesmo parando no meio, o site fica sabendo o que falta e retoma esta obra primeiro.
        const remaining = Math.max(total - tried, 0);
        stopFlag ? await sendFinishQuietly(id, added, remaining) : await site({ action: "finish", obraId: id, added, remaining });
      }
      emit({ type: "work-done", id, name: title, added, skipped });
      return { added, skipped, remaining: 0 };
    }
    async function sendFinishQuietly(id, added, remaining) {
      const was = stopFlag; stopFlag = false;
      try { await site({ action: "finish", obraId: id, added, remaining }); } catch (_) { /* melhor esforço */ }
      stopFlag = was;
    }

    /**
     * Envia só os capítulos escolhidos de uma obra (botão ao lado de cada capítulo).
     * Os que já estão no site são pulados sem buscar nada; o resto vai de 2 em 2 com a mesma espera.
     */
    async function sendChapters(id, capIds, name) {
      if (running) throw new Error("Já existe um envio em andamento.");
      running = true; stopFlag = false; locksInRow = 0;
      let added = 0, skipped = 0, already = 0;
      emit({ type: "chapters-start", id, name, count: capIds.length });
      try {
        const work = await mediocre("api", `/obras/${id}`);
        if (!work) throw new Fatal("Obra não encontrada na MediocreScan.");
        const w = await site({ action: "work", obraId: id, work, publish: true });
        const pending = new Set(Array.isArray(w.pendingCapIds) ? w.pendingCapIds : []);
        const entries = listEntries(work);
        const todo = capIds.filter((c) => pending.has(c));
        capIds.filter((c) => !pending.has(c)).forEach((c) => { already++; emit({ type: "chapter-state", id, capId: c, state: "site" }); });
        for (let i = 0; i < todo.length; i += PACE.perSend) {
          await pairWait();
          const group = todo.slice(i, i + PACE.perSend);
          group.forEach((c) => emit({ type: "chapter-state", id, capId: c, state: "sending" }));
          emit({ type: "sending", from: i + 1, to: i + group.length, total: todo.length });
          const chapters = [];
          for (const capId of group) {
            try {
              const data = await chapterData(capId, entries);
              if (!data) { emit({ type: "chapter-state", id, capId, state: "fail" }); skipped++; continue; }
              chapters.push({ capId, meta: data.meta, content: data.content });
            } catch (e) {
              if (e instanceof Stopped || e instanceof Fatal) throw e;
              emit({ type: "chapter-state", id, capId, state: "fail" }); skipped++;
              emit({ type: "log", text: `Capítulo ${capId}: ${e.message}` });
            }
          }
          if (chapters.length) {
            const r = await site({ action: "chapters", obraId: id, chapters });
            added += r.added || 0; skipped += r.skipped || 0;
            // O site responde em conjunto; quem falhou aparece na conferência do fim.
            chapters.forEach((c) => emit({ type: "chapter-state", id, capId: c.capId, state: r.skipped ? "check" : "site" }));
          }
          lastPairAt = deps.now(); savePace(); // o próximo par só sai 1 minuto depois deste terminar
          emit({ type: "progress", id, done: Math.min(i + group.length, todo.length), total: todo.length, added, skipped });
        }
        emit({ type: "chapters-done", id, name, added, skipped, already });
      } catch (e) {
        if (e instanceof Stopped) emit({ type: "run-stopped", works: 0, added });
        else emit({ type: "run-error", message: e.message, works: 0, added });
      } finally { running = false; stopFlag = false; }
    }

    /** Envia as obras em ordem, uma de cada vez, até o fim de cada uma. */
    async function run(works) {
      if (running) throw new Error("Já existe um envio em andamento.");
      running = true; stopFlag = false; locksInRow = 0;
      emit({ type: "run-start", count: works.length });
      let totalAdded = 0, done = 0;
      try {
        for (const w of works) {
          checkStop();
          try { totalAdded += (await sendWork(w.id, w.name || w.title)).added; done++; }
          catch (e) {
            if (e instanceof Stopped || e instanceof Fatal) throw e;
            emit({ type: "log", text: `${w.name || w.title || `Obra ${w.id}`}: ${e.message}` });
          }
        }
        emit({ type: "run-done", works: done, added: totalAdded });
      } catch (e) {
        if (e instanceof Stopped) emit({ type: "run-stopped", works: done, added: totalAdded });
        else emit({ type: "run-error", message: e.message, works: done, added: totalAdded });
      } finally { running = false; stopFlag = false; }
    }

    return {
      list, search, lists, reading, work, chapter, thumbs, status, plan, enqueue, run, sendChapters,
      chapterStatus: (obraId) => site({ action: "chapter_status", obraId }),
      queueRemove: (obraIds) => site({ action: "queue_remove", obraIds }),
      queueClear: () => site({ action: "queue_clear" }),
      // Obras que já estão no site (gerenciamento).
      siteList: (filter, q, page, obraId) => site({ action: "site_list", filter, q: q || "", page: page || 1, obraId: obraId || null }),
      siteWork: (seriesId) => site({ action: "site_work", seriesId }),
      siteUpdate: (seriesId, patch) => site({ action: "site_update", seriesId, patch }),
      chapterUpdate: (chapterId, published) => site({ action: "chapter_update", chapterId, published }),
      chapterDelete: (chapterId) => site({ action: "chapter_delete", chapterId }),
      siteDelete: (seriesId) => site({ action: "site_delete", seriesId, confirm: "EXCLUIR" }),
      stop() { if (running) stopFlag = true; },
      get running() { return running; },
    };
  }

  const api = { createEngine, toWork, contentPath, PACE, Stopped, Fatal };
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.BMEngine = api;
})(typeof window !== "undefined" ? window : globalThis);
