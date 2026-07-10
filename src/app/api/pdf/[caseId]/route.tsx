import { NextResponse } from "next/server";
import React from "react";
import {
  renderToBuffer,
  Document,
  Page,
  Text,
  View,
  Image,
  Svg,
  Rect,
  Polygon,
  Line,
} from "@react-pdf/renderer";
import { createClient, getProfile } from "@/lib/supabase/server";
import {
  COMPANY,
  BLUE_DEEP,
  MUTED,
  INK,
  TEXT,
  NAVY,
  NAVY_DEEP,
  GOLD,
  GOLD_LIGHT,
  GOLD_DARK,
  pdfStyles as s,
  mdLines,
  fmtDate,
  fmtGender,
  nightsBetween,
  PdfHeader,
  PdfFooter,
  Section,
  KV,
  WordmarkGold,
  CoverOrnament,
  Diamond,
} from "@/lib/pdf/common";

// A4 in pt
const PAGE_W = 595.28;
const PAGE_H = 841.89;

/** Full-bleed navy background with layered gold geometry for the cover page. */
function CoverBackground() {
  return (
    <View style={{ position: "absolute", top: 0, left: 0 }}>
      <Svg width={PAGE_W} height={PAGE_H} viewBox={`0 0 ${PAGE_W} ${PAGE_H}`}>
      {/* Navy base */}
      <Rect x={0} y={0} width={PAGE_W} height={PAGE_H} fill={NAVY} />

      {/* Deep-navy diagonal bands, top-right and bottom-left */}
      <Polygon points={`${PAGE_W},0 ${PAGE_W - 340},0 ${PAGE_W},260`} fill={NAVY_DEEP} />
      <Polygon points={`${PAGE_W},60 ${PAGE_W - 220},0 ${PAGE_W},0`} fill={NAVY_DEEP} fillOpacity={0.7} />
      <Polygon points={`0,${PAGE_H} 0,${PAGE_H - 300} 380,${PAGE_H}`} fill={NAVY_DEEP} />
      <Polygon points={`0,${PAGE_H} 0,${PAGE_H - 160} 210,${PAGE_H}`} fill={NAVY_DEEP} fillOpacity={0.7} />

      {/* Translucent gold bands echoing the corners */}
      <Polygon
        points={`${PAGE_W},0 ${PAGE_W - 420},0 ${PAGE_W},320`}
        fill={GOLD}
        fillOpacity={0.08}
      />
      <Polygon
        points={`0,${PAGE_H} 0,${PAGE_H - 380} 470,${PAGE_H}`}
        fill={GOLD}
        fillOpacity={0.08}
      />

      {/* Thin gold diagonal lines along band edges */}
      <Line x1={PAGE_W - 340} y1={0} x2={PAGE_W} y2={260} stroke={GOLD} strokeWidth={1} strokeOpacity={0.4} />
      <Line x1={PAGE_W - 420} y1={0} x2={PAGE_W} y2={320} stroke={GOLD} strokeWidth={0.7} strokeOpacity={0.25} />
      <Line x1={0} y1={PAGE_H - 300} x2={380} y2={PAGE_H} stroke={GOLD} strokeWidth={1} strokeOpacity={0.4} />
      <Line x1={0} y1={PAGE_H - 380} x2={470} y2={PAGE_H} stroke={GOLD} strokeWidth={0.7} strokeOpacity={0.25} />

      {/* Small gold diamond accents along the band edges */}
      {[
        { x: PAGE_W - 250, y: 68, r: 3.5, o: 0.9 },
        { x: PAGE_W - 160, y: 137, r: 2.5, o: 0.6 },
        { x: PAGE_W - 76, y: 202, r: 3, o: 0.8 },
        { x: 96, y: PAGE_H - 224, r: 3.5, o: 0.9 },
        { x: 200, y: PAGE_H - 142, r: 2.5, o: 0.6 },
        { x: 296, y: PAGE_H - 66, r: 3, o: 0.8 },
      ].map((d, i) => (
        <Diamond key={i} cx={d.x} cy={d.y} r={d.r} opacity={d.o} />
      ))}

      {/* Subtle dot texture in the dark corner areas */}
      {Array.from({ length: 9 }, (_, i) => (
        <Rect
          key={`t${i}`}
          x={PAGE_W - 60 - (i % 3) * 22}
          y={26 + Math.floor(i / 3) * 22}
          width={1.6}
          height={1.6}
          fill={GOLD}
          fillOpacity={0.35}
        />
      ))}
      {Array.from({ length: 9 }, (_, i) => (
        <Rect
          key={`b${i}`}
          x={38 + (i % 3) * 22}
          y={PAGE_H - 70 + Math.floor(i / 3) * 22 - 22}
          width={1.6}
          height={1.6}
          fill={GOLD}
          fillOpacity={0.35}
        />
      ))}

      {/* Thin gold frame */}
      <Rect
        x={24}
        y={24}
        width={PAGE_W - 48}
        height={PAGE_H - 48}
        fill="none"
        stroke={GOLD}
        strokeWidth={1}
      />
      </Svg>
    </View>
  );
}

/** Cover summary strip cell: gold caps label over a white value. */
function CoverFact({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <View
      style={{
        paddingHorizontal: 14,
        borderRightWidth: last ? 0 : 0.8,
        borderRightColor: GOLD,
        alignItems: "center",
        maxWidth: 150,
      }}
    >
      <Text style={{ fontSize: 7, color: GOLD_LIGHT, textTransform: "uppercase", letterSpacing: 1.2 }}>
        {label}
      </Text>
      <Text style={{ fontSize: 9, color: "#ffffff", fontFamily: "Helvetica-Bold", marginTop: 3, textAlign: "center" }}>
        {value}
      </Text>
    </View>
  );
}

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
    ...(items ?? []).map((i) => i.description),
    "English speaking medical translator",
    "VIP Airport – Hotel – Hospital transfers",
  ];

  const ref = caseId.slice(0, 8).toUpperCase();
  const issued = fmtDate(new Date().toISOString());
  const coverFacts = [
    { label: "Doctor", value: doctor },
    { label: "Hospital", value: hospital },
    { label: "Arrival", value: fmtDate(caseRow.arrival_date) },
    { label: "Departure", value: fmtDate(caseRow.departure_date) },
  ].filter((f) => f.value);

  const doc = (
    <Document title={`TurkCure WOF — ${patient?.full_name ?? "Patient"}`}>
      {/* Premium cover page — full-bleed navy + gold */}
      <Page size="A4" style={{ fontFamily: "Helvetica" }} wrap={false}>
        <CoverBackground />
        <View
          style={{
            position: "absolute",
            top: 24,
            left: 24,
            right: 24,
            bottom: 24,
            paddingHorizontal: 40,
            paddingVertical: 56,
            alignItems: "center",
          }}
        >
          {/* Brand */}
          <WordmarkGold scale={1.6} />
          <Text
            style={{
              fontSize: 8,
              color: GOLD_LIGHT,
              letterSpacing: 3,
              marginTop: 8,
              textTransform: "uppercase",
            }}
          >
            Health Tourism · Istanbul
          </Text>

          {/* Title block, vertically centered */}
          <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
            <Text style={{ fontSize: 26, color: "#ffffff", fontFamily: "Helvetica-Bold", letterSpacing: 2, textAlign: "center" }}>
              TREATMENT &
            </Text>
            <Text style={{ fontSize: 26, color: "#ffffff", fontFamily: "Helvetica-Bold", letterSpacing: 2, textAlign: "center", marginTop: 4 }}>
              RESERVATION
            </Text>
            <Text style={{ fontSize: 26, color: GOLD, fontFamily: "Helvetica-Bold", letterSpacing: 2, textAlign: "center", marginTop: 4 }}>
              CONFIRMATION
            </Text>
            <View style={{ marginTop: 18 }}>
              <CoverOrnament width={200} />
            </View>

            <Text
              style={{
                fontSize: 8.5,
                color: GOLD,
                letterSpacing: 2.5,
                textTransform: "uppercase",
                marginTop: 34,
              }}
            >
              Prepared for
            </Text>
            <Text
              style={{
                fontSize: 24,
                color: "#ffffff",
                fontFamily: "Helvetica-Bold",
                marginTop: 6,
                textAlign: "center",
              }}
            >
              {patient?.full_name ?? "Patient"}
            </Text>
            {op ? (
              <Text style={{ fontSize: 11, color: GOLD_LIGHT, marginTop: 6, textAlign: "center" }}>
                {op}
              </Text>
            ) : null}
          </View>

          {/* Summary strip */}
          {coverFacts.length > 0 && (
            <View
              style={{
                flexDirection: "row",
                justifyContent: "center",
                alignItems: "flex-start",
                marginBottom: 22,
              }}
            >
              {coverFacts.map((f, i) => (
                <CoverFact key={f.label} label={f.label} value={f.value} last={i === coverFacts.length - 1} />
              ))}
            </View>
          )}

          <Text style={{ fontSize: 8, color: GOLD_LIGHT, letterSpacing: 1, opacity: 0.85 }}>
            Ref {ref}  ·  Issued {issued}  ·  turkcure.com
          </Text>
        </View>
      </Page>

      <Page size="A4" style={s.page}>
        <PdfHeader
          accent="gold"
          title={<Text style={s.docTitle}>Treatment & Reservation Confirmation</Text>}
          meta={`WOF  ·  Issued ${issued}  ·  Ref ${ref}`}
        />

        {/* Patient name banner */}
        <View
          style={{
            marginBottom: 18,
            paddingVertical: 12,
            paddingHorizontal: 16,
            borderRadius: 8,
            backgroundColor: "#faf6ec",
            borderWidth: 1,
            borderColor: "#e8d9ae",
          }}
          wrap={false}
        >
          <Text style={{ fontSize: 8.5, color: GOLD_DARK, textTransform: "uppercase", letterSpacing: 0.6 }}>
            Prepared for
          </Text>
          <Text style={{ fontSize: 16, fontFamily: "Helvetica-Bold", color: INK, marginTop: 2 }}>
            {patient?.full_name ?? "Patient"}
          </Text>
          {op ? <Text style={{ fontSize: 9.5, color: BLUE_DEEP, marginTop: 2 }}>{op}</Text> : null}
        </View>

        <Section accent={GOLD} title="Patient Information" wrap={false}>
          <KV label="Date of birth" value={fmtDate(patient?.date_of_birth)} />
          <KV label="Gender" value={fmtGender(patient?.gender)} />
          <KV label="Passport number" value={patient?.passport_number} />
          <KV label="Country" value={patient?.countries?.name} />
          <KV label="Phone / WhatsApp" value={patient?.phone} />
          <KV label="E-mail" value={patient?.email} last />
        </Section>

        <Section accent={GOLD} title="Travel" wrap={false}>
          <KV label="Arrival date" value={fmtDate(caseRow.arrival_date)} />
          <KV label="Departure date" value={fmtDate(caseRow.departure_date)} />
          <KV label="Airport" value={caseRow.airport} />
          <KV label="Airport pickup" value={caseRow.airport_pickup} last />
        </Section>

        {/* Hotel is booked for the whole stay (arrival → departure) */}
        <Section accent={GOLD} title="Hotel" wrap={false}>
          <KV label="Hotel name" value={hotel} />
          <KV label="Check-in date" value={fmtDate(caseRow.arrival_date)} />
          <KV label="Check-out date" value={fmtDate(caseRow.departure_date)} />
          <KV label="Total nights" value={totalNights ? `${totalNights} nights` : null} last />
        </Section>

        <Section accent={GOLD} title="Hospital" wrap={false}>
          <KV label="Hospital name" value={hospital} />
          <KV label="Operation date" value={fmtDate(caseRow.surgery_date)} />
          <KV
            label="Hospital stay"
            value={
              hospitalNights
                ? `${hospitalNights} night${hospitalNights > 1 ? "s" : ""} accommodation included`
                : null
            }
            last
          />
        </Section>

        <Section accent={GOLD} title="Package Details" wrap={false}>
          <View style={{ paddingVertical: 8 }}>
            <Text style={{ fontFamily: "Helvetica-Bold", color: INK, marginBottom: 7, fontSize: 10 }}>
              {op || "Treatment package"}
            </Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
              {packageBullets.map((b, i) => (
                <View key={i} style={{ flexDirection: "row", width: "50%", paddingVertical: 2.5, paddingRight: 10 }}>
                  <Text style={{ color: GOLD, marginRight: 5 }}>•</Text>
                  <Text style={{ flex: 1, color: TEXT }}>{b}</Text>
                </View>
              ))}
            </View>
          </View>
        </Section>

        {/* Payment — highlighted summary card */}
        <View style={s.section} wrap={false}>
          <View style={s.sectionHead}>
            <View style={[s.sectionTick, { backgroundColor: GOLD }]} />
            <Text style={s.sectionTitle}>Payment</Text>
          </View>
          <View
            style={{
              borderWidth: 1,
              borderColor: "#e8d9ae",
              borderRadius: 6,
              backgroundColor: "#f5f9ff",
              paddingVertical: 3,
              paddingHorizontal: 12,
            }}
          >
            <KV label="Total package price" value={money(total)} />
            <KV label="Deposit paid" value={money(deposit)} />
            <View style={{ flexDirection: "row", paddingVertical: 9, alignItems: "center" }}>
              <Text style={[s.kvLabel, { color: BLUE_DEEP }]}>Remaining balance</Text>
              <Text style={{ flex: 1, fontFamily: "Helvetica-Bold", fontSize: 12, color: BLUE_DEEP }}>
                {money(Math.max(total - deposit, 0))}
              </Text>
            </View>
          </View>
          <Text style={{ fontSize: 8.5, marginTop: 6, color: MUTED }}>
            Payment method: Cash / Bank Transfer / Card. Remaining balance is to be paid upon arrival
            in Istanbul before the procedure.
          </Text>
        </View>

        {/* Instructions */}
        {(instructions ?? []).map((ins, idx) => (
          <View key={idx}>
            <Text style={s.instrHeading} minPresenceAhead={40}>
              {ins.title}
            </Text>
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
        <Section accent={GOLD} title={COMPANY.name} wrap={false}>
          <KV label="Patient coordinator" value={coordinator} />
          <KV label="WhatsApp" value={COMPANY.whatsapp} />
          <KV label="Website" value={COMPANY.website} />
          <KV label="Location" value={COMPANY.location} last />
        </Section>

        {/* Confirmation + two-column signature block */}
        <View wrap={false} style={{ marginTop: 4 }}>
          <Text style={s.instrHeading}>Confirmation</Text>
          <Text style={{ marginBottom: 22, lineHeight: 1.5, color: TEXT }}>
            By confirming this document, the patient acknowledges the reservation and treatment plan
            organized by Turkcure.
          </Text>
          <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 34 }}>
            <View style={{ flex: 1 }}>
              <View style={{ borderTopWidth: 1, borderTopColor: "#c3ccd8", marginBottom: 4 }} />
              <Text style={{ color: MUTED, fontSize: 8.5 }}>Patient Signature</Text>
            </View>
            <View style={{ flex: 1 }}>
              <View style={{ borderTopWidth: 1, borderTopColor: "#c3ccd8", marginBottom: 4 }} />
              <Text style={{ color: MUTED, fontSize: 8.5 }}>Date</Text>
            </View>
          </View>
        </View>

        <PdfFooter />
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
