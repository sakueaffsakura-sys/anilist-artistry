/*
 * Estúdio Better Mangá — lógica de envio (sem tela).
 * O celular busca na MediocreScan (pelo IP dele, que não está bloqueado) e envia ao site.
 * Ritmo: uma obra por vez até o fim, 2 capítulos por envio, 20 s entre envios,
 * pausa de 1 minuto quando a API trava. Roda no app e nos testes (Node).
 */
(function (root) {
  "use strict";

  const API_HOSTS = ["https://api.mediocretoons.net", "https://back2.mediocrescan.com"];
  const CDN = "https://cdn.mediocrescan.com";
  const PACE = { perSend: 2, waitMs: 20000, lockMs: 60000, maxLocksInRow: 5, gapMs: 1500 };
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
    let apiIdx = 0, lastCall = 0, locksInRow = 0, stopFlag = false, running = false;

    function checkStop() { if (stopFlag) throw new Stopped(); }
    /** Espera em pedaços curtos para o botão "Parar" responder rápido. */
    async function wait(ms) {
      const end = deps.now() + ms;
      while (deps.now() < end) { checkStop(); await deps.sleep(Math.min(500, end - deps.now())); }
      checkStop();
    }
    async function lockPause(reason) {
      locksInRow++;
      if (locksInRow > PACE.maxLocksInRow) throw new Fatal(`A MediocreScan continua travada (${reason}). Tente de novo mais tarde.`);
      emit({ type: "pause", ms: PACE.lockMs, reason, count: locksInRow, max: PACE.maxLocksInRow });
      await wait(PACE.lockMs);
      emit({ type: "resume" });
    }

    async function mediocre(kind, path) {
      const token = (deps.mediocreToken() || "").trim().replace(/^Bearer\s+/i, "");
      if (!token && kind === "api") throw new Fatal("Cole sua chave da MediocreScan nas configurações.");
      for (;;) {
        checkStop();
        const gap = lastCall + PACE.gapMs - deps.now();
        if (gap > 0) await wait(gap);
        lastCall = deps.now();
        let r;
        try {
          r = await deps.fetch((kind === "cdn" ? CDN : API_HOSTS[apiIdx]) + path, {
            headers: Object.assign({ Accept: "application/json" }, kind === "api" ? { Authorization: `Bearer ${token}` } : {}),
          });
        } catch (_) {
          if (kind === "api" && apiIdx < API_HOSTS.length - 1) { apiIdx++; continue; }
          throw new Error("Sem conexão com a MediocreScan. Confira a internet do celular.");
        }
        if (kind === "api" && r.status >= 520 && r.status <= 530 && apiIdx < API_HOSTS.length - 1) { apiIdx++; continue; }
        if (r.status === 401) throw new Fatal("A MediocreScan recusou sua chave (401). Cole uma chave nova nas configurações.");
        if (r.status === 429) { await lockPause("pedidos demais"); continue; }
        if (r.status === 403) {
          const body = String(await r.text().catch(() => "")).slice(0, 300);
          await lockPause(/ip\s+bloquead/i.test(body) ? "IP bloqueado" : "acesso recusado");
          continue;
        }
        locksInRow = 0;
        if (r.status === 404) return null;
        if (!r.ok) throw new Error(`A MediocreScan respondeu ${r.status}.`);
        return r.json();
      }
    }

    async function site(body, retried) {
      checkStop();
      let r;
      try {
        r = await deps.fetch(`${deps.site.url().replace(/\/+$/, "")}/api/public/mediocre-ingest`, {
          method: "POST",
          headers: Object.assign({ "content-type": "application/json" }, deps.site.headers()),
          body: JSON.stringify(body),
        });
      } catch (_) { throw new Error("Sem conexão com o site. Confira a internet e o endereço do site."); }
      const j = await r.json().catch(() => ({}));
      if (r.status === 401 && !retried && (await deps.site.refresh())) return site(body, true);
      if (r.status === 401) throw new Fatal(j.error || "Sua sessão acabou. Entre de novo.");
      if (r.status === 403) throw new Fatal(j.error || "Esta conta não é administradora do site.");
      if (!r.ok) throw new Error(j.error || `O site respondeu ${r.status}.`);
      return j;
    }

    /** Lista da API ("novas" ou "atualizadas"), página a partir de 1. */
    async function list(kind, page) {
      const path = kind === "atualizadas" ? "/obras/atualizadas-recentes" : "/obras/adicionados-recentes";
      const qs = page > 1 ? `?offset=${(page - 1) * LIST_PAGE[path]}` : "";
      return listOf(await mediocre("api", path + qs)).map(toWork).filter(Boolean);
    }
    async function search(text, page) {
      const q = new URLSearchParams({ string: String(text).replace(/\s+/g, " ").trim().slice(0, 80) });
      if (page > 1) q.set("pagina", String(page));
      return listOf(await mediocre("api", `/obras/buscar?${q}`)).map(toWork).filter(Boolean);
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
      for (let i = 0; i < works.length; i += 50) await site({ action: "enqueue", items: works.slice(i, i + 50).map((w) => ({ obraId: w.id, title: w.name || null })) });
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
      const title = (unwrap(work) && unwrap(work).obr_nome) || name || `Obra ${id}`;
      emit({ type: "work-start", id, name: title, slug: w.slug, created: w.created, total });
      let added = 0, skipped = 0, tried = 0;
      try {
        for (let i = 0; i < pending.length; i += PACE.perSend) {
          if (i > 0) { emit({ type: "waiting", ms: PACE.waitMs }); await wait(PACE.waitMs); }
          const group = pending.slice(i, i + PACE.perSend);
          emit({ type: "sending", from: tried + 1, to: tried + group.length, total });
          const chapters = [];
          for (const capId of group) {
            try {
              const meta = unwrap(await mediocre("api", `/capitulos/${capId}`));
              if (!meta || typeof meta !== "object") continue;
              const path = contentPath(meta);
              let content = null;
              if (path) {
                try { content = await mediocre("cdn", path); }
                catch (e) { if (e instanceof Stopped || e instanceof Fatal) throw e; content = null; }
              }
              chapters.push({ capId, meta, content });
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

    /** Envia as obras em ordem, uma de cada vez, até o fim de cada uma. */
    async function run(works) {
      if (running) throw new Error("Já existe um envio em andamento.");
      running = true; stopFlag = false; locksInRow = 0;
      emit({ type: "run-start", count: works.length });
      let totalAdded = 0, done = 0;
      try {
        for (const w of works) {
          checkStop();
          try { totalAdded += (await sendWork(w.id, w.name)).added; done++; }
          catch (e) {
            if (e instanceof Stopped || e instanceof Fatal) throw e;
            emit({ type: "log", text: `${w.name || `Obra ${w.id}`}: ${e.message}` });
          }
        }
        emit({ type: "run-done", works: done, added: totalAdded });
      } catch (e) {
        if (e instanceof Stopped) emit({ type: "run-stopped", works: done, added: totalAdded });
        else emit({ type: "run-error", message: e.message, works: done, added: totalAdded });
      } finally { running = false; stopFlag = false; }
    }

    return {
      list, search, status, plan, enqueue, run,
      stop() { if (running) stopFlag = true; },
      get running() { return running; },
    };
  }

  const api = { createEngine, toWork, contentPath, PACE, Stopped, Fatal };
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.BMEngine = api;
})(typeof window !== "undefined" ? window : globalThis);
