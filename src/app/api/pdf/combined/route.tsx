import { NextResponse } from "next/server";
import React from "react";
import { renderToBuffer, Document, Page, Text, View } from "@react-pdf/renderer";
import { createClient, getProfile } from "@/lib/supabase/server";
import { pdfStyles as s, fmtDate, PdfHeader, PdfFooter } from "@/lib/pdf/common";
import {
  loadCasesData,
  pdfFilenameHeaders,
  CaseCover,
  PatientInfoSection,
  CaseBody,
  CompanySection,
  ConfirmationBlock,
} from "@/lib/pdf/case-doc";

export const runtime = "nodejs";

/** Renders slowly and is operator-triggered; cap it so a hand-edited URL can't tie up the renderer. */
const MAX_CASES = 20;

/**
 * Several of one patient's cases in a single document: a cover per case, then
 * one flowing body where the patient-level material (identity, company,
 * confirmation) is stated once and each case contributes its own numbered
 * sections (2.1, 3.1, …).
 *
 * A GET with a comma-separated `cases` param, so the download stays a plain
 * <a download> like the single-case route — no blob plumbing on the client.
 */
export async function GET(request: Request) {
  const profile = await getProfile();
  if (!profile || !profile.active) return new NextResponse("Unauthorized", { status: 401 });

  const raw = new URL(request.url).searchParams.get("cases") ?? "";
  // Dedupe: a repeated id would otherwise render the same case twice.
  const caseIds = [...new Set(raw.split(",").map((v) => v.trim()).filter(Boolean))];
  if (caseIds.length === 0) return new NextResponse("No cases selected", { status: 400 });
  if (caseIds.length > MAX_CASES)
    return new NextResponse(`Select at most ${MAX_CASES} cases`, { status: 400 });

  const supabase = await createClient();
  // Returns null if any id is missing or the ids span more than one patient —
  // RLS gates access, but this is what stops a hand-crafted URL splicing two
  // patients' cases under a single "Prepared for" name.
  const loaded = await loadCasesData(supabase, caseIds);
  if (!loaded) return new NextResponse("Not found", { status: 404 });
  const { cases, patient, imageUrls } = loaded;

  const issued = fmtDate(new Date().toISOString());

  const doc = (
    <Document title={`TurkCure WOF — ${patient.full_name}`}>
      {cases.map((c) => (
        <CaseCover key={c.caseId} data={c} patientName={patient.full_name} />
      ))}

      <Page size="A4" style={s.page}>
        <PdfHeader
          accent="gold"
          title={<Text style={s.docTitle}>Treatment &amp; Reservation Confirmation</Text>}
          meta={`WOF  ·  Issued ${issued}  ·  ${cases.length} cases`}
        />

        <PatientInfoSection patient={patient} number={1} />

        {cases.map((c, i) => (
          <View key={c.caseId}>
            {/* Names the case a body section belongs to, mapping it back to its cover. */}
            <Text style={s.instrHeading} minPresenceAhead={60}>
              {[c.op || "Treatment", c.arrival_date ? fmtDate(c.arrival_date) : null]
                .filter(Boolean)
                .join(" — ")}
            </Text>
            <CaseBody data={c} imageUrls={imageUrls} sectionPrefix={i + 2} />
          </View>
        ))}

        <CompanySection patient={patient} number={cases.length + 2} />
        <ConfirmationBlock />

        <PdfFooter />
      </Page>
    </Document>
  );

  try {
    const buffer = await renderToBuffer(doc);
    return new NextResponse(new Uint8Array(buffer), {
      headers: pdfFilenameHeaders(patient.full_name),
    });
  } catch (e) {
    console.error("Combined PDF render failed", e);
    return new NextResponse("Failed to generate PDF", { status: 500 });
  }
}
