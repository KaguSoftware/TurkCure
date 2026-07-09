import React from "react";
import { StyleSheet, View, Text, Svg, Defs, LinearGradient, Stop, Rect } from "@react-pdf/renderer";

// Brand palette (matches the app's blue → teal → green identity).
export const BLUE = "#2563eb";
export const TEAL = "#0ea5a4";
export const GREEN = "#10b981";
export const TEXT = "#1e293b";
export const MUTED = "#64748b";
export const BORDER = "#d9e2ec"; // softer than the old #94a3b8
export const BORDER_STRONG = "#c3ccd8";
export const HEAD_BG = "#f2f6fc";
export const ZEBRA = "#f8fafc";

export const COMPANY = {
  name: "Turkcure Health Tourism",
  whatsapp: "+90 552 112 99 52",
  website: "Turkcure.com",
  location: "Skyland, Istanbul",
  address: "Huzur, Azerbaycan Cd. B Blok No:48, 34475 Sarıyer/İstanbul",
  url: "https://turkcure.com",
};

export const pdfStyles = StyleSheet.create({
  page: {
    paddingTop: 38,
    paddingHorizontal: 42,
    paddingBottom: 66,
    fontSize: 9,
    color: TEXT,
    fontFamily: "Helvetica",
    lineHeight: 1.35,
  },
  brand: { fontSize: 26, fontFamily: "Helvetica-Bold", lineHeight: 1 },
  docTitle: { fontSize: 14, color: BLUE, textAlign: "right", fontFamily: "Helvetica-Bold" },
  docMeta: { fontSize: 8, color: MUTED, textAlign: "right", marginTop: 3 },
  // A card-like table with rounded feel via a solid border and clipped rows.
  table: {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 4,
    marginBottom: 11,
    overflow: "hidden",
  },
  sectionHead: {
    backgroundColor: HEAD_BG,
    paddingVertical: 5,
    paddingHorizontal: 9,
    fontFamily: "Helvetica-Bold",
    fontSize: 10,
    color: BLUE,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
    // left accent bar
    borderLeftWidth: 3,
    borderLeftColor: TEAL,
  },
  row: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: BORDER },
  rowAlt: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
    backgroundColor: ZEBRA,
  },
  rowLast: { flexDirection: "row" },
  rowLastAlt: { flexDirection: "row", backgroundColor: ZEBRA },
  cellLabel: {
    width: "34%",
    paddingVertical: 6,
    paddingHorizontal: 9,
    fontFamily: "Helvetica-Bold",
    color: "#334155",
    borderRightWidth: 1,
    borderRightColor: BORDER,
  },
  cellValue: { flex: 1, paddingVertical: 6, paddingHorizontal: 9 },
  bold: { fontFamily: "Helvetica-Bold" },
  bullet: { width: "50%", paddingVertical: 2.5, paddingRight: 8 },
  footer: {
    position: "absolute",
    bottom: 26,
    left: 42,
    right: 42,
    textAlign: "center",
    color: MUTED,
    fontSize: 7.5,
    borderTopWidth: 1,
    borderTopColor: BORDER,
    paddingTop: 6,
  },
  pageNumber: {
    position: "absolute",
    bottom: 13,
    left: 42,
    right: 42,
    textAlign: "center",
    color: MUTED,
    fontSize: 7,
  },
  instrHeading: {
    fontFamily: "Helvetica-Bold",
    fontSize: 10.5,
    color: BLUE,
    marginTop: 10,
    marginBottom: 4,
    paddingBottom: 3,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  instrLine: { marginBottom: 2.5, lineHeight: 1.45 },
});

/**
 * The TurkCure wordmark: "Turk" in blue, "Cure" filled with a teal→green
 * gradient, rendered in SVG so the gradient is real (mirrors the app's
 * brand-gradient-text). `scale` sizes it; base is ~150×26pt.
 */
export function Wordmark({ scale = 1 }: { scale?: number }) {
  const w = 150 * scale;
  const h = 30 * scale;
  return (
    <Svg width={w} height={h} viewBox="0 0 150 30">
      <Defs>
        <LinearGradient id="cureGrad" x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor={TEAL} />
          <Stop offset="1" stopColor={GREEN} />
        </LinearGradient>
      </Defs>
      <Text x={0} y={23} fill={BLUE} style={{ fontFamily: "Helvetica-Bold", fontSize: 26 }}>
        Turk
      </Text>
      <Text
        x={66}
        y={23}
        fill="url(#cureGrad)"
        style={{ fontFamily: "Helvetica-Bold", fontSize: 26 }}
      >
        Cure
      </Text>
    </Svg>
  );
}

/** Thin blue→teal→green rule used under the header. */
export function BrandRule() {
  return (
    <Svg width="100%" height={3} style={{ marginBottom: 14 }}>
      <Defs>
        <LinearGradient id="ruleGrad" x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor={BLUE} />
          <Stop offset="0.5" stopColor={TEAL} />
          <Stop offset="1" stopColor={GREEN} />
        </LinearGradient>
      </Defs>
      <Rect x={0} y={0} width="100%" height={3} fill="url(#ruleGrad)" rx={1.5} />
    </Svg>
  );
}

/** Standard document header: wordmark left, title + meta right, gradient rule. */
export function PdfHeader({ title, meta }: { title: React.ReactNode; meta?: string }) {
  return (
    <View>
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: 10,
        }}
      >
        <Wordmark />
        <View>
          {title}
          {meta ? <Text style={pdfStyles.docMeta}>{meta}</Text> : null}
        </View>
      </View>
      <BrandRule />
    </View>
  );
}

/** Fixed footer with address, url and page numbers. */
export function PdfFooter() {
  return (
    <>
      <View style={pdfStyles.footer} fixed>
        <Text style={pdfStyles.bold}>
          {COMPANY.address}
        </Text>
        <Text style={{ color: BLUE, marginTop: 2 }}>{COMPANY.url}</Text>
      </View>
      <Text
        style={pdfStyles.pageNumber}
        fixed
        render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`}
      />
    </>
  );
}

export function mdLines(md: string): { text: string; heading: boolean; bullet: boolean }[] {
  return md
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      if (line.startsWith("#"))
        return { text: line.replace(/^#+\s*/, ""), heading: true, bullet: false };
      if (line.startsWith("-") || line.startsWith("*"))
        return { text: line.replace(/^[-*]\s*/, ""), heading: false, bullet: true };
      return { text: line, heading: false, bullet: false };
    });
}

export function fmtDate(d: string | null | undefined): string {
  if (!d) return "";
  const date = new Date(d);
  return `${String(date.getDate()).padStart(2, "0")}.${String(date.getMonth() + 1).padStart(2, "0")}.${date.getFullYear()}`;
}

export function nightsBetween(from: string | null, to: string | null): number | null {
  if (!from || !to) return null;
  const ms = new Date(to).getTime() - new Date(from).getTime();
  const nights = Math.round(ms / 86400000);
  return nights > 0 ? nights : null;
}
