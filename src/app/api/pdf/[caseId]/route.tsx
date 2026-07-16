import { NextResponse } from "next/server";
import React from "react";
import { renderToBuffer, Document, Page, Text, View, Image } from "@react-pdf/renderer";
import { createClient, getProfile } from "@/lib/supabase/server";
import {
  COMPANY,
  MUTED,
  INK,
  TEXT,
  NAVY,
  GOLD,
  GOLD_LIGHT,
  GOLD_DARK,
  GOLD_SOFT_BG,
  TABLE_LINE,
  SANS,
  SERIF,
  pdfStyles as s,
  fmtDate,
  fmtGender,
  nightsBetween,
  PdfHeader,
  PdfFooter,
  TableSection,
  TRow,
  WordmarkGold,
  CoverOrnament,
} from "@/lib/pdf/common";
import { PdfMarkdown } from "@/lib/pdf/markdown";

export const runtime = "nodejs";

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

  // Only count deposits in the same currency as the quote — summing across
  // currencies (e.g. ₺ into a € total) would print a wrong balance on this
  // customer-facing document.
  const { data: paidIn } = await supabase
    .from("payments")
    .select("amount")
    .eq("case_id", caseId)
    .eq("direction", "in")
    .eq("status", "paid")
    .eq("currency", caseRow.currency);
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

  // The hotel is booked for the whole stay (arrival → departure). Any nights the
  // patient spends in hospital overlap this window; they are reported separately
  // in the Hospital section, not deducted from the hotel booking.
  const totalNights = nightsBetween(caseRow.arrival_date, caseRow.departure_date);
  const hospitalNights = nightsBetween(caseRow.hospital_checkin, caseRow.hospital_checkout);

  const packageBullets = [
    doctor ? `Doctor consultation : ${doctor}` : "Doctor consultation",
    "Surgical procedure",
    "Hospital operating room costs",
    ...(hospitalNights ? [`${hospitalNights} night hospital accommodation`] : []),
    ...(totalNights ? [`${totalNights} nights hotel accommodation`] : []),
    ...(items ?? []).map((i) => i.description).filter((d): d is string => Boolean(d)),
    "English speaking medical translator",
    "VIP Airport – Hotel – Hospital transfers",
  ];

  const ref = caseId.slice(0, 8).toUpperCase();
  const issued = fmtDate(new Date().toISOString());
  const coverLine1 = [doctor, hospital].filter(Boolean).join("   ·   ");
  const coverLine2 =
    caseRow.arrival_date && caseRow.departure_date
      ? `${fmtDate(caseRow.arrival_date)}  —  ${fmtDate(caseRow.departure_date)}`
      : "";

  const doc = (
    <Document title={`TurkCure WOF — ${patient?.full_name ?? "Patient"}`}>
      {/* Cover page — navy, gold frame, all content in normal flow */}
      <Page size="A4" style={{ backgroundColor: NAVY, padding: 28, fontFamily: SANS }}>
        <View
          style={{
            flex: 1,
            borderWidth: 1,
            borderColor: GOLD,
            alignItems: "center",
            paddingVertical: 64,
            paddingHorizontal: 48,
          }}
        >
          {/* Brand */}
          <WordmarkGold scale={1.7} />
          <Text
            style={{
              fontSize: 8.5,
              color: GOLD_LIGHT,
              letterSpacing: 3.5,
              marginTop: 10,
              textTransform: "uppercase",
            }}
          >
            Health Tourism · Istanbul
          </Text>

          <View style={{ flex: 1 }} />

          {/* Title */}
          <Text
            style={{
              fontSize: 30,
              color: "#ffffff",
              fontFamily: SERIF,
              fontWeight: 700,
              textAlign: "center",
            }}
          >
            Treatment & Reservation
          </Text>
          <Text
            style={{
              fontSize: 30,
              color: GOLD,
              fontFamily: SERIF,
              fontWeight: 700,
              textAlign: "center",
              marginTop: 6,
            }}
          >
            Confirmation
          </Text>
          <View style={{ marginTop: 24 }}>
            <CoverOrnament width={210} />
          </View>

          {/* Patient */}
          <Text
            style={{
              fontSize: 9,
              color: GOLD,
              letterSpacing: 3,
              textTransform: "uppercase",
              marginTop: 44,
            }}
          >
            Prepared for
          </Text>
          <Text
            style={{
              fontSize: 26,
              color: "#ffffff",
              fontFamily: SERIF,
              fontWeight: 700,
              marginTop: 10,
              textAlign: "center",
            }}
          >
            {patient?.full_name ?? "Patient"}
          </Text>
          {op ? (
            <Text
              style={{
                fontSize: 13,
                color: GOLD_LIGHT,
                fontFamily: SERIF,
                fontStyle: "italic",
                marginTop: 8,
                textAlign: "center",
              }}
            >
              {op}
            </Text>
          ) : null}

          <View style={{ flex: 1 }} />

          {/* Basic facts */}
          {coverLine1 ? (
            <Text style={{ fontSize: 9.5, color: "#e8ecf5", letterSpacing: 0.5, textAlign: "center" }}>
              {coverLine1}
            </Text>
          ) : null}
          {coverLine2 ? (
            <Text
              style={{
                fontSize: 9.5,
                color: GOLD_LIGHT,
                letterSpacing: 0.8,
                marginTop: 6,
                textAlign: "center",
              }}
            >
              {coverLine2}
            </Text>
          ) : null}

          <View style={{ marginVertical: 22, width: 26, height: 1, backgroundColor: GOLD }} />

          <Text style={{ fontSize: 8, color: GOLD_LIGHT, letterSpacing: 1.2, opacity: 0.9 }}>
            Ref {ref}   ·   Issued {issued}   ·   turkcure.com
          </Text>
        </View>
      </Page>

      <Page size="A4" style={s.page}>
        <PdfHeader
          accent="gold"
          title={<Text style={s.docTitle}>Treatment & Reservation Confirmation</Text>}
          meta={`WOF  ·  Issued ${issued}  ·  Ref ${ref}`}
        />

        <TableSection number={1} title="Patient Information" wrap={false}>
          <TRow label="Full name" value={patient?.full_name} />
          <TRow label="Date of birth" value={fmtDate(patient?.date_of_birth)} />
          <TRow label="Gender" value={fmtGender(patient?.gender)} />
          <TRow label="Passport number" value={patient?.passport_number} />
          <TRow label="Country" value={patient?.countries?.name} />
          <TRow label="Phone / WhatsApp" value={patient?.phone} />
          <TRow label="E-mail" value={patient?.email} last />
        </TableSection>

        <TableSection number={2} title="Travel Information" wrap={false}>
          <TRow label="Arrival date" value={fmtDate(caseRow.arrival_date)} />
          <TRow label="Departure date" value={fmtDate(caseRow.departure_date)} />
          <TRow label="Airport" value={caseRow.airport} />
          <TRow label="Airport pickup" value={caseRow.airport_pickup} last />
        </TableSection>

        {/* Hotel is booked for the whole stay (arrival → departure) */}
        <TableSection number={3} title="Hotel Information" wrap={false}>
          <TRow label="Hotel name" value={hotel} />
          <TRow label="Check-in date" value={fmtDate(caseRow.arrival_date)} />
          <TRow label="Check-out date" value={fmtDate(caseRow.departure_date)} />
          <TRow label="Total nights" value={totalNights ? `${totalNights} nights` : null} last />
        </TableSection>

        <TableSection number={4} title="Hospital Information" wrap={false}>
          <TRow label="Hospital name" value={hospital} />
          <TRow label="Operation date" value={fmtDate(caseRow.surgery_date)} />
          <TRow
            label="Hospital stay"
            value={
              hospitalNights
                ? `${hospitalNights} night${hospitalNights > 1 ? "s" : ""} accommodation included`
                : null
            }
            last
          />
        </TableSection>

        <TableSection number={5} title="Package Details" wrap={false}>
          <View style={{ paddingVertical: 12, paddingHorizontal: 14 }}>
            <Text style={{ fontWeight: 700, color: INK, marginBottom: 8, fontSize: 10.5 }}>
              Procedure: {op || "Treatment package"}
            </Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
              {packageBullets.map((b, i) => (
                <View
                  key={i}
                  style={{ flexDirection: "row", width: "50%", paddingVertical: 3, paddingRight: 12 }}
                >
                  <Text style={{ color: GOLD, marginRight: 6 }}>•</Text>
                  <Text style={{ flex: 1, color: TEXT }}>{b}</Text>
                </View>
              ))}
            </View>
          </View>
        </TableSection>

        <TableSection number={6} title="Payment Information" wrap={false}>
          <TRow label="Total package price" value={money(total)} />
          <TRow label="Deposit paid" value={money(deposit)} />
          <View style={[s.tRowLast, { backgroundColor: GOLD_SOFT_BG }]}>
            <Text style={[s.tLabel, { backgroundColor: "transparent", color: GOLD_DARK }]}>
              Remaining balance
            </Text>
            <Text style={[s.tValue, { fontSize: 12, fontWeight: 700, color: NAVY }]}>
              {money(Math.max(total - deposit, 0))}
            </Text>
          </View>
        </TableSection>
        <Text style={{ fontSize: 8.5, marginTop: -12, marginBottom: 20, color: MUTED }}>
          Payment method: Cash / Bank Transfer / Card. Remaining balance is to be paid upon arrival
          in Istanbul before the procedure.
        </Text>

        {/* Instructions */}
        {(instructions ?? []).map((ins, idx) => (
          <View key={idx}>
            <Text style={s.instrHeading} minPresenceAhead={40}>
              {ins.title ?? ""}
            </Text>
            <PdfMarkdown md={ins.body_md ?? ""} scale={0.95} />
            {(ins.image_paths ?? []).filter((p: string) => imageUrls[p]).length > 0 && (
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 6 }} wrap={false}>
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
        <View style={{ marginTop: 20 }}>
          <TableSection number={7} title={COMPANY.name} wrap={false}>
            <TRow label="Patient coordinator" value={coordinator} />
            <TRow label="WhatsApp" value={COMPANY.whatsapp} />
            <TRow label="Website" value={COMPANY.website} />
            <TRow label="Location" value={COMPANY.location} last />
          </TableSection>
        </View>

        {/* Confirmation + two-column signature block */}
        <View wrap={false} style={{ marginTop: 4 }}>
          <Text style={s.instrHeading}>Confirmation</Text>
          <Text style={{ marginBottom: 26, lineHeight: 1.5, color: TEXT }}>
            By confirming this document, the patient acknowledges the reservation and treatment plan
            organized by Turkcure.
          </Text>
          <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 34 }}>
            <View style={{ flex: 1 }}>
              <View style={{ borderTopWidth: 1, borderTopColor: TABLE_LINE, marginBottom: 5 }} />
              <Text style={{ color: MUTED, fontSize: 8.5 }}>Patient Signature</Text>
            </View>
            <View style={{ flex: 1 }}>
              <View style={{ borderTopWidth: 1, borderTopColor: TABLE_LINE, marginBottom: 5 }} />
              <Text style={{ color: MUTED, fontSize: 8.5 }}>Date</Text>
            </View>
          </View>
        </View>

        <PdfFooter />
      </Page>
    </Document>
  );

  // HTTP headers are Latin-1 only, so the filename must be ASCII — a curly
  // apostrophe or any accented character in the patient's name would throw a
  // ByteString conversion error. Strip everything that isn't a safe ASCII char.
  const slug =
    (patient?.full_name ?? "patient")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "patient";

  const buffer = await renderToBuffer(doc);
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="turkcure-wof-${slug}.pdf"`,
    },
  });
}
