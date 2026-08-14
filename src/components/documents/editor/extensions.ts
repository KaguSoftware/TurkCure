"use client";

/**
 * Tiptap schema for the case document editor.
 *
 * The schema is deliberately NARROWED to exactly what the PDF mapper can render
 * (src/lib/pdf/editorDoc.tsx). Anything the renderer cannot do is disabled here
 * rather than allowed and then silently dropped downstream — otherwise the
 * editor shows something that never reaches the printed document, which is the
 * worst possible failure for a WYSIWYG tool.
 */

import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Table } from "@tiptap/extension-table";
import { TableRow } from "@tiptap/extension-table-row";
import { TableCell } from "@tiptap/extension-table-cell";
import { TableHeader } from "@tiptap/extension-table-header";
import Placeholder from "@tiptap/extension-placeholder";
import {
  CoverBlockView,
  TableSectionView,
  PackageBulletsView,
  PaymentSummaryView,
  AdditionalCostsView,
  CompanyCardView,
  ConfirmationBlockView,
  InstructionBlockView,
  PageBreakView,
} from "./nodes";

/** Plain JSON attr with a default — documents persist as JSON, so HTML
 *  round-tripping only matters for copy/paste. */
const jsonAttr = (def: unknown) => ({ default: def });

/** Builds an atom block node backed by a React view. */
function blockNode(name: string, attrs: Record<string, unknown>, view: React.ComponentType<never>) {
  return Node.create({
    name,
    group: "block",
    atom: true,
    draggable: true,
    addAttributes: () =>
      Object.fromEntries(Object.entries(attrs).map(([k, v]) => [k, jsonAttr(v)])),
    parseHTML: () => [{ tag: `div[data-node='${name}']` }],
    renderHTML: ({ HTMLAttributes }) => [
      "div",
      mergeAttributes(HTMLAttributes, { "data-node": name }),
    ],
    addNodeView() {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return ReactNodeViewRenderer(view as any);
    },
  });
}

export const CoverBlock = blockNode(
  "coverBlock",
  {
    title: "",
    titleAccent: "",
    tagline: "",
    preparedForLabel: "",
    patientName: "",
    treatments: [],
    line1: "",
    line2: "",
    footer: "",
  },
  CoverBlockView as never
);

export const TableSectionNode = blockNode(
  "tableSection",
  { number: "", title: "", rows: [] },
  TableSectionView as never
);

export const PackageBulletsNode = blockNode(
  "packageBullets",
  { number: "", title: "", procedure: "", bullets: [] },
  PackageBulletsView as never
);

export const PaymentSummaryNode = blockNode(
  "paymentSummary",
  { number: "", title: "", rows: [], balanceLabel: "", balanceValue: "", note: "" },
  PaymentSummaryView as never
);

export const AdditionalCostsNode = blockNode(
  "additionalCosts",
  { number: "", title: "", rows: [], note: "" },
  AdditionalCostsView as never
);

export const CompanyCardNode = blockNode(
  "companyCard",
  { number: "", title: "", rows: [] },
  CompanyCardView as never
);

export const ConfirmationBlockNode = blockNode(
  "confirmationBlock",
  { title: "", body: "", signers: [] },
  ConfirmationBlockView as never
);

export const InstructionBlockNode = blockNode(
  "instructionBlock",
  { title: "", bodyMd: "", imageUrls: [] },
  InstructionBlockView as never
);

export const PageBreakNode = blockNode("pageBreak", {}, PageBreakView as never);

export function buildExtensions(placeholder: string) {
  return [
    StarterKit.configure({
      heading: { levels: [2, 3] },
      // Not representable in the PDF — keep the editor WYSIWYG-honest.
      // Italic in particular: no italic font face is registered, so it would
      // render as regular in the document while looking italic here.
      italic: false,
      blockquote: false,
      code: false,
      codeBlock: false,
      horizontalRule: false,
      link: false,
      strike: false,
    }),
    Table.configure({ resizable: false }),
    TableRow,
    // Cells accept paragraphs ONLY. The defaults accept any block, including
    // the structured blocks above — which the PDF's cell renderer flattens to
    // plain text, so they would show in the editor and vanish from the export.
    TableCell.extend({ content: "paragraph+" }),
    TableHeader.extend({ content: "paragraph+" }),
    CoverBlock,
    TableSectionNode,
    PackageBulletsNode,
    PaymentSummaryNode,
    AdditionalCostsNode,
    CompanyCardNode,
    ConfirmationBlockNode,
    InstructionBlockNode,
    PageBreakNode,
    Placeholder.configure({ placeholder }),
  ];
}
