/*
 * Duplicadas — detector de obras duplicadas da MediocreScan (sem tela; roda no app e nos testes em Node).
 *
 * Compara cada obra só com as que dividem alguma palavra-chave (índice de palavras), e soma sinais:
 * título igual (com e sem acentos, artigos e palavras de formato), nome alternativo igual, mesmas palavras em
 * outra ordem, título quase igual (erro de digitação), um título começando com o outro, palavras-chave raras em
 * comum (peso maior para palavras que quase nenhuma obra usa), mesma capa e sinopse parecida (quando os
 * detalhes foram lidos). Números diferentes no título (2, II, temporada 3) e formatos diferentes (novel × quadrinho)
 * baixam a nota, porque costumam ser continuação ou adaptação, não cópia.
 */
(function (root) {
  "use strict";

  // Palavras sem peso: artigos e ligações em português, inglês e espanhol.
  const STOP = new Set((
    "o a os as um uma uns umas de do da dos das d e em no na nos nas num numa por pelo pela pelos pelas para pra pro com sem " +
    "que se ao aos à às meu minha meus minhas seu sua seus suas teu tua ele ela eles elas eu voce você nao não mais muito " +
    "the an of in on to and for with from by at as is are be my your his her its their our this that these those " +
    "el la los las y del en un una mi su lo le les des du et l"
  ).split(/\s+/).map(fold));
  // Palavras de formato ou versão que não mudam a obra (editáveis nos Ajustes do app).
  const FORMAT_WORDS = (
    "manhwa manhua manga mangá webtoon webcomic comic comics hq novel light ln wn colorido colorida colored color colour " +
    "oficial official raw scan scans pt br ptbr traduzido traduzida tradução traducao edicao edição edition versao versão version " +
    "full completo completa complete hd remasterizado remastered ia ai"
  );
  // Palavras de sequência: com número diferente costuma ser continuação.
  const SEQ_WORDS = new Set("season temporada temp parte part arco arc volume vol livro book capitulo capítulo chapter ato act fase".split(" ").map(fold));
  const ROMAN = { ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7, viii: 8, ix: 9, x: 10, xi: 11, xii: 12 };
  // Uma palavra usada por mais obras que isso não serve para achar candidatas (é comum demais).
  const MAX_BLOCK = 120;
  // Palavra "rara" (distintiva): usada por no máximo tantas obras.
  const RARE_DF = 25;

  function fold(s) { return String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase(); }
  /** Minúsculas, sem acentos e sem pontuação; mantém letras de qualquer alfabeto. */
  function normalize(s) {
    if (s == null) return "";
    return fold(String(s)).replace(/[’'`´]/g, "").replace(/&/g, " e ").replace(/[^\p{L}\p{N}]+/gu, " ").trim().replace(/\s+/g, " ");
  }
  function ignoreSet(extra) {
    const set = new Set(FORMAT_WORDS.split(/\s+/).map(fold));
    if (typeof extra === "string") extra.split(/[\s,;]+/).map((w) => normalize(w)).filter(Boolean).forEach((w) => set.add(w));
    return set;
  }
  const isNum = (w) => /^\d+$/.test(w) || Object.prototype.hasOwnProperty.call(ROMAN, w);
  const numOf = (w) => (/^\d+$/.test(w) ? String(Number(w)) : String(ROMAN[w]));

  /** Partes de um nome: normalizado, palavras-chave (sem artigos/formato/números) e números de sequência. */
  function analyze(name, ignore) {
    const norm = normalize(name);
    const words = norm ? norm.split(" ") : [];
    const seq = [];
    const core = [];
    for (let i = 0; i < words.length; i++) {
      const w = words[i];
      if (isNum(w)) { if (!(w === "x" && words.length === 1)) seq.push(numOf(w)); continue; }
      if (SEQ_WORDS.has(w) || STOP.has(w) || ignore.has(w)) continue;
      core.push(w);
    }
    return { name: String(name || ""), norm, tokens: core, core: core.join(" "), sorted: core.slice().sort().join(" "), seq: seq.sort().join(",") };
  }

  function kindClass(format) {
    const f = normalize(format);
    if (!f) return null;
    return /novel/.test(f) ? "novel" : "comic";
  }
  function coverKey(url) {
    if (typeof url !== "string" || !url) return null;
    const file = url.split("?")[0].split("/").pop() || "";
    if (file.length < 8 || /^(default|placeholder|sem[-_]?capa|no[-_]?image)/i.test(file)) return null;
    return file.toLowerCase();
  }
  function descWords(desc, ignore) {
    const n = normalize(desc);
    if (n.length < 80) return null;
    const out = new Set();
    for (const w of n.split(" ")) if (w.length > 2 && !STOP.has(w) && !ignore.has(w)) out.add(w);
    return out.size >= 12 ? out : null;
  }
  function jaccard(a, b) {
    let inter = 0;
    for (const x of a) if (b.has(x)) inter++;
    return inter / (a.size + b.size - inter || 1);
  }
  /** Semelhança de 0 a 1 pela distância de edição (para títulos com erro de digitação). */
  function similarity(a, b) {
    if (a === b) return 1;
    const la = a.length, lb = b.length;
    if (!la || !lb) return 0;
    const max = Math.max(la, lb);
    if (Math.abs(la - lb) / max > 0.25) return 0;
    let prev = new Array(lb + 1), cur = new Array(lb + 1);
    for (let j = 0; j <= lb; j++) prev[j] = j;
    for (let i = 1; i <= la; i++) {
      cur[0] = i;
      let best = cur[0];
      const ca = a.charCodeAt(i - 1);
      for (let j = 1; j <= lb; j++) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (ca === b.charCodeAt(j - 1) ? 0 : 1));
        if (cur[j] < best) best = cur[j];
      }
      if (best / max > 0.25) return 0;
      const t = prev; prev = cur; cur = t;
    }
    return 1 - prev[lb] / max;
  }

  /**
   * Erro de digitação: mesmas palavras na mesma ordem com no máximo 1 em cada 3 um pouco diferente (palavras de 6+
   * letras, 80%+ iguais), ou o mesmo título com espaços em lugares diferentes.
   */
  function typoLike(na, nb) {
    const a = na.tokens, b = nb.tokens;
    if (!a.length || !b.length) return null;
    if (a.length === b.length) {
      let diff = 0, worst = 1;
      for (let i = 0; i < a.length; i++) {
        if (a[i] === b[i]) continue;
        if (Math.min(a[i].length, b[i].length) < 6) return null;
        const s = similarity(a[i], b[i]);
        if (s < 0.8) return null;
        diff++;
        worst = Math.min(worst, s);
      }
      if (!diff || diff > Math.max(1, Math.floor(a.length / 3))) return null;
      return { score: 86, text: `Título quase igual (erro de digitação, ${Math.round(worst * 100)}%)` };
    }
    const ja = a.join(""), jb = b.join("");
    if (Math.abs(a.length - b.length) === 1 && ja.length >= 8) {
      if (ja === jb) return { score: 92, text: "Mesmo título com espaços diferentes" };
      const s = similarity(ja, jb);
      if (s >= 0.92) return { score: 80, text: `Título quase igual (${Math.round(s * 100)}%)` };
    }
    return null;
  }

  /** Prepara as obras: nomes analisados, formato, capa e sinopse. */
  function prepare(works, opts) {
    const ignore = ignoreSet(opts && opts.ignore);
    return works.map((w, i) => {
      const alts = Array.isArray(w.alts) ? w.alts.filter((s) => typeof s === "string" && s.trim()) : [];
      const names = [analyze(w.title, ignore)].concat(alts.map((s) => analyze(s, ignore))).filter((n, k) => k === 0 || n.norm);
      const tokens = new Set();
      names.forEach((n) => n.tokens.forEach((t) => tokens.add(t)));
      return { i, w, names, main: names[0], tokens, kind: kindClass(w.format), cover: coverKey(w.cover), desc: descWords(w.desc, ignore) };
    });
  }

  function idfTable(prepared) {
    const df = new Map();
    for (const p of prepared) for (const t of p.tokens) df.set(t, (df.get(t) || 0) + 1);
    const n = prepared.length || 1;
    return { df, idf: (t) => Math.log(1 + n / (df.get(t) || 1)) };
  }

  /** Pares candidatos: obras que dividem uma palavra-chave não comum, a mesma capa ou o mesmo começo de título. */
  function candidates(prepared, table) {
    const buckets = new Map();
    const add = (key, i) => { let l = buckets.get(key); if (!l) buckets.set(key, (l = [])); l.push(i); };
    for (const p of prepared) {
      for (const t of p.tokens) if ((table.df.get(t) || 0) <= MAX_BLOCK) add("t:" + t, p.i);
      for (const n of p.names) {
        if (n.core.length >= 5) add("p:" + n.core.replace(/ /g, "").slice(0, 5), p.i);
        if (n.norm && !n.tokens.length) add("n:" + n.norm, p.i);
      }
      if (p.cover) add("c:" + p.cover, p.i);
    }
    const pairs = new Set();
    for (const list of buckets.values()) {
      if (list.length < 2 || list.length > MAX_BLOCK * 2) continue;
      const uniq = Array.from(new Set(list));
      for (let a = 0; a < uniq.length; a++) for (let b = a + 1; b < uniq.length; b++) {
        const x = Math.min(uniq[a], uniq[b]), y = Math.max(uniq[a], uniq[b]);
        pairs.add(x * 1e6 + y);
      }
    }
    return pairs;
  }

  /** Nota de 0 a 100 e os motivos de duas obras serem a mesma. */
  function scorePair(A, B, table) {
    const signals = [];
    const sig = (score, text) => signals.push({ score, text });
    let bestName = 0, bestText = null;
    const name = (score, text) => { if (score > bestName) { bestName = score; bestText = text; } };
    for (let x = 0; x < A.names.length; x++) for (let y = 0; y < B.names.length; y++) {
      const na = A.names[x], nb = B.names[y], main = x === 0 && y === 0;
      if (!na.norm || !nb.norm) continue;
      const label = main ? "" : x === 0 ? ` (“${A.w.title}” é nome alternativo da outra)` : y === 0 ? ` (“${B.w.title}” é nome alternativo da outra)` : " (nos nomes alternativos)";
      if (na.norm === nb.norm) { name(main ? 100 : 94, main ? "Mesmo título" : "Mesmo nome" + label); continue; }
      if (na.core && na.core === nb.core) { name(main ? 95 : 92, (main ? "Mesmo título sem acentos, artigos e formato" : "Mesmo nome sem acentos e artigos") + label); continue; }
      if (na.sorted && na.tokens.length > 1 && na.sorted === nb.sorted) { name(90, "Mesmas palavras em outra ordem" + label); continue; }
      const typo = typoLike(na, nb);
      if (typo) { name(typo.score, typo.text + label); continue; }
      const [short, long] = na.tokens.length <= nb.tokens.length ? [na, nb] : [nb, na];
      if (short.tokens.length >= 2 && short.core.length >= 8 && long.core !== short.core && long.core.startsWith(short.core + " ")) {
        name(main ? 62 : 60, "Um título começa com o outro (subtítulo ou continuação)" + label);
      } else if (short.tokens.length === 1 && short.core.length >= 6 && long.tokens[0] === short.core && (table.df.get(short.core) || 0) <= 3) {
        name(55, "Um título começa com o outro" + label);
      }
    }
    if (bestName) sig(bestName, bestText);

    // Palavras-chave em comum, com peso maior para as raras (quando um nome só acrescenta palavras ao outro, quem
    // decide é a regra do subtítulo acima).
    let inter = 0, union = 0;
    const shared = [];
    for (const t of A.tokens) { const w = table.idf(t); union += w; if (B.tokens.has(t)) { inter += w; shared.push(t); } }
    for (const t of B.tokens) if (!A.tokens.has(t)) union += table.idf(t);
    const wj = union ? inter / union : 0;
    const rare = shared.filter((t) => (table.df.get(t) || 0) <= RARE_DF);
    const subset = shared.length === Math.min(A.tokens.size, B.tokens.size) && A.tokens.size !== B.tokens.size;
    if (rare.length && shared.length >= 1 && !subset) {
      const sorted = shared.slice().sort((p, q) => (table.df.get(p) || 0) - (table.df.get(q) || 0)).slice(0, 5);
      const kw = (score) => sig(score, `Palavras-chave em comum: ${sorted.join(", ")}`);
      if (wj >= 0.8) kw(82); else if (wj >= 0.65 && shared.length >= 2) kw(70); else if (wj >= 0.5 && shared.length >= 2) kw(55);
    }
    if (A.cover && A.cover === B.cover) sig(90, "Mesma capa");
    if (A.desc && B.desc) {
      const j = jaccard(A.desc, B.desc);
      if (j >= 0.85) sig(96, "Mesma sinopse");
      else if (j >= 0.6) sig(88, `Sinopse quase igual (${Math.round(j * 100)}%)`);
      else if (j >= 0.4) sig(70, `Sinopse parecida (${Math.round(j * 100)}%)`);
    }
    if (!signals.length) return null;
    signals.sort((p, q) => q.score - p.score);
    let score = signals[0].score + Math.min(8, 4 * signals.filter((s) => s.score >= 70).slice(1).length);
    const reasons = signals.map((s) => s.text);
    const notes = [];
    const ca = Number(A.w.chapters), cb = Number(B.w.chapters);
    if (ca > 5 && ca === cb) { score += 3; reasons.push(`Mesmo número de capítulos (${ca})`); }
    if (A.main.seq !== B.main.seq) {
      // 8 × 9 é outra obra quase sempre; "Obra" × "Obra 2" costuma ser a continuação.
      score -= A.main.seq && B.main.seq ? 45 : 30;
      notes.push(`Números diferentes no título (${A.main.seq || "nenhum"} × ${B.main.seq || "nenhum"}): pode ser continuação`);
    }
    if (A.kind && B.kind && A.kind !== B.kind) {
      score -= 25;
      notes.push(`Formatos diferentes (${A.w.format} × ${B.w.format}): pode ser adaptação`);
    }
    return { score: Math.max(0, Math.min(100, Math.round(score))), reasons, notes };
  }

  function levelOf(score) { return score >= 90 ? "alta" : score >= 70 ? "provavel" : "talvez"; }
  const pairKey = (a, b) => (a < b ? `${a}-${b}` : `${b}-${a}`);

  /**
   * Procura as duplicadas. works: [{id, title, alts?, format?, status?, cover?, chapters?, desc?}].
   * opts: {min (nota mínima, padrão 55), ignore (palavras extras a ignorar), dismissed (Set de "id-id")}.
   * Devolve {groups, pairs, compared, ms}; cada grupo: {key, ids, works, pairs, score, level}.
   */
  function findDuplicates(works, opts) {
    const t0 = Date.now();
    opts = opts || {};
    const min = Number.isFinite(opts.min) ? opts.min : 55;
    const dismissed = opts.dismissed instanceof Set ? opts.dismissed : new Set(opts.dismissed || []);
    const unique = [];
    const seen = new Set();
    for (const w of works) if (w && w.id != null && !seen.has(String(w.id)) && seen.add(String(w.id))) unique.push(w);
    const prepared = prepare(unique, opts);
    const table = idfTable(prepared);
    const cands = candidates(prepared, table);
    const pairs = [];
    for (const k of cands) {
      const a = Math.floor(k / 1e6), b = k % 1e6;
      const A = prepared[a], B = prepared[b];
      if (dismissed.has(pairKey(String(A.w.id), String(B.w.id)))) continue;
      const r = scorePair(A, B, table);
      if (r && r.score >= min) pairs.push({ a: A.w, b: B.w, score: r.score, level: levelOf(r.score), reasons: r.reasons, notes: r.notes });
    }
    // Grupos: obras ligadas por pares acima da nota mínima.
    const parent = new Map();
    const find = (x) => { while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x))); x = parent.get(x); } return x; };
    const join = (x, y) => { for (const z of [x, y]) if (!parent.has(z)) parent.set(z, z); const rx = find(x), ry = find(y); if (rx !== ry) parent.set(rx, ry); };
    for (const p of pairs) join(String(p.a.id), String(p.b.id));
    const byRoot = new Map();
    for (const p of pairs) {
      const r = find(String(p.a.id));
      let g = byRoot.get(r);
      if (!g) byRoot.set(r, (g = { works: new Map(), pairs: [], score: 0 }));
      g.works.set(String(p.a.id), p.a); g.works.set(String(p.b.id), p.b);
      g.pairs.push(p);
      g.score = Math.max(g.score, p.score);
    }
    const groups = Array.from(byRoot.values()).map((g) => {
      const ws = Array.from(g.works.values()).sort((x, y) => Number(x.id) - Number(y.id));
      g.pairs.sort((x, y) => y.score - x.score);
      return { key: ws.map((w) => w.id).join("-"), ids: ws.map((w) => w.id), works: ws, pairs: g.pairs, score: g.score, level: levelOf(g.score) };
    }).sort((x, y) => y.score - x.score || y.works.length - x.works.length);
    return { groups, pairs, compared: cands.size, ms: Date.now() - t0 };
  }

  /** Busca por palavra-chave no catálogo: todas as palavras precisam aparecer (no começo de alguma palavra do nome). */
  function search(works, query, opts) {
    const q = normalize(query).split(" ").filter(Boolean);
    if (!q.length) return [];
    const ignore = ignoreSet(opts && opts.ignore);
    const out = [];
    for (const w of works) {
      const names = [w.title].concat(Array.isArray(w.alts) ? w.alts : []).map(normalize).filter(Boolean);
      let best = 0;
      for (const n of names) {
        const words = n.split(" ");
        let hit = 0;
        for (const t of q) if (words.some((x) => x.startsWith(t))) hit++;
        if (hit === q.length) best = Math.max(best, n === q.join(" ") ? 3 : words[0].startsWith(q[0]) ? 2 : 1);
      }
      if (best) out.push({ w, rank: best });
    }
    void ignore;
    return out.sort((x, y) => y.rank - x.rank || String(x.w.title).localeCompare(String(y.w.title))).map((x) => x.w);
  }

  const api = { normalize, analyze, ignoreSet, similarity, findDuplicates, search, levelOf, pairKey, FORMAT_WORDS };
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.Dup = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
