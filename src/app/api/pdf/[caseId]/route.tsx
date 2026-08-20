import { NextResponse } from "next/server";
import React from "react";
import { Document, Page, Text } from "@react-pdf/renderer";
import { createClient, getProfile } from "@/lib/supabase/server";
import { getOrganization } from "@/lib/data/org";
import { fmtDate, PdfHeader, PdfFooter, makePdfCtx, renderThemedPdf } from "@/lib/pdf/common";
import { orgToPdfTheme, DEFAULT_PDF_THEME } from "@/lib/pdf/theme";
import {
  loadCaseData,
  pdfFilenameHeaders,
  CaseCover,
  PatientInfoSection,
  CaseBody,
  CompanySection,
  ConfirmationBlock,
} from "@/lib/pdf/case-doc";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ caseId: string }> }) {
  const profile = await getProfile();
  if (!profile || !profile.active) return new NextResponse("Unauthorized", { status: 401 });

  const { caseId } = await params;
  const supabase = await createClient();

  const [loaded, org] = await Promise.all([
    loadCaseData(supabase, caseId),
    getOrganization(profile.org_id),
  ]);
  if (!loaded) return new NextResponse("Not found", { status: 404 });
  const { case: caseData, patient, imageUrls } = loaded;

  const ctx = makePdfCtx(org ? orgToPdfTheme(org) : DEFAULT_PDF_THEME);
  const s = ctx.styles;

  const issued = fmtDate(new Date().toISOString());
  // Company follows the case body, so it lands after Additional Costs when the
  // case has any and takes its slot when it doesn't.
  const companyNumber = caseData.additionalCosts.length > 0 ? 8 : 7;

  const doc = (
    <Document title={`${org?.name ?? "TurkCure"} — ${patient.full_name}`}>
      <CaseCover data={caseData} patientName={patient.full_name} />

      <Page size="A4" style={s.page}>
        <PdfHeader
          accent="gold"
          title={<Text style={s.docTitle}>Treatment &amp; Reservation Confirmation</Text>}
          meta={`WOF  ·  Issued ${issued}  ·  Ref ${caseData.ref}`}
        />

        <PatientInfoSection patient={patient} number={1} />
        <CaseBody data={caseData} imageUrls={imageUrls} />
        <CompanySection patient={patient} number={companyNumber} />
        <ConfirmationBlock />

        <PdfFooter />
      </Page>
    </Document>
  );

  try {
    const buffer = await renderThemedPdf(ctx, doc);
    return new NextResponse(new Uint8Array(buffer), {
      headers: pdfFilenameHeaders(patient.full_name),
    });
  } catch (e) {
    console.error("Case PDF render failed", e);
    return new NextResponse("Failed to generate PDF", { status: 500 });
  }
}
