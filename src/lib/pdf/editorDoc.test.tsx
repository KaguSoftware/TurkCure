/**
 * Renders the mapper through the REAL react-pdf Node renderer — no mocks, no
 * snapshots. The risk being guarded is *crash / silent drop*, not layout
 * regression: a document that throws mid-render is a document that cannot be
 * sent, and a block that silently vanishes is worse than one that renders ugly.
 */
import { describe, it, expect } from "vitest";
import React from "react";
import { renderToBuffer, Document, Page } from "@react-pdf/renderer";
import { EditorDocBody } from "./editorDoc";
import { pdfStyles as s } from "./common";
import {
  BLOCK,
  paragraph,
  tableSection,
  packageBullets,
  paymentSummary,
  additionalCosts,
  companyCard,
  confirmationBlock,
  simpleTable,
  text,
  pageBreak,
  type EditorDocJSON,
} from "@/lib/documents/blocks";
import { buildCaseDoc } from "@/lib/documents/buildCaseDoc";
import type { CaseDocData, PatientDocData } from "./case-doc";

function render(doc: EditorDocJSON) {
  return renderToBuffer(
    <Document>
      <Page size="A4" style={s.page}>
        <EditorDocBody doc={doc} />
      </Page>
    </Document>
  );
}

const CASE: CaseDocData = {
  caseId: "c1",
  ref: "PROTO-1",
  op: "Hair Transplant (DHI)",
  doctor: "Dr Test",
  hospital: "Test Hospital",
  hotel: "Test Hotel",
  currency: "Euros",
  arrival_date: "2026-11-02",
  departure_date: "2026-11-09",
  surgery_date: "2026-11-04",
  airport: "IST",
  airport_pickup: "VIP",
  totalNights: 7,
  hospitalNights: 2,
  packageBullets: ["Doctor consultation", "Surgical procedure", "Medication included"],
  total: 3200,
  deposit: 1000,
  additionalCosts: [{ title: "Revision surgery", amount: 500 }],
  instructions: [{ title: "Before surgery", body_md: "Do **not** eat.", image_paths: [] }],
  coverLine1: "Dr Test   ·   Test Hospital",
  coverLine2: "02.11.2026  —  09.11.2026",
};

const PATIENT: PatientDocData = {
  full_name: "Ayşe Gökçe Çelik",
  email: "a@example.com",
  phone: "+90 555 000 0000",
  date_of_birth: "1990-01-01",
  gender: "female",
  passport_number: "X1234567",
  country: "United Kingdom",
  coordinator: "Test Agent",
};

describe("editorDoc mapper", () => {
  it("renders a full seeded case document to a valid PDF", async () => {
    const buf = await render(buildCaseDoc(CASE, PATIENT));
    expect(buf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(buf.length).toBeGreaterThan(5000);
  });

  it("renders rich content: marks, lists, headings, tables", async () => {
    const doc: EditorDocJSON = {
      type: BLOCK.doc,
      content: [
        { type: BLOCK.heading, attrs: { level: 2 }, content: [text("Heading two")] },
        {
          type: BLOCK.paragraph,
          content: [
            text("plain "),
            text("bold", [{ type: "bold" }]),
            text(" and "),
            text("underlined", [{ type: "underline" }]),
            { type: BLOCK.hardBreak },
            text("after a break"),
          ],
        },
        {
          type: BLOCK.bulletList,
          content: [
            { type: BLOCK.listItem, content: [paragraph("first")] },
            { type: BLOCK.listItem, content: [paragraph("second")] },
          ],
        },
        {
          type: BLOCK.orderedList,
          content: [{ type: BLOCK.listItem, content: [paragraph("one")] }],
        },
        simpleTable(["Item", "Price"], [["Surgery", "3,200"]]),
      ],
    };
    const buf = await render(doc);
    expect(buf.subarray(0, 5).toString()).toBe("%PDF-");
  });

  it("survives unknown and malformed nodes (resilience contract)", async () => {
    const doc: EditorDocJSON = {
      type: BLOCK.doc,
      content: [
        // A node type from some future version of the app.
        { type: "someFutureBlock", content: [paragraph("embedded text")] },
        // Known blocks with the data missing or the wrong shape.
        { type: BLOCK.tableSection, attrs: { number: "1", title: "Broken" } },
        { type: BLOCK.tableSection, attrs: { rows: "not an array" } },
        { type: BLOCK.paymentSummary, attrs: {} },
        { type: BLOCK.packageBullets, attrs: { bullets: 42 } },
        { type: BLOCK.additionalCosts, attrs: { rows: null } },
        { type: BLOCK.companyCard, attrs: {} },
        { type: BLOCK.confirmationBlock, attrs: {} },
        // Content after the damage must still render.
        paragraph("Following content is still visible."),
      ],
    };
    const buf = await render(doc);
    expect(buf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(buf.length).toBeGreaterThan(1000);
  });

  it("honors explicit page breaks", async () => {
    const doc: EditorDocJSON = {
      type: BLOCK.doc,
      content: [paragraph("page one"), pageBreak(), paragraph("page two"), pageBreak(), paragraph("page three")],
    };
    const buf = await render(doc);
    // `break` only works on direct children of <Page>; if EditorDocBody ever
    // wraps its output in a View this drops back to a single page.
    const pages = buf.toString("latin1").match(/\/Type\s*\/Page[^s]/g) ?? [];
    expect(pages.length).toBeGreaterThanOrEqual(3);
  });

  it("drops an emptied additional-costs list instead of printing a bare header", async () => {
    const doc: EditorDocJSON = {
      type: BLOCK.doc,
      content: [
        additionalCosts({ number: "7", title: "Additional Costs", rows: [], note: "n" }),
        paragraph("after"),
      ],
    };
    const buf = await render(doc);
    expect(buf.toString("latin1")).not.toContain("Additional Costs");
  });

  it("keeps every seeded section in the output", async () => {
    const doc = buildCaseDoc(CASE, PATIENT);
    const types = doc.content.map((n) => n.type);
    expect(types).toContain(BLOCK.coverBlock);
    expect(types).toContain(BLOCK.tableSection);
    expect(types).toContain(BLOCK.packageBullets);
    expect(types).toContain(BLOCK.paymentSummary);
    expect(types).toContain(BLOCK.additionalCosts);
    expect(types).toContain(BLOCK.companyCard);
    expect(types).toContain(BLOCK.confirmationBlock);
    // Additional costs present → the company block is numbered 8, not 7.
    const company = doc.content.find((n) => n.type === BLOCK.companyCard);
    expect((company?.attrs as { number: string }).number).toBe("8");
  });
});

// Silences an unused-import lint on the constructors kept for readability.
void [tableSection, packageBullets, paymentSummary, companyCard, confirmationBlock];
