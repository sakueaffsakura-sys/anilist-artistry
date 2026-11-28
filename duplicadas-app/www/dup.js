/*
 * Duplicadas — detector de obras duplicadas da MediocreScan (sem tela; roda no app e nos testes em Node).
 *
 * Compara cada obra só com as que dividem alguma palavra-chave (índice de palavras), e soma sinais:
 * título igual (com e sem acentos, artigos e palavras de formato), nome alternativo igual, mesmas palavras em
 * outra ordem, título quase igual (erro de digitação), um título começando com o outro, palavras-chave raras em
 * comum (peso maior para palavras que quase nenhuma obra usa), mesma capa (arquivo ou imagem parecida, pelo
 * hash da capa) e sinopse igual ou parecida (quando os detalhes foram lidos). Obras com sinopses que dividem
 * várias palavras raras também viram candidatas, mesmo com títulos diferentes (outra língua, nome trocado).
 *
 * Sinopse: além do texto igual ou parecido, os nomes próprios raros (personagens, lugares, clãs) que aparecem nas
 * duas: "Sung Jinwoo" e "Cha Hae-In" na sinopse em português e na em inglês = mesma história, mesmo com os títulos
 * em línguas diferentes. Duas sinopses com vários nomes raros e nenhum em comum = histórias diferentes.
 *
 * Para não errar (baixam a nota): números diferentes no título (2, II, temporada 3), formatos diferentes (novel ×
 * quadrinho), marca de história paralela/especial ou de outra língua num título só, sinopses bem diferentes na mesma
 * língua, autores diferentes e capas bem diferentes quando o título só é parecido. Sinopse e capa repetidas em
 * muitas obras (texto ou imagem padrão) não contam. Pares fracos ("talvez") não juntam grupos.
 *
 * Também acha problemas de cada obra (findProblems): sinopse zuada (vazia, de enfeite, letras quebradas, link ou
 * propaganda, outra língua, curta, cortada, repetida, igual à de outra obra) e capa quebrada (sem capa, não abre,
 * não é imagem, arquivo estragado, vazia, pequena, deitada, imagem padrão).
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
  // Marca de história paralela/especial e de outra língua: com a marca num título só, costuma ser outra obra.
  const SIDE_RE = /\b(side ?story|side ?stories|gaiden|spin ?off|one ?shot|after ?story|historias? paralelas?|especial|special|extras?|prequel|prequela|prologo|epilogo)\b/;
  const LANG_MARK_RE = /\b(english|ingles|eng|espanol|spanish|en espanol|em espanhol)\b/;
  // Palavras que só aparecem numa língua (para saber a língua da sinopse).
  const LANG_WORDS = {
    pt: "nao ele ela um uma para com em do da dos das ao aos voce sao tambem depois quando seu sua mas muito isso entao ate apos onde porem pelo pela dele dela seus suas nossa",
    en: "the and of is his her with when after who that was but they this from into their has have will",
    es: "los las del una un con en al lo pero cuando ella el y muy sus desde hasta donde tambien despues entonces nuestra",
  };
  const LANG_SETS = Object.fromEntries(Object.entries(LANG_WORDS).map(([k, v]) => [k, new Set(v.split(" "))]));
  const LANG_NAME = { en: "inglês", es: "espanhol", ko: "coreano", ja: "japonês", zh: "chinês" };
  // Capa (hash) ou sinopse usada por tantas obras ou mais é padrão ("sem capa", "sinopse em breve").
  const PLACEHOLDER_MIN = 5;
  const GENERIC_AUTHOR = /^(desconhecido|desconhecida|unknown|anonimo|autor|author|n a|na|nenhum|none|null|undefined|varios|various)$/;
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
    return /novel/.test(f) ? "novel" : /ingles|english/.test(f) ? "comic-en" : "comic";
  }
  function coverKey(url) {
    if (typeof url !== "string" || !url) return null;
    const file = url.split("?")[0].split("/").pop() || "";
    if (file.length < 8 || /^(default|placeholder|sem[-_]?capa|no[-_]?image)/i.test(file)) return null;
    return file.toLowerCase();
  }
  /** Sinopse: palavras (sem artigos) e trechos de 3 palavras seguidas (pegam texto copiado com pequenas mudanças). */
  function descWords(desc, ignore) {
    const n = normalize(desc);
    if (n.length < 80) return null;
    const words = n.split(" ").filter((w) => w.length > 2 && !STOP.has(w) && !ignore.has(w));
    const out = new Set(words);
    if (out.size < 12) return null;
    const shingles = new Set();
    for (let i = 0; i + 2 < words.length; i++) shingles.add(words[i] + " " + words[i + 1] + " " + words[i + 2]);
    out.shingles = shingles;
    return out;
  }
  /**
   * Nomes próprios da sinopse: palavras com maiúscula no meio da frase (o começo da frase não conta), sem artigos e
   * sem as palavras do título. "Sung Jin-Woo" vira "sung", "jin", "woo". Só os raros no catálogo contam depois.
   */
  function descNames(desc, titleTokens) {
    if (typeof desc !== "string" || desc.length < 40) return null;
    const out = new Set();
    const re = /(^|[\s([“"'«—–-])(\p{Lu}[\p{L}'’-]{2,})/gu;
    let m;
    while ((m = re.exec(desc))) {
      const before = desc.slice(0, m.index + m[1].length).replace(/\s+$/, "");
      // Começo de frase: maiúscula por regra, não por ser nome.
      if (!before || /[.!?…:]["”»)]?$/.test(before)) continue;
      const parts = normalize(m[2]).split(" ");
      // "Jin-Woo" também vale como "jinwoo" (outra grafia do mesmo nome).
      if (parts.length > 1) parts.push(parts.join(""));
      for (const part of parts) {
        if (part.length >= 3 && !STOP.has(part) && !(titleTokens && titleTokens.has(part)) && !/^\d+$/.test(part)) out.add(part);
      }
    }
    return out.size ? out : null;
  }
  /** Chave da sinopse inteira (para achar o mesmo texto em várias obras). */
  function descKey(desc) {
    const n = normalize(desc);
    return n.length >= 40 ? n.slice(0, 300) : null;
  }
  /**
   * Língua da sinopse: pt, en, es, ko, ja, zh ou null (não dá para saber). names: títulos da obra, que não contam
   * (um título em inglês dentro de uma sinopse em português não a faz "inglesa").
   */
  function langOf(desc, names) {
    if (typeof desc !== "string" || desc.length < 40) return null;
    const letters = (desc.match(/\p{L}/gu) || []).length || 1;
    const ko = (desc.match(/[\uAC00-\uD7AF\u1100-\u11FF]/g) || []).length;
    const ja = (desc.match(/[\u3040-\u30FF]/g) || []).length;
    const zh = (desc.match(/[\u4E00-\u9FFF]/g) || []).length;
    if (ko / letters > 0.3) return "ko";
    if ((ja + zh) / letters > 0.3) return ja > 0 ? "ja" : "zh";
    let text = " " + normalize(desc) + " ";
    for (const n of names || []) { const k = normalize(n); if (k.length >= 3) text = text.split(" " + k + " ").join(" "); }
    const words = text.trim().split(" ");
    if (words.length < 12) return null;
    const hits = {};
    for (const [k, set] of Object.entries(LANG_SETS)) hits[k] = words.reduce((n, w) => n + (set.has(w) ? 1 : 0), 0);
    const order = Object.keys(hits).sort((a, b) => hits[b] - hits[a]);
    const best = order[0], second = order[1];
    return hits[best] >= 4 && hits[best] >= 2 * hits[second] ? best : null;
  }
  /** Autores e artistas da obra, normalizados (sem os genéricos como "desconhecido"). */
  function authorSet(w) {
    const out = new Set();
    for (const a of Array.isArray(w.authors) ? w.authors : []) {
      const n = normalize(a);
      if (n.length >= 2 && !GENERIC_AUTHOR.test(n)) out.add(n);
    }
    return out;
  }
  /**
   * Hash da capa que serve para comparar: imagem que abriu, não vazia (uma cor só, minúscula) e com desenho (hash de
   * imagem lisa é quase todo zero e seria "igual" ao de qualquer outra capa vazia).
   */
  function usableHash(w) {
    const h = w.coverHash;
    if (typeof h !== "string" || !/^[0-9a-f]{16}$/.test(h)) return null;
    const c = w.coverInfo;
    if (c && (!c.ok || (c.std != null && c.std < 8) || (c.w && c.w <= 16) || (c.h && c.h <= 16))) return null;
    const bits = hamming(h, "0000000000000000");
    return bits < 4 || bits > 60 ? null : h;
  }
  /** Distância entre dois hashes de capa (16 caracteres hexadecimais = 64 bits). */
  function hamming(a, b) {
    if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return 64;
    let d = 0;
    for (let i = 0; i < a.length; i++) {
      let x = parseInt(a[i], 16) ^ parseInt(b[i], 16);
      while (x) { d += x & 1; x >>= 1; }
    }
    return d;
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
      const hash = usableHash(w);
      const desc = descWords(w.desc, ignore);
      return {
        i, w, names, main: names[0], tokens, kind: kindClass(w.format), cover: coverKey(w.cover), hash, desc,
        people: descNames(w.desc, tokens),
        descKey: desc ? descKey(w.desc) : null, lang: desc ? langOf(w.desc, [w.title].concat(alts)) : null, authors: authorSet(w),
        side: SIDE_RE.test(names[0].norm), langMark: LANG_MARK_RE.test(names[0].norm),
      };
    });
  }

  function idfTable(prepared) {
    const df = new Map(), ddf = new Map(), hdf = new Map(), dkc = new Map(), ndf = new Map();
    for (const p of prepared) {
      for (const t of p.tokens) df.set(t, (df.get(t) || 0) + 1);
      if (p.people) for (const t of p.people) ndf.set(t, (ndf.get(t) || 0) + 1);
      if (p.desc) for (const t of p.desc) ddf.set(t, (ddf.get(t) || 0) + 1);
      if (p.hash) hdf.set(p.hash, (hdf.get(p.hash) || 0) + 1);
      if (p.descKey) dkc.set(p.descKey, (dkc.get(p.descKey) || 0) + 1);
    }
    const n = prepared.length || 1;
    // Nome "raro": aparece na sinopse de poucas obras (personagem, não "Deus", "Imperador" ou "Academia").
    const rareName = Math.max(4, Math.round(n * 0.0015));
    // Capa ou sinopse usada por muitas obras é padrão ("sem capa", "sinopse em breve"): não conta.
    return {
      df, ddf, hdf, dkc, ndf, idf: (t) => Math.log(1 + n / (df.get(t) || 1)),
      rarePeople: (p) => (p.people && !((dkc.get(p.descKey) || 0) >= 3) ? Array.from(p.people).filter((t) => (ndf.get(t) || 0) <= rareName && (ddf.get(t) || 0) <= rareName * 3) : []),
      placeholder: (h) => (hdf.get(h) || 0) >= PLACEHOLDER_MIN,
      descOk: (p) => Boolean(p.desc) && (dkc.get(p.descKey) || 0) < 3,
    };
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
      if (p.hash && !table.placeholder(p.hash)) add("h:" + p.hash.slice(0, 4), p.i);
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
    // Sinopses: as 10 palavras mais raras de cada uma (usadas por 2 a 40 obras); 3 ou mais em comum = candidatas.
    const dBuckets = new Map();
    for (const p of prepared) {
      if (!table.descOk(p)) continue;
      const keys = Array.from(p.desc).filter((t) => { const d = table.ddf.get(t) || 0; return d >= 2 && d <= 40; })
        .sort((x, y) => (table.ddf.get(x) || 0) - (table.ddf.get(y) || 0)).slice(0, 10);
      for (const k of keys) { let l = dBuckets.get(k); if (!l) dBuckets.set(k, (l = [])); l.push(p.i); }
    }
    const co = new Map();
    for (const list of dBuckets.values()) {
      if (list.length < 2) continue;
      for (let a = 0; a < list.length; a++) for (let b = a + 1; b < list.length; b++) {
        const k = Math.min(list[a], list[b]) * 1e6 + Math.max(list[a], list[b]);
        co.set(k, (co.get(k) || 0) + 1);
      }
    }
    for (const [k, n] of co) if (n >= 3) pairs.add(k);
    // Nomes próprios raros da sinopse (personagens): 2 ou mais em comum = candidatas, mesmo em línguas diferentes.
    const nBuckets = new Map();
    for (const p of prepared) {
      p.rare = table.rarePeople(p);
      for (const k of p.rare) { const d = table.ndf.get(k) || 0; if (d < 2) continue; let l = nBuckets.get(k); if (!l) nBuckets.set(k, (l = [])); l.push(p.i); }
    }
    const nco = new Map();
    for (const list of nBuckets.values()) {
      for (let a = 0; a < list.length; a++) for (let b = a + 1; b < list.length; b++) {
        const k = Math.min(list[a], list[b]) * 1e6 + Math.max(list[a], list[b]);
        nco.set(k, (nco.get(k) || 0) + 1);
      }
    }
    for (const [k, n] of nco) if (n >= 2) pairs.add(k);
    return pairs;
  }

  /**
   * Nota de 0 a 100 e os motivos de duas obras serem a mesma. parts: como a nota foi feita (sinal principal, bônus e
   * descontos, em pontos); desc: comparação das sinopses (trechos, palavras e nomes em comum).
   */
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
    let coverDist = null;
    if (A.cover && A.cover === B.cover) sig(90, "Mesmo arquivo de capa");
    else if (A.hash && B.hash && !table.placeholder(A.hash) && !table.placeholder(B.hash)) {
      coverDist = hamming(A.hash, B.hash);
      if (coverDist <= 5) sig(92, "Mesma imagem de capa");
      else if (coverDist <= 10) sig(72, "Capa muito parecida");
    }
    let descSim = null;
    if (table.descOk(A) && table.descOk(B)) {
      const sh = A.desc.shingles.size && B.desc.shingles.size ? jaccard(A.desc.shingles, B.desc.shingles) : 0;
      const j = jaccard(A.desc, B.desc);
      const common = Array.from(A.desc).filter((t) => B.desc.has(t)).sort((x, y) => (table.ddf.get(x) || 0) - (table.ddf.get(y) || 0)).slice(0, 12);
      descSim = { sh, j, words: common };
      if (sh >= 0.7 || j >= 0.85) sig(96, "Mesma sinopse");
      else if (sh >= 0.4 || j >= 0.6) sig(88, `Sinopse quase igual (${Math.round(Math.max(sh, j) * 100)}%)`);
      else if (j >= 0.4) sig(70, `Sinopse parecida (${Math.round(j * 100)}%)`);
    }
    // Personagens e lugares (nomes raros) nas duas sinopses: vale entre línguas diferentes.
    const ra = A.rare || [], rb = new Set(B.rare || []);
    const people = ra.filter((t) => rb.has(t));
    if (people.length >= 3) sig(88, `Mesmos nomes na sinopse: ${people.slice(0, 4).join(", ")}`);
    else if (people.length === 2) sig(76, `Dois nomes iguais na sinopse: ${people.join(", ")}`);
    if (descSim || people.length) descSim = Object.assign(descSim || { sh: 0, j: 0, words: [] }, { people });
    if (!signals.length) return null;
    signals.sort((p, q) => q.score - p.score);
    const parts = [{ text: signals[0].text, pts: signals[0].score, base: true }];
    const extra = signals.filter((s) => s.score >= 70).slice(1, 3);
    let score = signals[0].score;
    extra.forEach((s) => { score += 4; parts.push({ text: `Mais um sinal: ${s.text}`, pts: 4 }); });
    const reasons = signals.map((s) => s.text);
    const notes = [];
    const minus = (pts, text) => { score -= pts; notes.push(text); parts.push({ text, pts: -pts }); };
    const plus = (pts, text) => { score += pts; reasons.push(text); parts.push({ text, pts }); };
    const ca = Number(A.w.chapters), cb = Number(B.w.chapters);
    if (ca > 5 && ca === cb) plus(3, `Mesmo número de capítulos (${ca})`);
    else if (ca > 5 && cb > 5 && Math.abs(ca - cb) <= Math.max(2, Math.round(Math.max(ca, cb) * 0.05))) plus(2, `Número de capítulos parecido (${ca} × ${cb})`);
    if (A.main.seq !== B.main.seq) {
      // 8 × 9 é outra obra quase sempre; "Obra" × "Obra 2" costuma ser a continuação.
      minus(A.main.seq && B.main.seq ? 45 : 30, `Números diferentes no título (${A.main.seq || "nenhum"} × ${B.main.seq || "nenhum"}): pode ser continuação`);
    }
    if (A.kind && B.kind && A.kind !== B.kind) minus(35, `Formatos diferentes (${A.w.format} × ${B.w.format}): pode ser adaptação ou outra edição`);
    if (A.side !== B.side) minus(20, "Só um dos títulos tem marca de história paralela ou especial");
    if (A.langMark !== B.langMark) minus(20, "Só um dos títulos tem marca de outra língua");
    const exactName = bestName >= 95;
    // Sinopses longas, na mesma língua e sem quase nada em comum: histórias diferentes.
    let differentStory = false;
    if (descSim && descSim.sh === 0 && descSim.j < 0.06 && A.lang && A.lang === B.lang && A.desc.size >= 20 && B.desc.size >= 20 && people.length < 2) {
      differentStory = true;
      minus(exactName ? 15 : 25, "Sinopses bem diferentes: podem ser histórias diferentes com nome parecido");
    }
    // Vários personagens raros em cada sinopse e nenhum em comum (vale entre línguas): outra história.
    if (!differentStory && ra.length >= 3 && rb.size >= 3 && !people.length && !(descSim && (descSim.sh >= 0.4 || descSim.j >= 0.5))) {
      minus(exactName ? 15 : 20, "Personagens diferentes nas sinopses");
    }
    // Autores: iguais ajudam; diferentes (sem nenhuma palavra em comum) baixam a nota se o título não for o mesmo.
    if (A.authors.size && B.authors.size) {
      const same = Array.from(A.authors).find((x) => B.authors.has(x));
      const words = (set) => new Set(Array.from(set).join(" ").split(" ").filter((x) => x.length > 2));
      const wa = words(A.authors), wb = words(B.authors);
      if (same) plus(3, `Mesmo autor (${same})`);
      else if (!Array.from(wa).some((x) => wb.has(x))) {
        const text = `Autores diferentes (${Array.from(A.authors)[0]} × ${Array.from(B.authors)[0]})`;
        if (!exactName) minus(15, text); else notes.push(text);
      }
    }
    // Capas bem diferentes quando o título só é parecido (e a sinopse não confirma).
    if (coverDist != null && coverDist >= 28 && bestName < 90 && !(descSim && (descSim.sh >= 0.4 || descSim.j >= 0.6)) && people.length < 2) {
      minus(8, "Capas bem diferentes");
    }
    return { score: Math.max(0, Math.min(100, Math.round(score))), reasons, notes, parts, desc: descSim, cover: coverDist };
  }

  /**
   * Qual manter: a mais completa (mais capítulos); empate, a sem problema grave de capa ou sinopse (bad: Set de IDs
   * com problema); depois a que tem detalhes lidos; depois a mais antiga (menor ID). Devolve {id, why}.
   */
  function keepOf(works, bad) {
    const isBad = (w) => (bad instanceof Set && (bad.has(w.id) || bad.has(String(w.id))) ? 1 : 0);
    const ch = (w) => (Number.isFinite(Number(w.chapters)) && w.chapters != null ? Number(w.chapters) : -1);
    const sorted = works.slice().sort((a, b) => ch(b) - ch(a) || isBad(a) - isBad(b) || (b.detailed ? 1 : 0) - (a.detailed ? 1 : 0) || Number(a.id) - Number(b.id));
    const best = sorted[0], second = sorted[1];
    const why = ch(best) > (second ? ch(second) : -1) ? `mais capítulos (${ch(best)})`
      : second && !isBad(best) && isBad(second) ? "capa e sinopse sem problemas" : "mais antiga no site";
    return { id: best.id, why };
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
    const near = new Map();
    for (const k of cands) {
      const a = Math.floor(k / 1e6), b = k % 1e6;
      const A = prepared[a], B = prepared[b];
      if (dismissed.has(pairKey(String(A.w.id), String(B.w.id)))) continue;
      const r = scorePair(A, B, table);
      if (r && r.score >= min) pairs.push({ a: A.w, b: B.w, score: r.score, level: levelOf(r.score), reasons: r.reasons, notes: r.notes, parts: r.parts, desc: r.desc, coverDist: r.cover });
      else if (r && r.score >= 35) {
        // Quase suspeitas: os detalhes (sinopse, nomes, autores) podem confirmar ou descartar.
        for (const w of [A.w, B.w]) if (!w.detailed) near.set(w.id, Math.max(near.get(w.id) || 0, r.score));
      }
    }
    // Grupos: obras ligadas por pares de 70 ou mais. Um par "talvez" vira grupo à parte (não junta grupos: A≈B
    // forte e B≈C fraco não põe C junto de A).
    const parent = new Map();
    const find = (x) => { while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x))); x = parent.get(x); } return x; };
    const join = (x, y) => { for (const z of [x, y]) if (!parent.has(z)) parent.set(z, z); const rx = find(x), ry = find(y); if (rx !== ry) parent.set(rx, ry); };
    const strong = (p) => p.score >= 70;
    for (const p of pairs) if (strong(p)) join(String(p.a.id), String(p.b.id));
    const byRoot = new Map();
    for (const p of pairs) {
      const a = String(p.a.id), b = String(p.b.id);
      if (!strong(p) && parent.has(a) && parent.has(b) && find(a) === find(b)) {
        // Par fraco dentro de um grupo forte: só entra como mais um motivo.
        byRoot.get(find(a)) ? byRoot.get(find(a)).pairs.push(p) : null;
        continue;
      }
      // Par fraco com uma ponta num grupo forte: um grupo só por obra de fora (o par com a nota maior).
      const ra = parent.has(a) ? find(a) : null, rb = parent.has(b) ? find(b) : null;
      const r = strong(p) ? find(a) : ra && !rb ? `fraco:${ra}:${b}` : rb && !ra ? `fraco:${rb}:${a}` : `fraco:${pairKey(a, b)}`;
      if (!strong(p) && byRoot.has(r)) { if (byRoot.get(r).score >= p.score) continue; byRoot.delete(r); }
      let g = byRoot.get(r);
      if (!g) byRoot.set(r, (g = { works: new Map(), pairs: [], score: 0 }));
      g.works.set(String(p.a.id), p.a); g.works.set(String(p.b.id), p.b);
      g.pairs.push(p);
      g.score = Math.max(g.score, p.score);
    }
    const groups = Array.from(byRoot.values()).map((g) => {
      const ws = Array.from(g.works.values()).sort((x, y) => Number(x.id) - Number(y.id));
      g.pairs.sort((x, y) => y.score - x.score);
      return { key: ws.map((w) => w.id).join("-"), ids: ws.map((w) => w.id), works: ws, pairs: g.pairs, score: g.score, level: levelOf(g.score), keep: keepOf(ws) };
    }).sort((x, y) => y.score - x.score || y.works.length - x.works.length);
    const nearIds = Array.from(near.entries()).sort((x, y) => y[1] - x[1]).map((e) => e[0]);
    return { groups, pairs, near: nearIds, compared: cands.size, ms: Date.now() - t0 };
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

  /* ---------- Problemas de cada obra: sinopse zuada e capa quebrada ---------- */

  const P_PLACEHOLDER = /^(sem (sinopse|descricao|resumo)( (disponivel|ainda|no momento))?|sinopse|descricao|resumo|em breve|sinopse em breve|em atualizacao|aguarde|indisponivel|nao (ha|tem|possui) (sinopse|descricao)( disponivel)?|null|undefined|none|nan|n a|tbd|tba|teste?|test|lorem ipsum.*|no (description|synopsis).*|coming soon|description|synopsis|sinopse nao disponivel|\?+)$/;
  const P_MOJIBAKE = /Ã[\u00A0-\u00BF\u0152\u0153\u0160\u0161\u0178\u017D\u017E\u0192\u02C6\u02DC\u2013\u2014\u2018-\u2022\u2026\u2030\u2039\u203A\u20AC\u2122]|â€|Â[\u00A0-\u00BF]|\uFFFD/;
  const P_QMARK = /\p{L}\?\p{L}/gu;
  const P_ESCAPED = /&amp;(#?\w+);|&lt;\/?[a-z]+|\[\/?(b|i|u|url|img|color|size)(=[^\]]*)?\]/i;
  const P_HTML = /<\/?(p|br|div|span|strong|em|b|i|a|ul|ol|li|h[1-6]|font)\b[^>]*>|&(nbsp|amp|quot|lt|gt|#\d+|#x[0-9a-f]+);/i;
  const P_LINK = /https?:\/\/|www\.\S|discord\.(gg|com)|t\.me\/|wa\.me\/|bit\.ly|\b[\w-]+\.(com|net|org|io|xyz|site|online|top|cc|me)(\.br)?\b/i;
  const P_ADS = /\b(pix|patreon|ko-?fi|apoia\.se|catarse|doacao|doacoes|apoie (o|a|nosso|nossa|a scan)|entre (no|em) nosso|siga (a|o|nosso|nossa)|leia (em|no|na) (nosso|nossa|site)|nosso (site|discord|grupo))\b/;
  const P_CREDITS = /\b(traducao|tradutor|revisao|revisor|edicao|editor|creditos|cleaner|typesetter|redraw|qc|scan)\s*[:\-–]/;
  const P_CUT_END = /(,|;|:|\s(e|de|da|do|das|dos|que|a|o|as|os|para|com|em|um|uma|no|na|por|se|mas|the|and|of|to|a))$/i;
  const G = (code, text, extra) => Object.assign({ code, level: "grave", text }, extra || {});
  const W = (code, text, extra) => Object.assign({ code, level: "aviso", text }, extra || {});

  /** Problemas da sinopse de uma obra. ctx: dados do catálogo todo (ver findProblems). */
  function descIssues(w, ctx) {
    const raw = typeof w.desc === "string" ? w.desc : "";
    const t = raw.replace(/\s+/g, " ").trim();
    if (!t) {
      // Só com os detalhes lidos dá para dizer que falta (e só se a API costuma mandar sinopse).
      return w.detailed && (w.descField || ctx.descRate >= 0.5) ? [G("vazia", "Sem sinopse")] : [];
    }
    const out = [];
    const n = normalize(t);
    const letters = (t.match(/\p{L}/gu) || []).length;
    if (!n) return [G("simbolos", `Sinopse só com símbolos (“${t.slice(0, 30)}”)`)];
    if (P_PLACEHOLDER.test(n) || (t.length < 60 && /\b(sem sinopse|sinopse em breve|sem descricao)\b/.test(n))) return [G("enfeite", `Sinopse de enfeite (“${t.slice(0, 40)}”)`)];
    const names = [w.title].concat(Array.isArray(w.alts) ? w.alts : []).map(normalize).filter(Boolean);
    if (names.includes(n)) return [G("titulo", "A sinopse é só o título")];
    if (P_MOJIBAKE.test(t) || (t.match(P_QMARK) || []).length >= 2) out.push(G("codificacao", "Letras quebradas (Ã©, â€™, n?o…)"));
    if (P_ESCAPED.test(t) || (!ctx.htmlNormal && P_HTML.test(t))) out.push(G("codigo", "Restos de código na sinopse (HTML, &amp;…)"));
    const folded = fold(t);
    if (P_LINK.test(t) || P_ADS.test(folded)) out.push(G("link", "Link ou propaganda na sinopse"));
    else if (P_CREDITS.test(folded)) out.push(W("creditos", "Créditos da scan na sinopse"));
    const lang = langOf(t, names);
    if (lang && lang !== "pt") out.push(W("idioma", `Sinopse em ${LANG_NAME[lang] || lang}`));
    const words = n.split(" ").length;
    if (t.length < 60 || words < 10) out.push(W("curta", `Sinopse curta demais (${words} palavra${words === 1 ? "" : "s"})`));
    else if (w.detailed && !w.descCut && P_CUT_END.test(t)) out.push(W("cortada", "Sinopse parece cortada no meio"));
    // Frase repetida (5+ palavras) ou texto colado duas vezes.
    const sentences = t.split(/[.!?]+\s+/).map(normalize).filter((x) => x.split(" ").length >= 5);
    if (sentences.length !== new Set(sentences).size) out.push(W("repetida", "Texto repetido na sinopse"));
    if (letters >= 40) {
      const upper = (t.match(/\p{Lu}/gu) || []).length;
      if (upper / letters > 0.8) out.push(W("maiusculas", "Sinopse toda em maiúsculas"));
    }
    const odd = (t.match(/[^\p{L}\p{N}\s.,;:!?'"()\[\]\-–—…«»“”‘’\/%ºª°#&*+=]/gu) || []).length;
    if (t.length >= 40 && odd / t.length > 0.12) out.push(W("simbolos", "Muitos símbolos estranhos na sinopse"));
    // A mesma sinopse em outras obras (sem ser a mesma obra repetida nem continuação/adaptação).
    const key = descKey(t);
    const same = key ? (ctx.descIds.get(key) || []).filter((id) => String(id) !== String(w.id)) : [];
    if (same.length) {
      const family = (id) => {
        const o = ctx.byId.get(String(id));
        if (!o) return true;
        if (ctx.groupOf.get(String(id)) && ctx.groupOf.get(String(id)) === ctx.groupOf.get(String(w.id))) return true;
        const a = analyze(w.title, ctx.ignore), b = analyze(o.title, ctx.ignore);
        return (a.core && a.core === b.core) || kindClass(w.format) !== kindClass(o.format) || (a.core && b.core && (a.core.startsWith(b.core) || b.core.startsWith(a.core)));
      };
      const strangers = same.filter((id) => !family(id));
      if (strangers.length >= 2) out.push(G("padrao", `A mesma sinopse está em ${strangers.length + 1} obras diferentes (texto padrão)`, { refs: strangers.slice(0, 5) }));
      else if (strangers.length === 1) out.push(G("copiada", "Sinopse igual à de outra obra (uma das duas está errada)", { refs: strangers }));
    }
    return out;
  }

  /** Problemas da capa de uma obra (w.coverInfo vem da conferência: {s, t, b, w, h, std, ok, err}). */
  function coverIssues(w, ctx) {
    if (!w.cover) return ctx.coverRate >= 0.5 ? [G("sem-capa", "Sem capa")] : [];
    const c = w.coverInfo;
    if (!c) return [];
    if (c.s === -1) return [W("fora", `Capa guardada fora da MediocreScan (${c.err || "outro site"})`)];
    if (c.s >= 400) return ctx.cdnBlocked ? [] : [G("nao-abre", `Capa não abre (erro ${c.s})`)];
    if (!c.s) return ctx.cdnBlocked ? [] : [G("sem-resposta", "Capa não respondeu (3 tentativas)")];
    if (!c.ok && c.t && !/^image\//i.test(c.t)) return [G("nao-imagem", `O endereço da capa devolve ${String(c.t).split(";")[0]}, não uma imagem`)];
    if (!c.ok && c.err && /grande demais/.test(c.err)) return [W("enorme", "Capa enorme (mais de 8 MB)")];
    if (!c.ok) return [G("estragada", "Arquivo da capa estragado (não abre como imagem)")];
    const out = [];
    if (c.w <= 16 || c.h <= 16) out.push(G("vazia", `Capa vazia (${c.w}×${c.h} px)`));
    else if (c.std != null && c.std < 3) out.push(G("uma-cor", "Capa vazia (uma cor só)"));
    else {
      if (c.w < 150 || c.h < 200) out.push(W("pequena", `Capa pequena demais (${c.w}×${c.h} px)`));
      if (c.std != null && c.std < 8) out.push(W("apagada", "Capa quase sem imagem (quase uma cor só)"));
      if (c.w > c.h * 1.15) out.push(W("deitada", `Capa deitada (${c.w}×${c.h} px): parece banner`));
    }
    const same = w.coverHash ? (ctx.hashIds.get(w.coverHash) || []) : [];
    if (same.length >= PLACEHOLDER_MIN) {
      const cores = new Set(same.map((id) => { const o = ctx.byId.get(String(id)); return o ? analyze(o.title, ctx.ignore).core : ""; }));
      if (cores.size > 1) out.push(G("padrao", `Capa padrão (a mesma imagem em ${same.length} obras)`));
    }
    return out;
  }

  /**
   * Problemas de todas as obras. opts: {groups (de findDuplicates, para não acusar sinopse copiada entre cópias da
   * mesma obra), ignore, ignored (Set de "id:desc" / "id:cover" dispensados)}.
   * Devolve {items: [{w, kind: "desc"|"cover", issues, grave}], counts, warnings, ms}.
   */
  function findProblems(works, opts) {
    const t0 = Date.now();
    opts = opts || {};
    const ignored = opts.ignored instanceof Set ? opts.ignored : new Set(opts.ignored || []);
    const byId = new Map(), groupOf = new Map(), descIds = new Map(), hashIds = new Map();
    let detailed = 0, withDesc = 0, withField = 0, html = 0, withCover = 0, checked = 0, failed = 0;
    const fails = new Map();
    for (const w of works) {
      if (!w || w.id == null) continue;
      byId.set(String(w.id), w);
      if (w.detailed) { detailed++; if (w.desc) withDesc++; if (w.descField) withField++; }
      if (w.desc) {
        if (P_HTML.test(w.desc)) html++;
        const k = descKey(w.desc);
        if (k) { let l = descIds.get(k); if (!l) descIds.set(k, (l = [])); l.push(w.id); }
      }
      if (w.cover) withCover++;
      if (w.coverInfo) {
        checked++;
        const s = w.coverInfo.s;
        if (s >= 400 || s === 0) { failed++; fails.set(s, (fails.get(s) || 0) + 1); }
      }
      if (w.coverHash && w.coverInfo && w.coverInfo.ok) { let l = hashIds.get(w.coverHash); if (!l) hashIds.set(w.coverHash, (l = [])); l.push(w.id); }
    }
    (opts.groups || []).forEach((g) => g.works.forEach((w) => groupOf.set(String(w.id), g.key)));
    const descCount = Array.from(byId.values()).filter((w) => w.desc).length;
    const ctx = {
      byId, groupOf, descIds, hashIds, ignore: ignoreSet(opts.ignore),
      descRate: detailed ? withDesc / detailed : 0,
      htmlNormal: descCount >= 20 && html / descCount > 0.2,
      coverRate: byId.size ? withCover / byId.size : 0,
      cdnBlocked: checked >= 20 && failed / checked >= 0.6,
    };
    void withField;
    const warnings = [];
    if (ctx.cdnBlocked) {
      const top = Array.from(fails.entries()).sort((a, b) => b[1] - a[1])[0];
      warnings.push(`A maioria das capas não abriu (${top && top[0] ? `erro ${top[0]}` : "sem resposta"} em ${failed} de ${checked}). Parece bloqueio do servidor de imagens, não capa quebrada: essas não entram na lista. Veja o Diagnóstico em Ajustes.`);
    }
    if (detailed >= 30 && ctx.descRate < 0.5) warnings.push("A maioria das obras veio sem sinopse nos detalhes: o app não acusa \"Sem sinopse\" (pode ser o jeito da API responder).");
    const items = [];
    const counts = { desc: 0, cover: 0, grave: 0, descChecked: 0, coverChecked: checked, total: byId.size };
    for (const w of byId.values()) {
      if (w.detailed || w.desc) counts.descChecked++;
      if (!w.cover) counts.coverChecked++;
      for (const [kind, fn] of [["desc", descIssues], ["cover", coverIssues]]) {
        const issues = fn(w, ctx);
        if (!issues.length || ignored.has(`${w.id}:${kind}`)) continue;
        issues.sort((a, b) => (a.level === b.level ? 0 : a.level === "grave" ? -1 : 1));
        const grave = issues.some((x) => x.level === "grave");
        items.push({ w, kind, issues, grave, key: `${w.id}:${kind}` });
        counts[kind]++;
        if (grave) counts.grave++;
      }
    }
    items.sort((a, b) => (b.grave ? 1 : 0) - (a.grave ? 1 : 0) || Number(b.w.id) - Number(a.w.id));
    return { items, counts, warnings, ms: Date.now() - t0 };
  }

  const api = { normalize, analyze, ignoreSet, similarity, hamming, keepOf, findDuplicates, search, levelOf, pairKey, langOf, descNames, descIssues, coverIssues, findProblems, FORMAT_WORDS };
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.Dup = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
