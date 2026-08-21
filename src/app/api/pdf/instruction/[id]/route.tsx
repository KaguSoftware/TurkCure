import { NextResponse } from "next/server";
import React from "react";
import { Document, Page, Text, View, Image } from "@react-pdf/renderer";
import { createClient, getProfile } from "@/lib/supabase/server";
import { getOrganization } from "@/lib/data/org";
import { PdfHeader, PdfFooter, makePdfCtx, renderThemedPdf, withSafeLogo } from "@/lib/pdf/common";
import { orgToPdfTheme, DEFAULT_PDF_THEME } from "@/lib/pdf/theme";
import { PdfMarkdown } from "@/lib/pdf/markdown";
import { slugify } from "@/lib/utils";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const profile = await getProfile();
  if (!profile || !profile.active) return new NextResponse("Unauthorized", { status: 401 });

  const { id } = await params;
  const supabase = await createClient();

  const [{ data: ins }, org] = await Promise.all([
    supabase
      .from("case_instructions")
      .select("title, body_md, image_paths, cases(patients(full_name))")
      .eq("id", id)
      .single(),
    getOrganization(profile.org_id),
  ]);
  if (!ins) return new NextResponse("Not found", { status: 404 });

  const patientName =
    (ins.cases as unknown as { patients: { full_name: string } | null } | null)?.patients
      ?.full_name ?? "";

  // Route handlers bypass the app layout's suspension redirect — enforce the
  // org lockout here too.
  if (org && !org.active) return new NextResponse("Unauthorized", { status: 401 });

  const paths: string[] = ins.image_paths ?? [];
  const imageUrls: string[] = [];
  if (paths.length > 0) {
    const { data: signed, error: signErr } = await supabase.storage
      .from("patient-files")
      .createSignedUrls(paths, 600);
    // A failed signing pass would silently render the PDF with no images — fail
    // loudly instead so the operator retries rather than sending an empty doc.
    if (signErr) {
      console.error("Instruction PDF image signing failed", id, signErr);
      return new NextResponse("Could not load the instruction's images", { status: 502 });
    }
    (signed ?? []).forEach((entry) => {
      if (entry.signedUrl) imageUrls.push(entry.signedUrl);
    });
  }

  const ctx = makePdfCtx(await withSafeLogo(org ? orgToPdfTheme(org) : DEFAULT_PDF_THEME));
  const s = ctx.styles;

  const doc = (
    <Document title={`${org?.name ?? "TurkCure"} — ${ins.title}`}>
      <Page size="A4" style={s.page}>
        <PdfHeader
          title={<Text style={s.docTitle}>{ins.title ?? ""}</Text>}
          meta={patientName ? `Prepared for ${patientName}` : undefined}
        />

        <PdfMarkdown md={ins.body_md ?? ""} />

        {imageUrls.length > 0 && (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 12 }}>
            {imageUrls.map((url, k) => (
              // eslint-disable-next-line jsx-a11y/alt-text
              <Image key={k} src={url} style={{ width: 220, marginBottom: 8 }} />
            ))}
          </View>
        )}

        <PdfFooter />
      </Page>
    </Document>
  );

  let buffer: Buffer;
  try {
    buffer = await renderThemedPdf(ctx, doc);
  } catch (err) {
    console.error("PDF render failed for instruction", id, err);
    return new NextResponse("Failed to generate PDF", { status: 500 });
  }
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${slugify(org?.name ?? "turkcure")}-instructions.pdf"`,
    },
  });
}
