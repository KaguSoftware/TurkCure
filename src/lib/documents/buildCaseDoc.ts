// Builds the initial editable document (Tiptap JSON) from a case.
//
// Mirrors the section order and copy of the generated PDF (`CaseBody` in
// src/lib/pdf/case-doc.tsx) exactly, so an untouched draft renders identically
// to the document staff already know. Free of both Tiptap and react-pdf
// imports, like blocks.ts.
//
// Every value is formatted HERE, once, and stored as a string — the editor is
// WYSIWYG, so staff see and edit the real values, never a placeholder token.

import { COMPANY } from "@/lib/pdf/company";
import type { CaseDocData, PatientDocData } from "@/lib/pdf/case-doc";
import {
  BLOCK,
  additionalCosts,
  companyCard,
  confirmationBlock,
  coverBlock,
  instructionBlock,
  packageBullets,
  paymentSummary,
  tableSection,
  type DocNode,
  type EditorDocJSON,
  type TRowItem,
} from "./blocks";

/** Matches `TRow`'s em-dash fallback for an empty value. */
const orDash = (v: string | null | undefined) => (v && String(v).trim() ? String(v) : "—");

/** dd.mm.yyyy, matching `fmtDate` in lib/pdf/common.tsx. */
function fmtDate(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()}`;
}

/** Matches `fmtGender` in lib/pdf/common.tsx. */
const fmtGender = (g: string | null | undefined) =>
  g ? g.charAt(0).toUpperCase() + g.slice(1) : "—";

/**
 * Seeds the editable document for one case.
 *
 * Section numbering is computed in a single running counter rather than
 * hardcoded: Additional Costs is omitted when empty, which shifts the company
 * block from 7 to 8. Doing it in one place is what stops the two from drifting.
 */
export function buildCaseDoc(data: CaseDocData, patient: PatientDocData): EditorDocJSON {
  const money = (v: number) => `${v.toLocaleString("en-US")} ${data.currency}`;
  const issued = fmtDate(new Date().toISOString());

  let section = 0;
  const n = () => String(++section);

  const content: DocNode[] = [];

  content.push(
    coverBlock({
      title: "Treatment & Reservation",
      titleAccent: "Confirmation",
      tagline: "Health Tourism · Istanbul",
      preparedForLabel: "Prepared for",
      patientName: patient.full_name,
      treatments: data.op ? [data.op] : [],
      line1: data.coverLine1,
      line2: data.coverLine2,
      footer: `Ref ${data.ref}   ·   Issued ${issued}   ·   turkcure.com`,
    })
  );

  const patientRows: TRowItem[] = [
    { label: "Full name", value: orDash(patient.full_name) },
    { label: "Date of birth", value: fmtDate(patient.date_of_birth) },
    { label: "Gender", value: fmtGender(patient.gender) },
    { label: "Passport number", value: orDash(patient.passport_number) },
    { label: "Country", value: orDash(patient.country) },
    { label: "Phone / WhatsApp", value: orDash(patient.phone) },
    { label: "E-mail", value: orDash(patient.email) },
  ];
  content.push(tableSection(n(), "Patient Information", patientRows));

  content.push(
    tableSection(n(), "Travel Information", [
      { label: "Arrival date", value: fmtDate(data.arrival_date) },
      { label: "Departure date", value: fmtDate(data.departure_date) },
      { label: "Airport", value: orDash(data.airport) },
      { label: "Airport pickup", value: orDash(data.airport_pickup) },
    ])
  );

  // The hotel is booked for the whole stay (arrival → departure); hospital
  // nights overlap it and are reported separately below, not deducted.
  content.push(
    tableSection(n(), "Hotel Information", [
      { label: "Hotel name", value: orDash(data.hotel) },
      { label: "Check-in date", value: fmtDate(data.arrival_date) },
      { label: "Check-out date", value: fmtDate(data.departure_date) },
      { label: "Total nights", value: data.totalNights ? `${data.totalNights} nights` : "—" },
    ])
  );

  content.push(
    tableSection(n(), "Hospital Information", [
      { label: "Hospital name", value: orDash(data.hospital) },
      { label: "Operation date", value: fmtDate(data.surgery_date) },
      {
        label: "Hospital stay",
        value: data.hospitalNights
          ? `${data.hospitalNights} night${data.hospitalNights > 1 ? "s" : ""} accommodation included`
          : "—",
      },
    ])
  );

  content.push(
    packageBullets({
      number: n(),
      title: "Package Details",
      procedure: data.op || "Treatment package",
      bullets: data.packageBullets,
    })
  );

  content.push(
    paymentSummary({
      number: n(),
      title: "Payment Information",
      rows: [
        { label: "Total package price", value: money(data.total) },
        { label: "Deposit paid", value: money(data.deposit) },
      ],
      balanceLabel: "Remaining balance",
      balanceValue: money(Math.max(data.total - data.deposit, 0)),
      note:
        "Payment method: Cash / Bank Transfer / Card. Remaining balance is to be paid upon " +
        "arrival in Istanbul before the procedure.",
    })
  );

  // Extras quoted alongside the package but settled separately (0020). Omitted
  // entirely when empty, and never folded into the total above.
  if (data.additionalCosts.length > 0) {
    content.push(
      additionalCosts({
        number: n(),
        title: "Additional Costs",
        rows: data.additionalCosts.map((c) => ({
          title: c.title || "—",
          amount: money(c.amount),
        })),
        note:
          "Additional costs are quoted separately and are not included in the total package " +
          "price above.",
      })
    );
  }

  for (const ins of data.instructions) {
    content.push(
      instructionBlock({
        title: ins.title,
        bodyMd: ins.body_md,
        // Signed URLs are resolved by the caller and expire; the editor shows
        // them, and a re-seed refreshes them.
        imageUrls: [],
      })
    );
  }

  content.push(
    companyCard(n(), COMPANY.name, [
      { label: "Patient coordinator", value: orDash(patient.coordinator) },
      { label: "WhatsApp", value: COMPANY.whatsapp },
      { label: "Website", value: COMPANY.website },
      { label: "Location", value: COMPANY.location },
    ])
  );

  content.push(
    confirmationBlock({
      title: "Confirmation",
      body:
        "By confirming this document, the patient acknowledges the reservation and treatment " +
        "plan organized by Turkcure.",
      signers: ["Patient Signature", "Date"],
    })
  );

  return { type: BLOCK.doc, content };
}
