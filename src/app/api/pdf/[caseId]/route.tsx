import { NextResponse } from "next/server";
import React from "react";
import { renderToBuffer, Document, Page, Text, View, Image } from "@react-pdf/renderer";
import { createClient, getProfile } from "@/lib/supabase/server";
import {
  BLUE,
  GREEN,
  MUTED,
  COMPANY,
  pdfStyles as s,
  mdLines,
  fmtDate,
  nightsBetween,
} from "@/lib/pdf/common";

export const runtime = "nodejs";

function Row({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <View style={last ? s.rowLast : s.row}>
      <Text style={s.cellLabel}>{label}</Text>
      <Text style={s.cellValue}>{value || " "}</Text>
    </View>
  );
}

export async function GET(_request: Request, { params }: { params: Promise<{ caseId: string }> }) {
  const profile = await getProfile();
  if (!profile || !profile.active) return new NextResponse("Unauthorized", { status: 401 });

  const { caseId } = await params;
  const supabase = await createClient();

  const { data: caseRow } = await supabase
    .from("cases")
    .select(
      "*, patients(full_name, email, phone, date_of_birth, gender, passport_number, assigned_agent_id, countries(name)), operation_types(name), doctors(name), hospitals(name, city), hotels(name, city)"
    )
    .eq("id", caseId)
    .single();
  if (!caseRow) return new NextResponse("Not found", { status: 404 });

  // Patient-facing: price only. The cost column is never selected here.
  const { data: items } = await supabase
    .from("quote_items_public")
    .select("kind, description, price, sort_order")
    .eq("case_id", caseId)
    .order("sort_order");

  const { data: paidIn } = await supabase
    .from("payments")
    .select("amount")
    .eq("case_id", caseId)
    .eq("direction", "in")
    .eq("status", "paid");
  const deposit = (paidIn ?? []).reduce((sum, p) => sum + Number(p.amount), 0);

  const { data: instructions } = await supabase
    .from("case_instructions")
    .select("title, body_md, image_paths")
    .eq("case_id", caseId)
    .order("created_at");

  // Signed URLs for instruction images so react-pdf can embed them
  const allImagePaths = (instructions ?? []).flatMap((i) => i.image_paths ?? []);
  const imageUrls: Record<string, string> = {};
  if (allImagePaths.length > 0) {
    const { data: signed } = await supabase.storage
      .from("patient-files")
      .createSignedUrls(allImagePaths, 600);
    (signed ?? []).forEach((entry, i) => {
      if (entry.signedUrl) imageUrls[allImagePaths[i]] = entry.signedUrl;
    });
  }

  const patient = caseRow.patients as {
    full_name: string;
    email: string;
    phone: string;
    date_of_birth: string | null;
    gender: string;
    passport_number: string;
    assigned_agent_id: string | null;
    countries: { name: string } | null;
  } | null;

  let coordinator = "";
  if (patient?.assigned_agent_id) {
    const { data: agent } = await supabase
      .from("profiles")
      .select("name")
      .eq("id", patient.assigned_agent_id)
      .single();
    coordinator = agent?.name ?? "";
  }

  const op = (caseRow.operation_types as { name: string } | null)?.name ?? "";
  const doctor = (caseRow.doctors as { name: string } | null)?.name ?? "";
  const hospital = (caseRow.hospitals as { name: string } | null)?.name ?? "";
  const hotel = (caseRow.hotels as { name: string } | null)?.name ?? "";
  const total = (items ?? []).reduce((sum, i) => sum + Number(i.price), 0);
  const currency = caseRow.currency === "EUR" ? "Euros" : (caseRow.currency as string);
  const money = (n: number) => `${n.toLocaleString("en-US")} ${currency}`;

  const hotelNights = nightsBetween(caseRow.hospital_checkout ?? caseRow.arrival_date, caseRow.departure_date);
  const totalNights = nightsBetween(caseRow.arrival_date, caseRow.departure_date);
  const hospitalNights = nightsBetween(caseRow.hospital_checkin, caseRow.hospital_checkout);

  const packageBullets = [
    doctor ? `Doctor consultation : ${doctor}` : "Doctor consultation",
    "Surgical procedure",
    "Hospital operating room costs",
    ...(hospitalNights ? [`${hospitalNights} night hospital accommodation`] : []),
    ...(hotelNights ? [`${hotelNights} nights hotel accommodation`] : []),
    ...(items ?? []).map((i) => i.description),
    "English speaking medical translator",
    "VIP Airport – Hotel – Hospital transfers",
  ];

  const doc = (
    <Document title={`TurkCure WOF — ${patient?.full_name ?? "Patient"}`}>
      <Page size="A4" style={s.page}>
        {/* Header */}
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 14,
          }}
        >
          <View>
            <Text style={[s.brand, { color: BLUE }]}>Turk</Text>
            <Text style={[s.brand, { color: GREEN }]}>Cure</Text>
          </View>
          <View>
            <Text style={s.docTitle}>Treatment & Reservation</Text>
            <Text style={s.docTitle}>Confirmation (WOF)</Text>
          </View>
        </View>

        <View style={[s.table, { borderBottomWidth: 0 }]}>
          <View style={s.row}>
            <Text style={s.cellLabel}>Date</Text>
            <Text style={[s.cellValue, s.bold]}>: {fmtDate(new Date().toISOString())}</Text>
          </View>
        </View>

        {/* 1. Patient */}
        <View style={s.table}>
          <Text style={s.sectionHead}>1.  Treatment & Reservation Confirmation (WOF)</Text>
          <Row label="FULL NAMES" value={patient?.full_name?.toUpperCase() ?? ""} />
          <Row label="DATE OF BIRTH" value={fmtDate(patient?.date_of_birth)} />
          <Row label="PASSPORT NUMBER" value={patient?.passport_number ?? ""} />
          <Row label="COUNTRY" value={patient?.countries?.name ?? ""} />
          <Row label="PHONE / WHATSAPP" value={patient?.phone ?? ""} />
          <Row label="E-MAIL" value={patient?.email ?? ""} />
          <View style={s.rowLast}>
            <Text style={s.cellLabel}>GENDER</Text>
            <Text style={[s.cellValue, { borderRightWidth: 1, borderRightColor: "#94a3b8" }]}>
              FEMALE {patient?.gender === "female" ? "  ✓" : ""}
            </Text>
            <Text style={s.cellValue}>MALE {patient?.gender === "male" ? "  ✓" : ""}</Text>
          </View>
        </View>

        {/* 2. Travel */}
        <View style={s.table}>
          <Text style={s.sectionHead}>2.  Travel Information</Text>
          <Row label="Arrival Date" value={fmtDate(caseRow.arrival_date)} />
          <Row label="Departure Date" value={fmtDate(caseRow.departure_date)} />
          <Row label="AIRPORT" value={caseRow.airport ?? ""} />
          <Row label="AIRPORT PICKUP" value={caseRow.airport_pickup ?? ""} last />
        </View>

        {/* 3. Hotel */}
        <View style={s.table}>
          <Text style={s.sectionHead}>3.  Hotel Information</Text>
          <Row label="Hotel Name:" value={hotel} />
          <Row label="Check-in Date:" value={fmtDate(caseRow.hospital_checkout ?? caseRow.arrival_date)} />
          <Row label="Check-out Date:" value={fmtDate(caseRow.departure_date)} />
          <Row label="Total Nights:" value={totalNights ? `${totalNights} Nights` : ""} last />
        </View>

        {/* 4. Hospital */}
        <View style={s.table}>
          <Text style={s.sectionHead}>4.  Hospital Information</Text>
          <Row label="Hospital Name:" value={hospital} />
          <Row label="Operation Date:" value={fmtDate(caseRow.surgery_date)} />
          <Row
            label="Hospital Stay:"
            value={
              hospitalNights
                ? `${hospitalNights} Night${hospitalNights > 1 ? "s" : ""} Hospital Accommodation Included`
                : ""
            }
            last
          />
        </View>

        {/* 5. Package */}
        <View style={s.table}>
          <Text style={s.sectionHead}>5.  Package Details</Text>
          <View style={{ padding: 6 }}>
            <Text style={[s.bold, { marginBottom: 5 }]}>Procedure: {op}</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
              {packageBullets.map((b, i) => (
                <Text key={i} style={s.bullet}>
                  •  {b}
                </Text>
              ))}
            </View>
          </View>
        </View>

        {/* Payment */}
        <View style={s.table}>
          <Text style={s.sectionHead}>Payment Information</Text>
          <Row label="Total Package Price:" value={money(total)} />
          <Row label="Deposit Paid:" value={money(deposit)} />
          <Row label="Remaining Balance:" value={money(Math.max(total - deposit, 0))} last />
        </View>

        <View style={s.table}>
          <Text style={s.sectionHead}>Payment Method:</Text>
          <View style={s.rowLast}>
            <Text style={[s.cellValue, s.bold]}>Cash / Bank Transfer / Card</Text>
          </View>
        </View>

        <Text style={{ fontSize: 11, marginTop: 4, marginBottom: 12 }}>
          Remaining balance is to be paid upon arrival in Istanbul before the procedure.
        </Text>

        {/* Instructions */}
        {(instructions ?? []).map((ins, idx) => (
          <View key={idx}>
            <Text style={s.instrHeading}>{ins.title}</Text>
            {mdLines(ins.body_md).map((line, j) =>
              line.heading ? (
                <Text key={j} style={[s.bold, { marginTop: 5, marginBottom: 2, fontSize: 9.5 }]}>
                  {line.text}
                </Text>
              ) : (
                <Text key={j} style={[s.instrLine, { marginLeft: line.bullet ? 8 : 0 }]}>
                  {line.bullet ? "•  " : ""}
                  {line.text}
                </Text>
              )
            )}
            {(ins.image_paths ?? []).filter((p: string) => imageUrls[p]).length > 0 && (
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 6 }}>
                {(ins.image_paths ?? [])
                  .filter((p: string) => imageUrls[p])
                  .map((p: string, k: number) => (
                    // eslint-disable-next-line jsx-a11y/alt-text
                    <Image key={k} src={imageUrls[p]} style={{ width: 150, marginBottom: 6 }} />
                  ))}
              </View>
            )}
          </View>
        ))}

        {/* Company */}
        <View style={[s.table, { marginTop: 12 }]} wrap={false}>
          <Text style={s.sectionHead}>{COMPANY.name}</Text>
          <Row label="Patient Coordinator:" value={coordinator} />
          <Row label="WhatsApp:" value={COMPANY.whatsapp} />
          <Row label="Website:" value={COMPANY.website} />
          <Row label="Location:" value={COMPANY.location} last />
        </View>

        {/* Confirmation */}
        <View wrap={false}>
          <Text style={s.instrHeading}>Confirmation</Text>
          <Text style={{ marginBottom: 10, lineHeight: 1.4 }}>
            By confirming this document, the patient acknowledges the reservation and treatment plan
            organized by Turkcure.
          </Text>
          <Text style={{ marginBottom: 14 }}>Patient Signature:</Text>
          <Text>Date:</Text>
        </View>

        <View style={s.footer} fixed>
          <Text style={s.bold}>
            Adres: <Text style={{ color: MUTED, fontFamily: "Helvetica" }}>{COMPANY.address}</Text>
          </Text>
          <Text style={{ color: BLUE, marginTop: 2 }}>{COMPANY.url}</Text>
        </View>
      </Page>
    </Document>
  );

  const buffer = await renderToBuffer(doc);
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="turkcure-wof-${(patient?.full_name ?? "patient")
        .toLowerCase()
        .replace(/\s+/g, "-")}.pdf"`,
    },
  });
}
