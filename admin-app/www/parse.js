/*
 * Leitura tolerante das respostas da MediocreScan (mesma ideia do MediocreScan Reader):
 * nunca quebra por campo ausente e nunca inventa valores.
 */
(function (root) {
  "use strict";

  const CDN = "https://cdn.mediocrescan.com/";
  const IMG_EXT = /\.(webp|jpe?g|png|gif|avif)(\?|$)/i;
  const LIST_KEYS = ["data", "obras", "results", "items", "capitulos", "chapters"];

  const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
  function str(o, ...keys) {
    for (const k of keys) {
      const v = o && o[k];
      if (typeof v === "string" && v.trim()) return v.trim();
      if (typeof v === "number" && Number.isFinite(v)) return String(v);
    }
    return null;
  }
  function int(o, ...keys) {
    for (const k of keys) {
      const v = o && o[k];
      const n = typeof v === "number" ? v : typeof v === "string" && /^\d+$/.test(v.trim()) ? Number(v) : NaN;
      if (Number.isSafeInteger(n)) return n;
    }
    return null;
  }
  function bool(o, ...keys) {
    for (const k of keys) {
      const v = o && o[k];
      if (v === true || v === 1) return true;
      if (v === false || v === 0) return false;
      if (typeof v === "string") {
        const s = v.trim().toLowerCase();
        if (["1", "true", "sim", "s", "yes"].includes(s)) return true;
        if (["0", "false", "nao", "não", "n", "no"].includes(s)) return false;
      }
    }
    return null;
  }

  /** Resolve caminhos relativos contra o CDN; só aceita https e sem credenciais. */
  function resolveUrl(v, base) {
    if (typeof v !== "string" || !v.trim() || v.includes("..")) return null;
    try {
      const u = new URL(v.trim().replace(/^\/+/, ""), base || CDN);
      return u.protocol === "https:" && !u.username && !u.password ? u.toString() : null;
    } catch (_) { return null; }
  }
  /** Capa da obra: URL completa, ou nome de arquivo dentro da pasta da obra no CDN. */
  function workImage(v, id) {
    if (typeof v !== "string" || !v.trim()) return null;
    const s = v.trim();
    if (/^https:\/\//i.test(s)) return resolveUrl(s);
    if (/^[\w.-]+$/.test(s) && id) return `${CDN}obras/${id}/${encodeURIComponent(s)}`;
    return resolveUrl(s);
  }
  function guessImage(o) {
    for (const [k, v] of Object.entries(o)) {
      if (typeof v !== "string" || !v.trim()) continue;
      const key = k.toLowerCase();
      if (key.includes("banner")) continue;
      if (["img", "imagem", "image", "capa", "cover", "thumb", "foto"].some((x) => key.includes(x)) || IMG_EXT.test(v)) return v;
    }
    return null;
  }

  function findList(el, depth) {
    depth = depth || 0;
    if (el == null || depth > 3) return [];
    if (Array.isArray(el)) return el;
    if (!isObj(el)) return [];
    for (const k of LIST_KEYS) {
      const v = el[k];
      if (Array.isArray(v)) return v;
      if (isObj(v)) { const inner = findList(v, depth + 1); if (inner.length) return inner; }
    }
    // Seções da home: junta qualquer lista de objetos do primeiro nível.
    return Object.values(el).filter(Array.isArray).flatMap((a) => a.filter(isObj));
  }
  function hasListContainer(el, depth) {
    depth = depth || 0;
    if (el == null || depth > 3) return false;
    if (Array.isArray(el)) return true;
    if (!isObj(el)) return false;
    if (!Object.keys(el).length) return true;
    return LIST_KEYS.some((k) => Array.isArray(el[k]) || hasListContainer(el[k], depth + 1)) || Object.values(el).some(Array.isArray);
  }

  function parseTags(v) {
    if (!Array.isArray(v)) return [];
    return v.map((t) => (typeof t === "string" ? t.trim() : isObj(t) ? str(t, "tag_nome", "nome", "name", "tag") : null)).filter((t) => t && t !== "+18");
  }
  function strings(v) {
    if (!Array.isArray(v)) return [];
    return v.map((e) => (typeof e === "string" ? e.trim() : isObj(e) ? str(e, "nome", "titulo", "title", "obr_titulo", "alt_titulo", "name") : null)).filter(Boolean);
  }

  function parseChapter(o) {
    if (!isObj(o)) return null;
    const uuidKey = Object.keys(o).find((k) => /uuid/i.test(k) && typeof o[k] === "string");
    return {
      id: int(o, "cap_id", "id"),
      uuid: str(o, "cap_uuid", "uuid") || (uuidKey ? o[uuidKey] : null),
      title: str(o, "cap_nome", "nome"),
      number: str(o, "cap_num", "numero"),
      numberValue: typeof o.cap_num === "number" ? o.cap_num : Number(str(o, "cap_num", "numero")),
      pages: int(o, "cap_paginas_count"),
      isAi: bool(o, "cap_ia", "ia"),
      text: str(o, "cap_conteudo_texto"),
      workId: int(o, "obr_id") ?? (isObj(o.obra) ? int(o.obra, "obr_id", "id") : null),
      date: str(o, "cap_lancado_em", "cap_criado_em", "created_at"),
      raw: o,
    };
  }
  function parseChapterResponse(raw) {
    if (!isObj(raw)) return null;
    if ("cap_id" in raw || "cap_nome" in raw || "cap_num" in raw) return parseChapter(raw);
    for (const k of ["data", "capitulo", "chapter", "result"]) if (isObj(raw[k])) { const c = parseChapterResponse(raw[k]); if (c) return c; }
    return "id" in raw ? parseChapter(raw) : null;
  }

  function parseWork(o) {
    if (!isObj(o)) return null;
    // Recomendações vêm como {obra: {...}, score}.
    if (isObj(o.obra) && !("obr_id" in o || "obr_nome" in o)) {
      const w = parseWork(o.obra);
      if (w && !w.score) w.score = str(o, "score", "pontuacao", "nota", "similaridade", "relevancia");
      return w;
    }
    const id = int(o, "obr_id", "id");
    const formato = isObj(o.formato) ? o.formato : null;
    const chapters = findList(o.capitulos || o.chapters || []).map(parseChapter).filter(Boolean).map((c) => (c.workId == null ? Object.assign(c, { workId: id }) : c));
    const formatName = str(o, "formt_nome") || (typeof o.formato === "string" ? o.formato : null) || (formato ? str(formato, "formt_nome", "nome", "name") : null);
    const novelId = int(o, "obr_novel_id");
    return {
      id,
      title: str(o, "obr_nome", "nome", "title") || (id ? `Obra ${id}` : "Obra"),
      description: str(o, "obr_descricao", "descricao", "description"),
      status: str(o, "obr_status", "status"),
      cover: workImage(str(o, "obr_imagem", "imagem", "image", "capa", "cover", "thumbnail") || guessImage(o), id),
      banner: workImage(str(o, "obr_banner", "banner"), id),
      format: formatName,
      isNovel: novelId != null || /novel/i.test(formatName || ""),
      isAi: bool(o, "obr_ia", "ia", "possui_ia", "cap_ia"),
      isOfficial: bool(o, "obr_oficial", "oficial"),
      tags: parseTags(o.tags),
      altTitles: strings(o.obr_titulos_alternativos),
      chapters,
      score: str(o, "score", "pontuacao", "nota", "similaridade", "relevancia"),
      raw: o,
    };
  }
  function parseWorkResponse(raw) {
    if (!isObj(raw)) return null;
    if ("obr_id" in raw || "obr_nome" in raw) return parseWork(raw);
    for (const k of ["data", "obra", "result"]) if (isObj(raw[k])) { const w = parseWorkResponse(raw[k]); if (w) return w; }
    return "id" in raw ? parseWork(raw) : null;
  }
  function parseWorks(raw) {
    const seen = new Set();
    return findList(raw).map(parseWork).filter((w) => w && w.id && !seen.has(w.id) && seen.add(w.id));
  }
  function parseLists(raw) {
    return findList(raw).filter(isObj).map((o) => ({
      id: int(o, "lis_id", "id"),
      name: str(o, "lis_nome", "lis_titulo", "nome", "name", "titulo", "title") || "Lista",
      description: str(o, "lis_descricao", "descricao", "description"),
      works: parseWorks(o.obras || o.works || o.itens || o.items || []),
    }));
  }

  /* Conteúdo do capítulo: imagens, texto ou blocos mistos, na ordem original. */
  const C_IMG = ["imagem", "image", "url", "src", "image_url", "img", "link"];
  const C_TXT = ["texto", "text", "content", "conteudo"];
  const C_NUM = ["pagina", "page", "number", "numero", "num", "ordem", "order", "index"];
  const C_BOX = ["paginas", "pages", "images", "imagens", "blocks", "blocos", "content", "conteudo", "data", "items"];
  function paragraphs(text) {
    return text.replace(/\r\n/g, "\n").split(/\n\s*\n/).map((t) => t.trim()).filter(Boolean).map((t) => ({ type: "text", text: t }));
  }
  function toBlock(el, base) {
    if (el == null) return null;
    if (typeof el === "string") {
      const s = el.trim(); if (!s) return null;
      if (!IMG_EXT.test(s)) return { type: "text", text: s };
      const url = resolveUrl(s, base); return url ? { type: "image", url } : { type: "unknown", raw: el };
    }
    if (!isObj(el)) return { type: "unknown", raw: el };
    if (!Object.keys(el).length) return null;
    const type = (str(el, "type", "tipo") || "").toLowerCase();
    const img = str(el, ...C_IMG), txt = str(el, ...C_TXT);
    const textType = /text|par/.test(type), imageType = /image|img|pagina|page/.test(type);
    if (textType && txt) return { type: "text", text: txt };
    if (img && (imageType || IMG_EXT.test(img) || !txt)) {
      const url = resolveUrl(img, base);
      if (url) return { type: "image", url, page: int(el, ...C_NUM) };
    }
    if (txt) return { type: "text", text: txt };
    return { type: "unknown", raw: el };
  }
  function normalizeContent(rootEl, base, depth) {
    depth = depth || 0;
    let blocks = [];
    if (Array.isArray(rootEl)) blocks = rootEl.map((e) => toBlock(e, base)).filter(Boolean);
    else if (typeof rootEl === "string") blocks = paragraphs(rootEl);
    else if (isObj(rootEl)) {
      for (const k of C_BOX) {
        const v = rootEl[k];
        if (Array.isArray(v)) blocks = v.map((e) => toBlock(e, base)).filter(Boolean);
        else if (typeof v === "string" && (k === "content" || k === "conteudo")) blocks = paragraphs(v);
        else if (isObj(v) && depth < 2) blocks = normalizeContent(v, base, depth + 1);
        if (blocks.length) break;
      }
      if (!blocks.length) { const t = str(rootEl, ...C_TXT); if (t) blocks = paragraphs(t); }
    }
    if (!blocks.length) {
      const all = [];
      (function collect(e, d) {
        if (d > 5 || e == null) return;
        if (typeof e === "string") all.push(e);
        else if (Array.isArray(e)) e.forEach((x) => collect(x, d + 1));
        else if (isObj(e)) Object.values(e).forEach((x) => collect(x, d + 1));
      })(rootEl, 0);
      blocks = all.filter((s) => IMG_EXT.test(s)).map((s) => resolveUrl(s, base)).filter(Boolean).map((url) => ({ type: "image", url }));
    }
    // Ordena páginas numeradas sem embaralhar as que não têm número.
    if (blocks.every((b) => b.type !== "image" || b.page != null) && blocks.some((b) => b.page != null)) {
      blocks = blocks.map((b, i) => ({ b, i })).sort((x, y) => (x.b.page ?? x.i) - (y.b.page ?? y.i) || x.i - y.i).map((x) => x.b);
    }
    return blocks;
  }
  function parseThumbs(el, base) {
    const out = {};
    if (isObj(el) && Object.keys(el).length && Object.values(el).every((v) => typeof v === "string" && IMG_EXT.test(v))) {
      for (const [k, v] of Object.entries(el)) { const u = resolveUrl(v, base); if (u) out[k] = u; }
      return out;
    }
    for (const o of findList(el)) {
      if (!isObj(o)) continue;
      const u = resolveUrl(str(o, ...C_IMG, "thumb", "thumbnail", "miniatura"), base);
      if (!u) continue;
      const id = str(o, "cap_id", "id", "capitulo_id"); if (id) out[id] = u;
      const num = str(o, "cap_num", "numero", "number"); if (num && !(num in out)) out[`n${num}`] = u;
    }
    return out;
  }

  const api = { findList, hasListContainer, parseWork, parseWorkResponse, parseWorks, parseLists, parseChapter, parseChapterResponse, normalizeContent, parseThumbs, resolveUrl, paragraphs, CDN };
  if (typeof module === "object" && module.exports) module.exports = api;
  root.BMParse = api;
})(typeof window !== "undefined" ? window : globalThis);
