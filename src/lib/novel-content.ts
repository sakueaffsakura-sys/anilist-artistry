import { parseDocument, DomUtils } from "htmlparser2";

type Node = ReturnType<typeof parseDocument>["children"][number];
export type NovelBlock = { type: "text"; text: string } | { type: "image"; src: string };

export function safeNovelImage(raw: string, baseUrl?: string): string | null {
  try {
    const url = new URL(raw.trim(), baseUrl);
    return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password ? url.href : null;
  } catch {
    return null;
  }
}

export function parseNovelContent(content: string): NovelBlock[] {
  return content.split(/\r?\n/).flatMap((line): NovelBlock[] => {
    const text = line.trim();
    if (!text) return [];
    const image = text.match(/^\[img:(.*)\]$/);
    if (image) {
      const src = safeNovelImage(image[1] ?? "");
      return src ? [{ type: "image", src }] : [];
    }
    return [{ type: "text", text }];
  });
}

const markers = ["chapter-markdown-content", "chapter-content", "reading-content", "text-left", "entry-content", "prose"];
const ignored = new Set(["script", "style", "noscript", "svg", "nav", "footer", "header", "form", "button", "iframe"]);

function find(nodes: Node[], predicate: (node: Node) => boolean): Node | undefined {
  for (const node of nodes) {
    if (predicate(node)) return node;
    if ("children" in node) {
      const match = find(node.children, predicate);
      if (match) return match;
    }
  }
}

/** Extract text and images in document order without retaining executable HTML. */
export function extractChapter(html: string, sourceUrl?: string) {
  const doc = parseDocument(html);
  let scope: Node = doc;
  for (const marker of markers) {
    const match = find(doc.children, (node) => "attribs" in node &&
      `${node.attribs.id ?? ""} ${node.attribs.class ?? ""}`.split(/\s+/).includes(marker));
    if (match) { scope = match; break; }
  }
  const titleText = (tag: string, nodes: Node[]) => {
    const node = find(nodes, (n) => "name" in n && n.name === tag);
    return node ? DomUtils.textContent(node).trim() : "";
  };
  const nodes = "children" in scope ? scope.children : [];
  const h1 = titleText("h1", nodes);
  const h2 = titleText("h2", nodes);
  const canonical = find(doc.children, (node) => "attribs" in node && "name" in node &&
    node.name === "link" && node.attribs.rel === "canonical");
  const baseUrl = sourceUrl ?? (canonical && "attribs" in canonical ? canonical.attribs.href : undefined);
  const paragraphs: string[] = [];
  let buffer = "";
  const flush = () => {
    const text = buffer.replace(/[ \t]+/g, " ").trim();
    if (text && !/^traduzido (usando|por)/i.test(text)) paragraphs.push(text);
    buffer = "";
  };
  const walk = (node: Node) => {
    if (node.type === "text") { buffer += node.data; return; }
    if (!("name" in node)) {
      if ("children" in node) node.children.forEach(walk);
      return;
    }
    if (ignored.has(node.name) || /^h[1-6]$/.test(node.name) ||
      /comment|text-(xs|sm)|break-words|author|meta/i.test(`${node.attribs.class ?? ""} ${node.attribs.id ?? ""}`)) return;
    if (node.name === "img") {
      const raw = node.attribs["data-src"] || node.attribs["data-lazy-src"] || node.attribs.src ||
        node.attribs.srcset?.split(",")[0]?.trim().split(/\s+/)[0] || "";
      const src = safeNovelImage(raw, baseUrl);
      if (src) { flush(); paragraphs.push(`[img:${src}]`); }
      return;
    }
    if (node.name === "br") { flush(); return; }
    const block = /^(p|div|section|article|li|blockquote|figure)$/.test(node.name);
    if (block) flush();
    node.children.forEach(walk);
    if (block) flush();
  };
  nodes.forEach(walk);
  flush();
  const num = (h1 || titleText("title", doc.children)).match(/cap[íi]tulo\s*(\d+(?:[.,]\d+)?)/i)?.[1];
  return { title: h2 || null, number: num ? num.replace(",", ".") : null, content: paragraphs.join("\n\n") };
}

export function prepareChapterText(raw: string) {
  const base = /<\/?(p|div|br|h[1-6]|em|strong|span|img|html|body)[\s>/]/i.test(raw)
    ? extractChapter(raw) : { title: null, number: null, content: raw };
  const blocks = parseNovelContent(base.content.replace(/\u00a0/g, " "));
  return { ...base, content: blocks.map((block) => block.type === "image" ? `[img:${block.src}]` :
    block.text.replace(/[ \t]+/g, " ").replace(/\s+([,.;:!?…])/g, "$1")).filter((p) => !/^traduzido (usando|por)/i.test(p)).join("\n\n") };
}