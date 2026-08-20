/**
 * Not a behavior test — a fixture render harness for layout-regression checks.
 * Skipped unless PDF_BASELINE_OUT is set:
 *
 *   PDF_BASELINE_OUT=.pdf-baseline/before npx vitest run renderBaseline
 *   …refactor…
 *   PDF_BASELINE_OUT=.pdf-baseline/after  npx vitest run renderBaseline
 *   node scripts/pdf-compare.mjs .pdf-baseline/before .pdf-baseline/after
 *
 * Writes the two fixture documents (editor path + generated path) as real
 * PDFs; the compare script rasterizes both runs and diffs pixels, which is the
 * only proof a PDF refactor changed nothing (react-pdf mismeasures invisibly —
 * see CLAUDE.md). Run before/after on the same day: the cover prints an
 * issued-today date.
 */
import { describe, it } from "vitest";
import React from "react";
import { renderToBuffer, Document, Page, Text } from "@react-pdf/renderer";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { EditorDocBody } from "./editorDoc";
import { pdfStyles as s, PdfHeader, PdfFooter } from "./common";
import {
  CaseCover,
  PatientInfoSection,
  CaseBody,
  CompanySection,
  ConfirmationBlock,
  type CaseDocData,
  type PatientDocData,
} from "./case-doc";
import { buildCaseDoc } from "@/lib/documents/buildCaseDoc";
import { DEFAULT_PDF_THEME } from "./theme";

const OUT = process.env.PDF_BASELINE_OUT;

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
  depositDisplay: "1,000 Euros",
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

describe.runIf(Boolean(OUT))("pdf render baseline", () => {
  it("writes the editor-path and generated-path fixture renders", async () => {
    mkdirSync(OUT as string, { recursive: true });

    const editorBuf = await renderToBuffer(
      <Document>
        <Page size="A4" style={s.page}>
          <EditorDocBody doc={buildCaseDoc(CASE, PATIENT, DEFAULT_PDF_THEME.company)} />
        </Page>
      </Document>
    );
    writeFileSync(join(OUT as string, "editor.pdf"), editorBuf);

    const generatedBuf = await renderToBuffer(
      <Document title="Baseline">
        <CaseCover data={CASE} patientName={PATIENT.full_name} />
        <Page size="A4" style={s.page}>
          <PdfHeader
            accent="gold"
            title={<Text style={s.docTitle}>Treatment &amp; Reservation Confirmation</Text>}
            meta="WOF  ·  Issued 01.01.2026  ·  Ref PROTO-1"
          />
          <PatientInfoSection patient={PATIENT} number={1} />
          <CaseBody data={CASE} imageUrls={{}} />
          <CompanySection patient={PATIENT} number={8} />
          <ConfirmationBlock />
          <PdfFooter />
        </Page>
      </Document>
    );
    writeFileSync(join(OUT as string, "generated.pdf"), generatedBuf);
  });
});
