/**
 * Tiny GFM-subset markdown parser shared by the in-app instruction preview
 * and the PDF renderer, so what the coordinator sees in PREVIEW is exactly
 * what lands in the patient PDF.
 *
 * Supported: h1–h3, paragraphs, bold, italic, inline code, links, images,
 * fenced code blocks, ordered/unordered lists, tables, and blockquotes
 * (a blockquote starting with **Note:** becomes an info callout).
 *
 * The parser is total: malformed input degrades to plain text and never
 * throws — a bad instruction body must never break PDF generation.
 */

export type InlineNode =
  | { type: "text"; text: string }
  | { type: "strong"; children: InlineNode[] }
  | { type: "em"; children: InlineNode[] }
  | { type: "code"; text: string }
  | { type: "link"; href: string; children: InlineNode[] }
  | { type: "image"; src: string; alt: string };

export type Block =
  | { type: "heading"; level: 1 | 2 | 3; children: InlineNode[] }
  | { type: "paragraph"; children: InlineNode[] }
  | { type: "list"; ordered: boolean; items: InlineNode[][] }
  | { type: "code"; text: string; lang?: string }
  | { type: "blockquote"; note: boolean; children: Block[] }
  | { type: "table"; header: InlineNode[][]; rows: InlineNode[][][] };

const HEADING_RE = /^(#{1,6})\s+(.*)$/;
const FENCE_RE = /^```(\S*)\s*$/;
const UL_RE = /^[-*]\s+(.*)$/;
const OL_RE = /^\d+\.\s+(.*)$/;
const QUOTE_RE = /^>\s?(.*)$/;
const TABLE_SEP_RE = /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/;

/** Split a table row on unescaped pipes; `\|` inside a cell is a literal pipe. */
function splitCells(line: string): string[] {
  const cells: string[] = [];
  let cur = "";
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === "\\" && line[i + 1] === "|") {
      cur += "|";
      i++;
    } else if (ch === "|") {
      cells.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  cells.push(cur);
  // Drop the empty leading/trailing cells from "| a | b |" style rows.
  if (cells.length && cells[0].trim() === "") cells.shift();
  if (cells.length && cells[cells.length - 1].trim() === "") cells.pop();
  return cells.map((c) => c.trim());
}

export function parseInline(src: string): InlineNode[] {
  const out: InlineNode[] = [];
  let text = "";
  const flush = () => {
    if (text) {
      out.push({ type: "text", text });
      text = "";
    }
  };

  let i = 0;
  while (i < src.length) {
    const rest = src.slice(i);

    // Inline code — highest precedence, no nesting inside.
    if (rest.startsWith("`")) {
      const end = src.indexOf("`", i + 1);
      if (end > i) {
        flush();
        out.push({ type: "code", text: src.slice(i + 1, end) });
        i = end + 1;
        continue;
      }
    }

    // Image: ![alt](src)
    const img = /^!\[([^\]]*)\]\(([^)\s]*)\)/.exec(rest);
    if (img) {
      flush();
      out.push({ type: "image", src: img[2], alt: img[1] });
      i += img[0].length;
      continue;
    }

    // Link: [text](href)
    const link = /^\[([^\]]+)\]\(([^)\s]*)\)/.exec(rest);
    if (link) {
      flush();
      out.push({ type: "link", href: link[2], children: parseInline(link[1]) });
      i += link[0].length;
      continue;
    }

    // Bold: **text**
    if (rest.startsWith("**")) {
      const end = src.indexOf("**", i + 2);
      if (end > i + 1) {
        flush();
        out.push({ type: "strong", children: parseInline(src.slice(i + 2, end)) });
        i = end + 2;
        continue;
      }
    }

    // Italic: *text* or _text_ (not part of ** which was handled above).
    if (rest[0] === "*" || rest[0] === "_") {
      const marker = rest[0];
      const end = src.indexOf(marker, i + 1);
      if (end > i + 1) {
        flush();
        out.push({ type: "em", children: parseInline(src.slice(i + 1, end)) });
        i = end + 1;
        continue;
      }
    }

    text += src[i];
    i++;
  }
  flush();
  return out;
}

export function parseMarkdown(md: string): Block[] {
  const lines = (md ?? "").replace(/\r\n?/g, "\n").split("\n");
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed === "") {
      i++;
      continue;
    }

    // Fenced code block — an unclosed fence runs to EOF (never throws).
    const fence = FENCE_RE.exec(trimmed);
    if (fence) {
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !/^```\s*$/.test(lines[i].trim())) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // skip closing fence (or EOF)
      blocks.push({ type: "code", text: codeLines.join("\n"), lang: fence[1] || undefined });
      continue;
    }

    // Heading — levels deeper than 3 clamp to 3.
    const heading = HEADING_RE.exec(trimmed);
    if (heading) {
      const level = Math.min(heading[1].length, 3) as 1 | 2 | 3;
      blocks.push({ type: "heading", level, children: parseInline(heading[2]) });
      i++;
      continue;
    }

    // Blockquote — strip the "> " prefix from the run and parse recursively.
    if (QUOTE_RE.test(trimmed)) {
      const inner: string[] = [];
      while (i < lines.length) {
        const m = QUOTE_RE.exec(lines[i].trim());
        if (!m) break;
        inner.push(m[1]);
        i++;
      }
      const children = parseMarkdown(inner.join("\n"));
      const note = /^\s*\*\*note:?\*\*/i.test(inner.join("\n").trim());
      blocks.push({ type: "blockquote", note, children });
      continue;
    }

    // Table — a pipe row immediately followed by a |---| separator.
    if (trimmed.includes("|") && i + 1 < lines.length && TABLE_SEP_RE.test(lines[i + 1].trim())) {
      const header = splitCells(trimmed).map(parseInline);
      i += 2;
      const rows: InlineNode[][][] = [];
      while (i < lines.length && lines[i].trim().includes("|")) {
        rows.push(splitCells(lines[i].trim()).map(parseInline));
        i++;
      }
      blocks.push({ type: "table", header, rows });
      continue;
    }

    // Lists (unordered then ordered) — consecutive item lines form one list.
    if (UL_RE.test(trimmed) || OL_RE.test(trimmed)) {
      const ordered = OL_RE.test(trimmed);
      const re = ordered ? OL_RE : UL_RE;
      const items: InlineNode[][] = [];
      while (i < lines.length) {
        const m = re.exec(lines[i].trim());
        if (!m) break;
        items.push(parseInline(m[1]));
        i++;
      }
      blocks.push({ type: "list", ordered, items });
      continue;
    }

    // Paragraph — consecutive plain lines join into one block.
    const para: string[] = [trimmed];
    i++;
    while (i < lines.length) {
      const t = lines[i].trim();
      if (
        t === "" ||
        HEADING_RE.test(t) ||
        FENCE_RE.test(t) ||
        QUOTE_RE.test(t) ||
        UL_RE.test(t) ||
        OL_RE.test(t)
      )
        break;
      para.push(t);
      i++;
    }
    blocks.push({ type: "paragraph", children: parseInline(para.join("\n")) });
  }

  return blocks;
}

/** Flatten inline nodes back to plain text (used for note-label detection etc.). */
export function inlineText(nodes: InlineNode[]): string {
  return nodes
    .map((n) => {
      if (n.type === "text" || n.type === "code") return n.text;
      if (n.type === "image") return n.alt;
      return inlineText(n.children);
    })
    .join("");
}
