import { NextResponse } from "next/server";
import React from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import { createClient, getProfile } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";

export const runtime = "nodejs";

const BLUE = "#2563eb";
const GREEN = "#10b981";
const TEXT = "#1e293b";
const MUTED = "#64748b";
const BORDER = "#e2e8f0";

const styles = StyleSheet.create({
  page: { padding: 48, fontSize: 10, color: TEXT, fontFamily: "Helvetica" },
  brand: { fontSize: 22, fontFamily: "Helvetica-Bold" },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    borderBottomWidth: 2,
    borderBottomColor: BLUE,
    paddingBottom: 12,
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 12,
    fontFamily: "Helvetica-Bold",
    color: BLUE,
    marginBottom: 8,
    marginTop: 18,
  },
  row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4 },
  tableRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  total: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 8,
    marginTop: 4,
    borderTopWidth: 2,
    borderTopColor: GREEN,
  },
  muted: { color: MUTED },
  bold: { fontFamily: "Helvetica-Bold" },
  footer: {
    position: "absolute",
    bottom: 32,
    left: 48,
    right: 48,
    textAlign: "center",
    color: MUTED,
    fontSize: 8,
  },
});

// Very light markdown-to-lines conversion for the PDF
function mdLines(md: string): { text: string; heading: boolean; bullet: boolean }[] {
  return md
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      if (line.startsWith("#")) return { text: line.replace(/^#+\s*/, ""), heading: true, bullet: false };
      if (line.startsWith("-") || line.startsWith("*"))
        return { text: line.replace(/^[-*]\s*/, ""), heading: false, bullet: true };
      return { text: line, heading: false, bullet: false };
    });
}

export async function GET(_request: Request, { params }: { params: Promise<{ caseId: string }> }) {
  const profile = await getProfile();
  if (!profile || !profile.active) return new NextResponse("Unauthorized", { status: 401 });

  const { caseId } = await params;
  const supabase = await createClient();

  const { data: caseRow } = await supabase
    .from("cases")
    .select(
      "*, patients(full_name, email, phone), operation_types(name), doctors(name), hospitals(name, city), hotels(name, city), drivers(name)"
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

  // Deposit = what the patient has already paid
  const { data: paidIn } = await supabase
    .from("payments")
    .select("amount")
    .eq("case_id", caseId)
    .eq("direction", "in")
    .eq("status", "paid");
  const deposit = (paidIn ?? []).reduce((s, p) => s + Number(p.amount), 0);

  const { data: instructions } = await supabase
    .from("case_instructions")
    .select("title, body_md")
    .eq("case_id", caseId)
    .order("created_at");

  const patient = caseRow.patients as { full_name: string } | null;
  const total = (items ?? []).reduce((s, i) => s + Number(i.price), 0);
  const currency = caseRow.currency as string;
  const money = (n: number) =>
    `${n.toLocaleString("en-US", { minimumFractionDigits: 2 })} ${currency}`;

  const doc = (
    <Document title={`TurkCure — ${patient?.full_name ?? "Patient"}`}>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View>
            <Text style={styles.brand}>
              <Text style={{ color: BLUE }}>Turk</Text>
              <Text style={{ color: GREEN }}>Cure</Text>
            </Text>
            <Text style={{ color: MUTED, marginTop: 2 }}>Health tourism, made personal</Text>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={styles.bold}>{patient?.full_name}</Text>
            <Text style={styles.muted}>Treatment plan · {formatDate(new Date())}</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Your Treatment</Text>
        <View style={styles.row}>
          <Text style={styles.muted}>Procedure</Text>
          <Text style={styles.bold}>
            {(caseRow.operation_types as { name: string } | null)?.name ?? "To be confirmed"}
          </Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.muted}>Doctor</Text>
          <Text>{(caseRow.doctors as { name: string } | null)?.name ?? "To be confirmed"}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.muted}>Hospital</Text>
          <Text>{(caseRow.hospitals as { name: string } | null)?.name ?? "To be confirmed"}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.muted}>Hotel</Text>
          <Text>{(caseRow.hotels as { name: string } | null)?.name ?? "To be confirmed"}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.muted}>Arrival</Text>
          <Text>{formatDate(caseRow.arrival_date)}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.muted}>Operation</Text>
          <Text>{formatDate(caseRow.surgery_date)}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.muted}>Departure</Text>
          <Text>{formatDate(caseRow.departure_date)}</Text>
        </View>

        <Text style={styles.sectionTitle}>What Your Package Includes</Text>
        {(items ?? []).map((item, i) => (
          <View key={i} style={styles.tableRow}>
            <Text>{item.description}</Text>
          </View>
        ))}
        <View style={styles.total}>
          <Text style={styles.bold}>Total</Text>
          <Text style={[styles.bold, { color: GREEN, fontSize: 12 }]}>{money(total)}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.muted}>Deposit received</Text>
          <Text style={styles.bold}>{money(deposit)}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.muted}>Remaining balance</Text>
          <Text style={styles.bold}>{money(Math.max(total - deposit, 0))}</Text>
        </View>

        {(instructions ?? []).map((ins, i) => (
          <View key={i} break={i === 0}>
            <Text style={styles.sectionTitle}>{ins.title}</Text>
            {mdLines(ins.body_md).map((line, j) => (
              <Text
                key={j}
                style={
                  line.heading
                    ? [styles.bold, { marginTop: 8, marginBottom: 3, fontSize: 11 }]
                    : { marginBottom: 3, marginLeft: line.bullet ? 10 : 0 }
                }
              >
                {line.bullet ? "• " : ""}
                {line.text}
              </Text>
            ))}
          </View>
        ))}

        <Text style={styles.footer} fixed>
          TurkCure · turkcure.com · Your coordinator is available 24/7 during your stay
        </Text>
      </Page>
    </Document>
  );

  const buffer = await renderToBuffer(doc);
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="turkcure-${(patient?.full_name ?? "patient")
        .toLowerCase()
        .replace(/\s+/g, "-")}.pdf"`,
    },
  });
}
