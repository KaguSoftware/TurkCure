import { NextResponse } from "next/server";
import React from "react";
import { Document, Page, Text } from "@react-pdf/renderer";
import { createClient, getProfile } from "@/lib/supabase/server";
import { getOrganization } from "@/lib/data/org";
import { fmtDate, PdfHeader, PdfFooter, makePdfCtx, renderThemedPdf, withSafeLogo } from "@/lib/pdf/common";
import { orgToPdfTheme, DEFAULT_PDF_THEME } from "@/lib/pdf/theme";
import { loadCaseData, pdfFilenameHeaders, CoverPage } from "@/lib/pdf/case-doc";
import { EditorDocBody, findCoverAttrs } from "@/lib/pdf/editorDoc";
import { buildCaseDoc } from "@/lib/documents/buildCaseDoc";
import { getCaseDocument } from "@/lib/actions/case-documents";
import type { CoverBlockAttrs, EditorDocJSON } from "@/lib/documents/blocks";

export const runtime = "nodejs";

/**
 * Renders a case's EDITED document.
 *
 * GET uses the stored draft, falling back to a freshly seeded document so the
 * route works for a case nobody has edited — which also makes it directly
 * comparable to `/api/pdf/<caseId>`, the check that proves the mapper and the
 * generated template stay in step.
 *
 * POST renders document JSON supplied in the body instead. That is what backs
 * the editor's preview: the fonts are registered from the filesystem in
 * common.tsx (node:fs), so react-pdf cannot run in the browser at all. Sending
 * the JSON to the server means the preview IS the download, byte for byte,
 * rather than a client-side approximation of it.
 */
export async function POST(request: Request, { params }: { params: Promise<{ caseId: string }> }) {
  const body = await request.json().catch(() => null);
  const doc = (body as { doc?: EditorDocJSON } | null)?.doc;
  if (!doc || typeof doc !== "object" || !Array.isArray((doc as EditorDocJSON).content)) {
    return new NextResponse("Invalid document", { status: 400 });
  }
  return render(await params, doc);
}

export async function GET(_request: Request, { params }: { params: Promise<{ caseId: string }> }) {
  return render(await params, null);
}

async function render({ caseId }: { caseId: string }, override: EditorDocJSON | null) {
  const profile = await getProfile();
  if (!profile || !profile.active) return new NextResponse("Unauthorized", { status: 401 });

  const supabase = await createClient();

  const [loaded, org] = await Promise.all([
    loadCaseData(supabase, caseId),
    getOrganization(profile.org_id),
  ]);
  // Route handlers bypass the app layout's suspension redirect — enforce the
  // org lockout here too.
  if (org && !org.active) return new NextResponse("Unauthorized", { status: 401 });
  if (!loaded) return new NextResponse("Not found", { status: 404 });
  const { case: caseData, patient, imageUrls } = loaded;

  const ctx = makePdfCtx(await withSafeLogo(org ? orgToPdfTheme(org) : DEFAULT_PDF_THEME));
  const s = ctx.styles;

  // An explicit document (the editor's live preview) wins; then a stored draft;
  // then a fresh seed.
  const stored = override ? null : await getCaseDocument(caseId);
  const doc =
    override ??
    (stored?.content as EditorDocJSON | undefined) ??
    buildCaseDoc(caseData, patient, ctx.theme.company);

  // Instruction images are signed URLs that expire, so they are never stored in
  // the document — they are re-attached at render time from the live case.
  const withImages = rehydrateInstructionImages(doc, caseData, imageUrls);

  const cover = (findCoverAttrs(withImages) ?? {}) as Partial<CoverBlockAttrs>;
  const issued = fmtDate(new Date().toISOString());

  const pdf = (
    <Document title={`${org?.name ?? "TurkCure"} — ${patient.full_name}`}>
      <CoverPage
        title={cover.title ?? "Treatment & Reservation"}
        titleAccent={cover.titleAccent ?? "Confirmation"}
        tagline={cover.tagline ?? ctx.theme.company.tagline}
        preparedForLabel={cover.preparedForLabel ?? "Prepared for"}
        patientName={cover.patientName ?? patient.full_name}
        treatments={cover.treatments ?? []}
        line1={cover.line1 ?? ""}
        line2={cover.line2 ?? ""}
        footer={cover.footer ?? ""}
      />

      <Page size="A4" style={s.page}>
        <PdfHeader
          accent="gold"
          title={<Text style={s.docTitle}>Treatment &amp; Reservation Confirmation</Text>}
          meta={`WOF  ·  Issued ${issued}  ·  Ref ${caseData.ref}`}
        />
        <EditorDocBody doc={withImages} />
        <PdfFooter />
      </Page>
    </Document>
  );

  try {
    const buffer = await renderThemedPdf(ctx, pdf);
    return new NextResponse(new Uint8Array(buffer), {
      headers: pdfFilenameHeaders(patient.full_name),
    });
  } catch (e) {
    console.error("Draft PDF render failed", e);
    return new NextResponse("Failed to generate PDF", { status: 500 });
  }
}

/** Re-attaches freshly signed instruction image URLs, matched by title. */
function rehydrateInstructionImages(
  doc: EditorDocJSON,
  caseData: Awaited<ReturnType<typeof loadCaseData>> extends infer T
    ? T extends { case: infer C }
      ? C
      : never
    : never,
  imageUrls: Record<string, string>
): EditorDocJSON {
  const byTitle = new Map(
    caseData.instructions.map((i) => [
      i.title,
      i.image_paths.map((p) => imageUrls[p]).filter(Boolean),
    ])
  );
  return {
    ...doc,
    content: (doc.content ?? []).map((node) => {
      if (node.type !== "instructionBlock") return node;
      const title = String((node.attrs as { title?: string } | undefined)?.title ?? "");
      const urls = byTitle.get(title);
      return urls?.length ? { ...node, attrs: { ...node.attrs, imageUrls: urls } } : node;
    }),
  };
}
