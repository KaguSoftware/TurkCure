import { NextResponse } from "next/server";
import React from "react";
import { renderToBuffer, Document, Page, Text, View, Image } from "@react-pdf/renderer";
import { createClient, getProfile } from "@/lib/supabase/server";
import { pdfStyles as s, PdfHeader, PdfFooter } from "@/lib/pdf/common";
import { PdfMarkdown } from "@/lib/pdf/markdown";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const profile = await getProfile();
  if (!profile || !profile.active) return new NextResponse("Unauthorized", { status: 401 });

  const { id } = await params;
  const supabase = await createClient();

  const { data: ins } = await supabase
    .from("case_instructions")
    .select("title, body_md, image_paths, cases(patients(full_name))")
    .eq("id", id)
    .single();
  if (!ins) return new NextResponse("Not found", { status: 404 });

  const patientName =
    (ins.cases as unknown as { patients: { full_name: string } | null } | null)?.patients
      ?.full_name ?? "";

  const paths: string[] = ins.image_paths ?? [];
  const imageUrls: string[] = [];
  if (paths.length > 0) {
    const { data: signed } = await supabase.storage
      .from("patient-files")
      .createSignedUrls(paths, 600);
    (signed ?? []).forEach((entry) => {
      if (entry.signedUrl) imageUrls.push(entry.signedUrl);
    });
  }

  const doc = (
    <Document title={`TurkCure — ${ins.title}`}>
      <Page size="A4" style={s.page}>
        <PdfHeader
          title={<Text style={s.docTitle}>{ins.title}</Text>}
          meta={patientName ? `Prepared for ${patientName}` : undefined}
        />

        <PdfMarkdown md={ins.body_md} />

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

  const buffer = await renderToBuffer(doc);
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="turkcure-instructions.pdf"`,
    },
  });
}
