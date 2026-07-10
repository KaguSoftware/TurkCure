import React from "react";
import path from "node:path";
import {
  StyleSheet,
  Font,
  View,
  Text,
  Svg,
  Defs,
  LinearGradient,
  Stop,
  Polygon,
  Line,
} from "@react-pdf/renderer";

// Embedded brand fonts: Playfair Display (display serif) + Source Sans 3 (text).
const FONT_DIR = path.join(process.cwd(), "src", "lib", "pdf", "fonts");

Font.register({
  family: "Playfair",
  fonts: [
    { src: path.join(FONT_DIR, "PlayfairDisplay-Regular.ttf"), fontWeight: 400 },
    { src: path.join(FONT_DIR, "PlayfairDisplay-Bold.ttf"), fontWeight: 700 },
    { src: path.join(FONT_DIR, "PlayfairDisplay-Italic.ttf"), fontWeight: 400, fontStyle: "italic" },
  ],
});

Font.register({
  family: "SourceSans",
  fonts: [
    { src: path.join(FONT_DIR, "SourceSans3-Regular.ttf"), fontWeight: 400 },
    { src: path.join(FONT_DIR, "SourceSans3-SemiBold.ttf"), fontWeight: 600 },
    { src: path.join(FONT_DIR, "SourceSans3-Bold.ttf"), fontWeight: 700 },
  ],
});

// Never hyphenate — broken words look terrible on a formal document.
Font.registerHyphenationCallback((word) => [word]);

// Brand palette — "clean medical": airy white, brand blue, teal→green accent.
export const BLUE = "#1d59d6";
export const BLUE_DEEP = "#123a94";
export const CYAN = "#1aa0c8";
export const TEAL = "#0ea5a4";
export const GREEN = "#16b364";
export const INK = "#0f1b2d";
export const TEXT = "#243244";
export const MUTED = "#6b7a8d";
export const FAINT = "#9aa7b6";
export const HAIRLINE = "#e7ecf2";
export const CARD_BG = "#fbfcfe";
export const ACCENT_SOFT = "#eef4ff";

// Premium cover palette — deep navy + antique gold.
export const NAVY = "#0b1f3f";
export const NAVY_DEEP = "#071531";
export const GOLD = "#c9a24b";
export const GOLD_LIGHT = "#e6c87d";
export const GOLD_DARK = "#9a7a2e";

export const COMPANY = {
  name: "Turkcure Health Tourism",
  whatsapp: "+90 552 112 99 52",
  website: "Turkcure.com",
  location: "Skyland, Istanbul",
  address: "Huzur, Azerbaycan Cd. B Blok No:48, 34475 Sarıyer/İstanbul",
  url: "https://turkcure.com",
};

// Warm hairline + label-column tint used by the table sections.
export const TABLE_LINE = "#e5e0d4";
export const LABEL_BG = "#faf8f2";
export const GOLD_SOFT_BG = "#faf3e0";

export const pdfStyles = StyleSheet.create({
  page: {
    paddingTop: 48,
    paddingHorizontal: 50,
    paddingBottom: 76,
    fontSize: 10,
    color: TEXT,
    fontFamily: "SourceSans",
    lineHeight: 1.45,
  },
  docTitle: { fontSize: 14, color: INK, textAlign: "right", fontFamily: "Playfair", fontWeight: 700 },
  docSub: { fontSize: 8.5, color: MUTED, textAlign: "right", marginTop: 3 },

  // Numbered table section — navy header band + hairline-bordered body.
  tableSection: {
    marginBottom: 20,
  },
  tableHead: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: NAVY,
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
    paddingVertical: 7,
    paddingHorizontal: 14,
  },
  tableHeadRule: {
    width: 14,
    height: 1.2,
    backgroundColor: GOLD,
    marginRight: 9,
  },
  tableHeadTitle: {
    fontFamily: "Playfair",
    fontWeight: 700,
    fontSize: 11,
    color: "#ffffff",
    letterSpacing: 0.4,
  },
  tableBody: {
    borderWidth: 1,
    borderColor: TABLE_LINE,
    borderTopWidth: 0,
    borderBottomLeftRadius: 4,
    borderBottomRightRadius: 4,
    backgroundColor: "#ffffff",
  },
  tRow: {
    flexDirection: "row",
    alignItems: "stretch",
    borderBottomWidth: 1,
    borderBottomColor: TABLE_LINE,
  },
  tRowLast: {
    flexDirection: "row",
    alignItems: "stretch",
  },
  tLabel: {
    width: "36%",
    backgroundColor: LABEL_BG,
    borderRightWidth: 1,
    borderRightColor: TABLE_LINE,
    paddingVertical: 9,
    paddingHorizontal: 14,
    color: MUTED,
    fontSize: 8.5,
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  tValue: {
    flex: 1,
    paddingVertical: 9,
    paddingHorizontal: 14,
    color: INK,
    fontWeight: 600,
    fontSize: 10,
  },

  // A light "card" section — no heavy borders, just a hairline frame + soft head.
  section: {
    marginBottom: 16,
  },
  sectionHead: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 7,
  },
  sectionTick: {
    width: 3,
    height: 11,
    borderRadius: 2,
    backgroundColor: TEAL,
    marginRight: 7,
  },
  sectionTitle: {
    fontFamily: "Playfair",
    fontWeight: 700,
    fontSize: 11,
    color: BLUE_DEEP,
    letterSpacing: 0.3,
  },
  card: {
    borderWidth: 1,
    borderColor: HAIRLINE,
    borderRadius: 6,
    backgroundColor: CARD_BG,
    paddingVertical: 3,
    paddingHorizontal: 14,
  },
  kvRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    borderBottomWidth: 1,
    borderBottomColor: HAIRLINE,
    paddingVertical: 6.5,
  },
  kvRowLast: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: 6.5,
  },
  kvLabel: {
    width: "38%",
    color: MUTED,
    fontSize: 9,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  kvValue: { flex: 1, color: INK, fontWeight: 600, fontSize: 10 },

  bold: { fontWeight: 700 },
  bullet: { width: "50%", paddingVertical: 2.5, paddingRight: 8, color: TEXT },

  footer: {
    position: "absolute",
    bottom: 30,
    left: 50,
    right: 50,
    textAlign: "center",
    color: MUTED,
    fontSize: 7.5,
    borderTopWidth: 1,
    borderTopColor: HAIRLINE,
    paddingTop: 9,
  },
  pageNumber: {
    position: "absolute",
    bottom: 15,
    left: 50,
    right: 50,
    textAlign: "center",
    color: FAINT,
    fontSize: 7,
  },
  instrHeading: {
    fontFamily: "Playfair",
    fontWeight: 700,
    fontSize: 11,
    color: BLUE_DEEP,
    marginTop: 14,
    marginBottom: 6,
  },
  instrLine: { marginBottom: 3, lineHeight: 1.5, color: TEXT },
});

/**
 * The TurkCure wordmark, rebuilt in vector to match the brand: "Turk" in solid
 * brand blue, "Cure" filled with a left-to-right blue→cyan→green gradient.
 * Bold, tight tracking, single line. `scale` sizes it (base ≈ 132×26pt).
 */
export function Wordmark({ scale = 1 }: { scale?: number }) {
  const w = 132 * scale;
  const h = 28 * scale;
  return (
    <Svg width={w} height={h} viewBox="0 0 132 28">
      <Defs>
        <LinearGradient id="cureGrad" x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor={BLUE} />
          <Stop offset="0.5" stopColor={CYAN} />
          <Stop offset="1" stopColor={GREEN} />
        </LinearGradient>
      </Defs>
      <Text
        x={0}
        y={21}
        fill={BLUE}
        style={{ fontFamily: "SourceSans", fontWeight: 700, fontSize: 24, letterSpacing: -0.5 }}
      >
        Turk
      </Text>
      <Text
        x={49}
        y={21}
        fill="url(#cureGrad)"
        style={{ fontFamily: "SourceSans", fontWeight: 700, fontSize: 24, letterSpacing: -0.5 }}
      >
        Cure
      </Text>
    </Svg>
  );
}

/**
 * The wordmark on dark backgrounds: "Turk" in warm white, "Cure" in antique
 * gold. Same geometry as `Wordmark`. Gradient fills don't render on SVG text
 * in react-pdf (the text comes out invisible on the dark cover), so "Cure"
 * uses a solid gold fill instead.
 */
export function WordmarkGold({ scale = 1 }: { scale?: number }) {
  const w = 132 * scale;
  const h = 28 * scale;
  return (
    <Svg width={w} height={h} viewBox="0 0 132 28">
      <Text
        x={0}
        y={21}
        fill="#f5f1e6"
        style={{ fontFamily: "SourceSans", fontWeight: 700, fontSize: 24, letterSpacing: -0.5 }}
      >
        Turk
      </Text>
      <Text
        x={49}
        y={21}
        fill={GOLD}
        style={{ fontFamily: "SourceSans", fontWeight: 700, fontSize: 24, letterSpacing: -0.5 }}
      >
        Cure
      </Text>
    </Svg>
  );
}

/** A diamond (rotated-square) shape drawn as a polygon around a center point. */
export function Diamond({
  cx,
  cy,
  r,
  opacity = 1,
}: {
  cx: number;
  cy: number;
  r: number;
  opacity?: number;
}) {
  return (
    <Polygon
      points={`${cx},${cy - r} ${cx + r},${cy} ${cx},${cy + r} ${cx - r},${cy}`}
      fill={GOLD}
      fillOpacity={opacity}
    />
  );
}

/** Centered gold divider: thin rules flanking a diamond. */
export function CoverOrnament({ width = 180 }: { width?: number }) {
  const h = 12;
  const mid = h / 2;
  const cx = width / 2;
  return (
    <Svg width={width} height={h}>
      <Line x1={0} y1={mid} x2={cx - 14} y2={mid} stroke={GOLD} strokeWidth={0.8} />
      <Line x1={cx + 14} y1={mid} x2={width} y2={mid} stroke={GOLD} strokeWidth={0.8} />
      <Diamond cx={cx} cy={mid} r={4} />
    </Svg>
  );
}

/** Standard header: wordmark left, title + meta right, hairline divider. */
export function PdfHeader({
  title,
  meta,
  accent = "brand",
}: {
  title: React.ReactNode;
  meta?: string;
  accent?: "gold" | "brand";
}) {
  const ruleColor = accent === "gold" ? GOLD : BLUE;
  return (
    <View>
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: 12,
        }}
      >
        <Wordmark />
        <View>
          {title}
          {meta ? <Text style={pdfStyles.docSub}>{meta}</Text> : null}
        </View>
      </View>
      {/* Thin accent rule */}
      <View
        style={{
          height: 2,
          borderRadius: 1,
          backgroundColor: ruleColor,
          marginBottom: 22,
        }}
      />
    </View>
  );
}

/** Section wrapper: accent-tick title + a light hairline card of rows. */
export function Section({
  title,
  children,
  wrap,
  accent,
}: {
  title: string;
  children: React.ReactNode;
  wrap?: boolean;
  accent?: string;
}) {
  return (
    <View style={pdfStyles.section} wrap={wrap}>
      <View style={pdfStyles.sectionHead}>
        <View style={[pdfStyles.sectionTick, accent ? { backgroundColor: accent } : {}]} />
        <Text style={pdfStyles.sectionTitle}>{title}</Text>
      </View>
      <View style={pdfStyles.card}>{children}</View>
    </View>
  );
}

/** A key/value row inside a Section card. */
export function KV({ label, value, last }: { label: string; value?: string | null; last?: boolean }) {
  return (
    <View style={last ? pdfStyles.kvRowLast : pdfStyles.kvRow}>
      <Text style={pdfStyles.kvLabel}>{label}</Text>
      <Text style={pdfStyles.kvValue}>{value ? value : "—"}</Text>
    </View>
  );
}

/**
 * Numbered, table-style section: navy header band ("1. Patient Information")
 * with a small gold rule, above a hairline-bordered white body.
 */
export function TableSection({
  number,
  title,
  children,
  wrap,
}: {
  number?: number;
  title: string;
  children: React.ReactNode;
  wrap?: boolean;
}) {
  return (
    <View style={pdfStyles.tableSection} wrap={wrap}>
      <View style={pdfStyles.tableHead} minPresenceAhead={60}>
        <View style={pdfStyles.tableHeadRule} />
        <Text style={pdfStyles.tableHeadTitle}>
          {number != null ? `${number}. ` : ""}
          {title}
        </Text>
      </View>
      <View style={pdfStyles.tableBody}>{children}</View>
    </View>
  );
}

/** A label/value table row inside a TableSection. */
export function TRow({ label, value, last }: { label: string; value?: string | null; last?: boolean }) {
  return (
    <View style={last ? pdfStyles.tRowLast : pdfStyles.tRow}>
      <Text style={pdfStyles.tLabel}>{label}</Text>
      <Text style={pdfStyles.tValue}>{value ? value : "—"}</Text>
    </View>
  );
}

/** Fixed footer with address, url and page numbers. */
export function PdfFooter() {
  return (
    <>
      <View style={pdfStyles.footer} fixed>
        <Text style={pdfStyles.bold}>{COMPANY.address}</Text>
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

/** Human-readable gender, or "—" when unknown. */
export function fmtGender(g: string | null | undefined): string {
  if (g === "female") return "Female";
  if (g === "male") return "Male";
  return "—";
}
