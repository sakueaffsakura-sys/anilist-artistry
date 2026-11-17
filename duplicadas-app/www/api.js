/*
 * Duplicadas — leitura do catálogo da MediocreScan com o token que o dono põe no app (fica só no celular).
 *
 * Ritmo: um pedido de cada vez, com intervalo (padrão 2,5 s, ajustável). Recusa (429/403/5xx) ou queda: espera
 * 1, 2, 5, 10 e 15 min e tenta de novo; depois disso para e mostra o motivo. Token recusado (401): para na hora.
 * Para ler tudo, tenta nesta ordem: a busca sem texto (se a API devolver páginas com total), a lista de obras
 * adicionadas (de 20 em 20) e a de atualizadas (de 30 em 30). O andamento fica salvo: "Continuar" segue de onde parou.
 */
(function (root) {
  "use strict";

  const API = "https://api.mediocretoons.net";
  const CDN = "https://cdn.mediocrescan.com/";
  const BACKOFF_S = [60, 120, 300, 600, 900];
  const LIST = { adicionadas: { path: "/obras/adicionados-recentes", size: 20 }, atualizadas: { path: "/obras/atualizadas-recentes", size: 30 } };
  const MAX_PAGES = 1500;
  // Jeitos de pedir a página N de uma lista (a API pode ignorar um deles): o primeiro que trouxer obras diferentes vale.
  const PAGERS = [
    (L, n) => `offset=${(n - 1) * L.size}`,
    (L, n) => `pagina=${n}`,
    (L, n) => `page=${n}`,
    (L, n) => `offset=${(n - 1) * L.size}&limit=${L.size}`,
    (L, n) => `skip=${(n - 1) * L.size}`,
  ];
  // Se a busca não aceitar uma letra só, usa pares de letras comuns em títulos.
  const BIGRAMS = "an ar as ca ce co da de di do el em en er es ga ia in is la le li lo ma me mi mo na ne no on or os pa pe po ra re ri ro sa se si so ta te ti to tr ur va ve vi".split(" ");

  class Stopped extends Error { constructor() { super("Parado."); this.stopped = true; } }
  class Fatal extends Error {}

  const isObj = (v) => v != null && typeof v === "object" && !Array.isArray(v);
  const str = (o, ...keys) => { for (const k of keys) { const v = o && o[k]; if (typeof v === "string" && v.trim()) return v.trim(); if (typeof v === "number") return String(v); } return null; };
  const int = (o, ...keys) => { for (const k of keys) { const v = o && o[k]; const n = typeof v === "number" ? v : typeof v === "string" && /^\d+$/.test(v.trim()) ? Number(v) : NaN; if (Number.isSafeInteger(n)) return n; } return null; };

  /** Acha a lista de obras em qualquer formato de resposta ({data: [...]}, {obras: [...]}, {data: {obras: [...]}}...). */
  function listOf(raw, depth) {
    depth = depth || 0;
    if (Array.isArray(raw)) return raw;
    if (!isObj(raw) || depth > 3) return [];
    for (const k of ["obras", "data", "items", "results", "resultados", "lista", "rows"]) {
      if (Array.isArray(raw[k])) return raw[k];
      if (isObj(raw[k])) { const inner = listOf(raw[k], depth + 1); if (inner.length) return inner; }
    }
    // Formato desconhecido: a maior lista de objetos com cara de obra (obr_id/obr_nome), em qualquer lugar.
    return depth ? [] : deepWorks(raw);
  }
  function deepWorks(raw) {
    let best = [];
    const walk = (v, d) => {
      if (d > 5 || v == null) return;
      if (Array.isArray(v)) {
        const works = v.filter((o) => isObj(o) && (("obr_id" in o && "obr_nome" in o) || (isObj(o.obra) && "obr_id" in o.obra)));
        if (works.length > best.length) best = works;
        v.slice(0, 50).forEach((x) => walk(x, d + 1));
      } else if (isObj(v)) Object.values(v).forEach((x) => walk(x, d + 1));
    };
    walk(raw, 0);
    return best;
  }
  /** Começo da resposta, para o diagnóstico (nunca leva o token: ele só vai no cabeçalho). */
  function snippet(data) {
    let t;
    try { t = typeof data === "string" ? data : JSON.stringify(data); } catch (_) { t = String(data); }
    return String(t == null ? "" : t).replace(/\s+/g, " ").slice(0, 220);
  }
  /** Bloco de páginas da resposta, quando existe. */
  function pagination(raw) {
    const p = isObj(raw) ? (isObj(raw.pagination) ? raw.pagination : isObj(raw.meta) ? raw.meta : isObj(raw.data) && isObj(raw.data.pagination) ? raw.data.pagination : null) : null;
    if (!p) return null;
    const n = (v) => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && /^\d+$/.test(v) ? Number(v) : 0);
    const totalPages = n(p.totalPages ?? p.total_pages ?? p.last_page ?? p.lastPage ?? p.paginas);
    const totalItems = n(p.totalItems ?? p.total_items ?? p.total ?? p.totalResults);
    const page = n(p.currentPage ?? p.current_page ?? p.page ?? p.pagina) || 1;
    return totalPages || totalItems ? { page, totalPages, totalItems } : null;
  }
  function names(v) {
    if (!Array.isArray(v)) return typeof v === "string" && v.trim() ? v.split(/\s*[,;|\n]\s*/).filter(Boolean) : [];
    return v.map((e) => (typeof e === "string" ? e.trim() : isObj(e) ? str(e, "nome", "titulo", "title", "obr_titulo", "alt_titulo", "name") : null)).filter(Boolean);
  }
  function image(v, id) {
    if (typeof v !== "string" || !v.trim()) return null;
    const s = v.trim();
    if (/^https?:\/\//i.test(s)) return s.replace(/^http:/i, "https:");
    if (/^\/\//.test(s)) return "https:" + s;
    if (/^[\w.-]+$/.test(s) && id) return `${CDN}obras/${id}/${encodeURIComponent(s)}`;
    if (/^\/?obras\//.test(s)) return CDN + s.replace(/^\//, "");
    return null;
  }
  /** Uma obra da API no formato do app: {id, title, alts, cover, format, status, chapters, desc, slug, tags}. */
  function toWork(o) {
    if (!isObj(o)) return null;
    if (isObj(o.obra) && !("obr_id" in o || "obr_nome" in o)) return toWork(o.obra);
    const id = int(o, "obr_id", "id");
    const title = str(o, "obr_nome", "nome", "title", "titulo");
    if (!id || id <= 0 || !title) return null;
    const f = o.formato;
    let format = str(o, "formt_nome") || (typeof f === "string" ? f.trim() : isObj(f) ? str(f, "formt_nome", "nome", "name") : null);
    if (o.obr_novel_id) format = format && /novel/i.test(format) ? format : "Novel";
    const st = o.obr_status ?? o.status;
    const status = typeof st === "string" ? st.trim() : isObj(st) ? str(st, "stt_nome", "nome", "name") : null;
    const caps = Array.isArray(o.capitulos) ? o.capitulos.length : null;
    const chapters = int(o, "obr_total_capitulos", "total_capitulos", "capitulos_count", "qtd_capitulos", "obr_qtd_capitulos", "cap_count", "chapters_count") ?? caps;
    const desc = str(o, "obr_descricao", "descricao", "sinopse", "description");
    const tags = Array.isArray(o.tags) ? o.tags.map((t) => (typeof t === "string" ? t : isObj(t) ? str(t, "tag_nome", "nome", "name") : null)).filter(Boolean) : [];
    return {
      id, title,
      alts: names(o.obr_titulos_alternativos ?? o.titulos_alternativos ?? o.alternative_titles ?? o.obr_nomes_alternativos),
      cover: image(str(o, "obr_imagem", "imagem", "image", "capa", "cover"), id),
      format, status, chapters: chapters ?? null,
      desc: desc ? desc.slice(0, 900) : null,
      slug: str(o, "obr_slug", "slug"),
      tags: tags.slice(0, 12),
    };
  }
  function toWorks(raw) { return listOf(raw).map(toWork).filter(Boolean); }
  function toDetail(raw) {
    if (!isObj(raw)) return null;
    if ("obr_id" in raw || "obr_nome" in raw) return toWork(raw);
    for (const k of ["data", "obra", "result"]) if (isObj(raw[k])) { const w = toDetail(raw[k]); if (w) return w; }
    return null;
  }

  /**
   * deps: http(url, headers) → Promise<{status, data}>, sleep(ms), now(), token(), gapMs(), onEvent(e).
   */
  function createReader(deps) {
    let stop = false, lastAt = 0;
    const emit = (e) => { try { deps.onEvent && deps.onEvent(e); } catch (_) { /* a tela não para a leitura */ } };
    const check = () => { if (stop) throw new Stopped(); };
    async function wait(ms) {
      const end = deps.now() + ms;
      while (deps.now() < end) { check(); await deps.sleep(Math.min(500, end - deps.now())); }
      check();
    }
    function token() {
      const t = String(deps.token() || "").trim().replace(/^bearer\s+/i, "");
      if (!t) throw new Fatal("Coloque o token da MediocreScan primeiro.");
      return t;
    }

    /** GET na API com o ritmo e as esperas; null se não existe (404); dados já em JSON. */
    async function get(path) {
      const t = token();
      for (let attempt = 0; ; attempt++) {
        check();
        const gap = Math.max(500, Number(deps.gapMs()) || 2500);
        const since = deps.now() - lastAt;
        if (since < gap) await wait(gap - since);
        lastAt = deps.now();
        let r;
        const t0 = deps.now();
        try {
          r = await deps.http(API + path, { Accept: "application/json", Authorization: `Bearer ${t}` }, t);
        } catch (e) {
          if (e && e.stopped) throw e;
          r = { status: 0, data: null, error: String((e && e.message) || e) };
        }
        check();
        const status = Number(r && r.status) || 0;
        let data = r ? r.data : null;
        if (typeof data === "string") { try { data = JSON.parse(data); } catch (_) { /* fica texto */ } }
        emit({ type: "req", path, status, ms: deps.now() - t0, via: r && r.via, error: r && r.error, text: status >= 200 && status < 300 ? snippet(data).slice(0, 120) : snippet(r && r.error ? r.error : data) });
        if (status >= 200 && status < 300) return data;
        if (status === 404) return null;
        if (status === 401) throw new Fatal("A MediocreScan recusou o token (401). Confira ou troque o token.");
        if (status === 400 || status === 422) { const e = new Error(`A API não aceitou o pedido (${status}).`); e.status = status; throw e; }
        if (attempt >= BACKOFF_S.length) {
          throw new Fatal(status ? `A MediocreScan continua recusando (${status}) depois de ${BACKOFF_S.length} esperas. Tente mais tarde ou aumente o intervalo.` : "Sem conexão com a MediocreScan. Confira a internet e toque em Continuar.");
        }
        const s = BACKOFF_S[attempt];
        emit({ type: "wait", status, seconds: s, attempt: attempt + 1, max: BACKOFF_S.length, reason: status === 429 ? "pedidos demais" : status === 403 ? "acesso recusado" : status ? `erro ${status}` : "sem conexão" });
        await wait(s * 1000);
        emit({ type: "resume" });
      }
    }

    /** Testa o token: lê a primeira página das atualizadas. */
    async function test() {
      const data = await get(LIST.atualizadas.path);
      return toWorks(data).length;
    }

    /** Junta obras ao catálogo; devolve quantas eram novas. */
    function mergeInto(cat, list) {
      let added = 0;
      for (const w of list) {
        const old = cat.works.get(w.id);
        if (!old) { cat.works.set(w.id, w); added++; }
        else cat.works.set(w.id, Object.assign({}, w, old, { alts: old.alts && old.alts.length ? old.alts : w.alts, cover: old.cover || w.cover }));
      }
      return added;
    }

    /**
     * Página N de uma lista. Na página 2, descobre como a API pagina (offset, pagina, page…): vale o primeiro jeito que
     * trouxer obras diferentes das da página anterior; fica salvo em cat.pagers.
     */
    async function listPage(cat, name, n) {
      const L = LIST[name];
      cat.pagers = cat.pagers || {};
      cat.prevIds = cat.prevIds || {};
      const tryGet = async (path) => {
        try { return toWorks(await get(path)); } catch (e) { if (e instanceof Fatal || e instanceof Stopped) throw e; return []; }
      };
      let list;
      if (n === 1) list = await tryGet(L.path);
      else if (cat.pagers[name] === -1) list = [];
      else if (cat.pagers[name] != null) list = await tryGet(`${L.path}?${PAGERS[cat.pagers[name]](L, n)}`);
      else {
        const prev = new Set(cat.prevIds[name] || []);
        list = [];
        for (let k = 0; k < PAGERS.length; k++) {
          const got = await tryGet(`${L.path}?${PAGERS[k](L, n)}`);
          if (got.length && got.some((w) => !prev.has(w.id))) { cat.pagers[name] = k; list = got; break; }
        }
        if (cat.pagers[name] == null) cat.pagers[name] = -1;
        emit({ type: "pager", step: name, param: cat.pagers[name] >= 0 ? PAGERS[cat.pagers[name]](L, 2).split("=")[0] : null });
      }
      cat.prevIds[name] = list.map((w) => w.id);
      return list;
    }

    /**
     * Atualização rápida (modo automático): lê o começo das listas de adicionadas e atualizadas até as páginas só
     * trazerem obras que já estavam salvas. Devolve quantas obras novas entraram.
     */
    async function readRecent(cat, save) {
      stop = false;
      let total = 0;
      for (const name of ["adicionadas", "atualizadas"]) {
        let repeat = 0;
        for (let page = 1; page <= 60; page++) {
          const list = await listPage(cat, name, page);
          const added = mergeInto(cat, list);
          total += added;
          emit({ type: "page", step: name, page, pages: 0, added, count: cat.works.size });
          await save(cat);
          if (!list.length) break;
          repeat = added ? 0 : repeat + 1;
          if (repeat >= (name === "adicionadas" ? 2 : 1)) break;
        }
      }
      return total;
    }

    /**
     * Lê o catálogo inteiro (ou continua a leitura salva). cat: {works: Map id→obra, progress}. save(cat) a cada página.
     * progress: {step: "busca"|"adicionadas"|"atualizadas"|"pronto", page, offset, total, empty, buscaOk}.
     */
    async function readCatalog(cat, save) {
      stop = false;
      const p = cat.progress = Object.assign({ step: "busca", page: 1, offset: 0, empty: 0, total: 0, buscaOk: false, started: deps.now() }, cat.progress || {});
      const merge = (list) => mergeInto(cat, list);
      const step = (name) => { p.step = name; p.page = 1; p.offset = 0; p.empty = 0; p.total = 0; };
      // 1) Busca sem texto, página por página (só se a API devolver o total de páginas).
      while (p.step === "busca") {
        let data;
        try { data = await get(`/obras/buscar?string=&pagina=${p.page}`); }
        catch (e) { if (e instanceof Fatal || e instanceof Stopped) throw e; data = null; }
        const list = toWorks(data), pag = pagination(data);
        if (p.page === 1 && (!list.length || !pag || (pag.totalPages < 2 && pag.totalItems <= list.length))) {
          emit({ type: "method", step: "busca", ok: false });
          step("adicionadas");
          break;
        }
        if (p.page === 1) { p.buscaOk = true; emit({ type: "method", step: "busca", ok: true, totalItems: pag.totalItems, totalPages: pag.totalPages }); }
        const added = merge(list);
        p.total = pag ? pag.totalPages : p.total;
        emit({ type: "page", step: "busca", page: p.page, pages: p.total, added, count: cat.works.size, totalItems: pag ? pag.totalItems : 0 });
        p.page++;
        await save(cat);
        if (!list.length || (p.total && p.page > p.total) || p.page > MAX_PAGES) {
          // Busca completa: as listas só entram se faltou muita coisa.
          step(pag && pag.totalItems && cat.works.size < pag.totalItems * 0.97 ? "adicionadas" : "pronto");
          await save(cat);
        }
      }
      // 2) e 3) Listas com deslocamento: param quando a página vem vazia ou só repete obras (2 vezes seguidas).
      for (const name of ["adicionadas", "atualizadas"]) {
        while (p.step === name) {
          const list = await listPage(cat, name, p.page);
          const added = merge(list);
          p.empty = added ? 0 : p.empty + 1;
          emit({ type: "page", step: name, page: p.page, pages: 0, added, count: cat.works.size });
          p.page++;
          p.offset = (p.page - 1) * LIST[name].size;
          const done = !list.length || p.empty >= 2 || p.page > MAX_PAGES;
          if (done) step(name === "adicionadas" ? "atualizadas" : "pronto");
          await save(cat);
        }
      }
      p.finished = deps.now();
      await save(cat);
      if (!cat.works.size) throw new Fatal("A MediocreScan respondeu, mas nenhuma página trouxe obras. Veja o Diagnóstico em Ajustes (mostra o que a API devolveu).");
      return cat;
    }

    /** Completa o catálogo buscando cada letra e número (para obras que as listas não mostram). */
    async function readLetters(cat, save, from) {
      stop = false;
      let keys = cat.lettersBigrams ? BIGRAMS : "abcdefghijklmnopqrstuvwxyz0123456789".split("");
      for (let k = Math.max(0, keys.indexOf(from || keys[0])); k < keys.length; k++) {
        for (let page = 1; page <= MAX_PAGES; page++) {
          let data;
          try { data = await get(`/obras/buscar?string=${encodeURIComponent(keys[k])}&pagina=${page}`); }
          catch (e) {
            if (e instanceof Fatal || e instanceof Stopped) throw e;
            // A busca não aceita uma letra só: troca por pares de letras e recomeça.
            if ((e.status === 400 || e.status === 422) && !cat.lettersBigrams) { cat.lettersBigrams = true; keys = BIGRAMS; k = -1; emit({ type: "pager", step: "letras", param: "pares" }); break; }
            data = null;
          }
          const list = toWorks(data), pag = pagination(data);
          let added = 0;
          for (const w of list) if (!cat.works.has(w.id)) { cat.works.set(w.id, w); added++; }
          emit({ type: "page", step: "letras", letter: keys[k], page, pages: pag ? pag.totalPages : 0, added, count: cat.works.size });
          cat.lettersNext = keys[k];
          await save(cat);
          if (!list.length || !pag || page >= pag.totalPages) break;
        }
      }
      cat.lettersNext = null;
      cat.lettersDone = deps.now();
      await save(cat);
      return cat;
    }

    /** Lê os detalhes (nomes alternativos, sinopse, formato, capítulos) das obras pedidas. */
    async function readDetails(cat, ids, save) {
      stop = false;
      let n = 0;
      for (const id of ids) {
        n++;
        const old = cat.works.get(id);
        if (!old || old.detailed) continue;
        let w = null;
        try { w = toDetail(await get(`/obras/${id}`)); }
        catch (e) { if (e instanceof Fatal || e instanceof Stopped) throw e; }
        if (w) cat.works.set(id, Object.assign({}, old, w, { detailed: true, alts: w.alts.length ? w.alts : old.alts, cover: w.cover || old.cover }));
        else cat.works.set(id, Object.assign({}, old, { detailed: true }));
        emit({ type: "detail", n, of: ids.length, id, title: (w || old).title });
        if (n % 5 === 0 || n === ids.length) await save(cat);
      }
      return cat;
    }

    return { get, test, readCatalog, readRecent, readLetters, readDetails, stop: () => { stop = true; }, get stopped() { return stop; } };
  }

  const api = { createReader, toWork, toWorks, toDetail, pagination, listOf, snippet, Stopped, Fatal, API, CDN };
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.MediocreApi = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
