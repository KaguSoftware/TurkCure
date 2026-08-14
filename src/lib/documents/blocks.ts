// The document block model: node-type names and attribute shapes shared by the
// Tiptap editor (src/components/documents/editor) and the react-pdf mapper
// (src/lib/pdf/editorDoc.tsx). This module is deliberately free of both Tiptap
// and react-pdf imports — it defines the JSON contract only, which is what lets
// the two renderers stay independent of each other.
//
// The JSON matches Tiptap's document format: nested nodes with `type`, optional
// `attrs`, `content` (child nodes) and, on text nodes, `text` + `marks`.
// Anything the mapper does not recognize degrades to plain text, never a crash
// — see the resilience contract in editorDoc.tsx.
//
// Money and dates are stored PRE-FORMATTED ("3,200 GBP", "02.11.2026"). The
// document is a document, not a data model: what you read in the editor is what
// prints. The case form stays the source of truth and this document is
// write-only, so nothing ever parses these strings back into numbers.

// ── Node type names ─────────────────────────────────────────────────────────
export const BLOCK = {
  doc: "doc",
  paragraph: "paragraph",
  heading: "heading",
  text: "text",
  hardBreak: "hardBreak",
  bulletList: "bulletList",
  orderedList: "orderedList",
  listItem: "listItem",
  table: "table",
  tableRow: "tableRow",
  tableHeader: "tableHeader",
  tableCell: "tableCell",
  image: "image",
  // custom nodes — one per section of the generated case PDF
  coverBlock: "coverBlock",
  tableSection: "tableSection",
  packageBullets: "packageBullets",
  paymentSummary: "paymentSummary",
  additionalCosts: "additionalCosts",
  companyCard: "companyCard",
  confirmationBlock: "confirmationBlock",
  instructionBlock: "instructionBlock",
  pageBreak: "pageBreak",
} as const;

/** Italic is deliberately absent: no italic face is registered for the PDF, so
 *  the editor disables it rather than letting it render and then vanish. */
export type MarkName = "bold" | "underline";

// ── JSON node shape (Tiptap-compatible) ─────────────────────────────────────
export interface DocMark {
  type: string;
  attrs?: Record<string, unknown>;
}

export interface DocNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: DocNode[];
  text?: string;
  marks?: DocMark[];
}

/** A whole editor document. */
export interface EditorDocJSON extends DocNode {
  type: typeof BLOCK.doc;
  content: DocNode[];
}

// ── Custom node attribute shapes ────────────────────────────────────────────

/** The navy cover page. `treatments` lists every operation the document covers. */
export interface CoverBlockAttrs {
  title: string;
  titleAccent: string;
  tagline: string;
  preparedForLabel: string;
  patientName: string;
  treatments: string[];
  /** Doctor · hospital line; blank hides it. */
  line1: string;
  /** Arrival — departure line; blank hides it. */
  line2: string;
  footer: string;
}

export interface TRowItem {
  label: string;
  value: string;
}

/** The numbered navy-band section wrapping label/value rows — the workhorse. */
export interface TableSectionAttrs {
  number: string;
  title: string;
  rows: TRowItem[];
}

export interface PackageBulletsAttrs {
  number: string;
  title: string;
  procedure: string;
  bullets: string[];
}

export interface PaymentSummaryAttrs {
  number: string;
  title: string;
  rows: TRowItem[];
  /** The gold-tinted emphasis row. */
  balanceLabel: string;
  balanceValue: string;
  note: string;
}

export interface AdditionalCostsAttrs {
  number: string;
  title: string;
  rows: { title: string; amount: string }[];
  /** Load-bearing: without it a patient assumes the package total includes these. */
  note: string;
}

export interface CompanyCardAttrs {
  number: string;
  title: string;
  rows: TRowItem[];
}

export interface ConfirmationBlockAttrs {
  title: string;
  body: string;
  signers: string[];
}

/** A case instruction: markdown body plus already-signed image URLs. */
export interface InstructionBlockAttrs {
  title: string;
  bodyMd: string;
  imageUrls: string[];
}

export interface ImageAttrs {
  src: string;
  width?: number | null;
  height?: number | null;
  alt?: string | null;
}

// ── Constructors (used by buildCaseDoc and the tests) ───────────────────────
export const text = (t: string, marks?: DocMark[]): DocNode =>
  marks && marks.length ? { type: BLOCK.text, text: t, marks } : { type: BLOCK.text, text: t };

export const paragraph = (t?: string): DocNode =>
  t && t.length ? { type: BLOCK.paragraph, content: [text(t)] } : { type: BLOCK.paragraph };

export const coverBlock = (attrs: CoverBlockAttrs): DocNode => ({
  type: BLOCK.coverBlock,
  attrs: { ...attrs } satisfies CoverBlockAttrs,
});

export const tableSection = (number: string, title: string, rows: TRowItem[]): DocNode => ({
  type: BLOCK.tableSection,
  attrs: { number, title, rows } satisfies TableSectionAttrs,
});

export const packageBullets = (attrs: PackageBulletsAttrs): DocNode => ({
  type: BLOCK.packageBullets,
  attrs: { ...attrs } satisfies PackageBulletsAttrs,
});

export const paymentSummary = (attrs: PaymentSummaryAttrs): DocNode => ({
  type: BLOCK.paymentSummary,
  attrs: { ...attrs } satisfies PaymentSummaryAttrs,
});

export const additionalCosts = (attrs: AdditionalCostsAttrs): DocNode => ({
  type: BLOCK.additionalCosts,
  attrs: { ...attrs } satisfies AdditionalCostsAttrs,
});

export const companyCard = (number: string, title: string, rows: TRowItem[]): DocNode => ({
  type: BLOCK.companyCard,
  attrs: { number, title, rows } satisfies CompanyCardAttrs,
});

export const confirmationBlock = (attrs: ConfirmationBlockAttrs): DocNode => ({
  type: BLOCK.confirmationBlock,
  attrs: { ...attrs } satisfies ConfirmationBlockAttrs,
});

export const instructionBlock = (attrs: InstructionBlockAttrs): DocNode => ({
  type: BLOCK.instructionBlock,
  attrs: { ...attrs } satisfies InstructionBlockAttrs,
});

export const pageBreak = (): DocNode => ({ type: BLOCK.pageBreak });

/** Simple table from string cells; the first row becomes the header row. */
export const simpleTable = (header: string[], rows: string[][]): DocNode => ({
  type: BLOCK.table,
  content: [
    {
      type: BLOCK.tableRow,
      content: header.map((h) => ({ type: BLOCK.tableHeader, content: [paragraph(h)] })),
    },
    ...rows.map((cells) => ({
      type: BLOCK.tableRow,
      content: cells.map((c) => ({ type: BLOCK.tableCell, content: [paragraph(c)] })),
    })),
  ],
});

/** Extract the concatenated plain text of a node subtree (fallback rendering). */
export function plainText(node: DocNode): string {
  if (node.type === BLOCK.text) return node.text ?? "";
  if (node.type === BLOCK.hardBreak) return "\n";
  return (node.content ?? []).map(plainText).join("");
}
