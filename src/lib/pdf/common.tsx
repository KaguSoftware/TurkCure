import React from "react";
import { StyleSheet, View, Text, Svg, Defs, LinearGradient, Stop, Rect, Polygon, Line } from "@react-pdf/renderer";

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

export const pdfStyles = StyleSheet.create({
  page: {
    paddingTop: 44,
    paddingHorizontal: 46,
    paddingBottom: 70,
    fontSize: 9.5,
    color: TEXT,
    fontFamily: "Helvetica",
    lineHeight: 1.4,
  },
  docTitle: { fontSize: 13, color: INK, textAlign: "right", fontFamily: "Helvetica-Bold" },
  docSub: { fontSize: 8.5, color: MUTED, textAlign: "right", marginTop: 3 },

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
    fontFamily: "Helvetica-Bold",
    fontSize: 10.5,
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
  kvValue: { flex: 1, color: INK, fontFamily: "Helvetica-Bold", fontSize: 9.5 },

  bold: { fontFamily: "Helvetica-Bold" },
  bullet: { width: "50%", paddingVertical: 2.5, paddingRight: 8, color: TEXT },

  footer: {
    position: "absolute",
    bottom: 30,
    left: 46,
    right: 46,
    textAlign: "center",
    color: MUTED,
    fontSize: 7.5,
    borderTopWidth: 1,
    borderTopColor: HAIRLINE,
    paddingTop: 7,
  },
  pageNumber: {
    position: "absolute",
    bottom: 15,
    left: 46,
    right: 46,
    textAlign: "center",
    color: FAINT,
    fontSize: 7,
  },
  instrHeading: {
    fontFamily: "Helvetica-Bold",
    fontSize: 10.5,
    color: BLUE_DEEP,
    marginTop: 12,
    marginBottom: 5,
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
        style={{ fontFamily: "Helvetica-Bold", fontSize: 24, letterSpacing: -0.5 }}
      >
        Turk
      </Text>
      <Text
        x={58}
        y={21}
        fill="url(#cureGrad)"
        style={{ fontFamily: "Helvetica-Bold", fontSize: 24, letterSpacing: -0.5 }}
      >
        Cure
      </Text>
    </Svg>
  );
}

/**
 * The wordmark on dark backgrounds: "Turk" in warm white, "Cure" filled with
 * an antique-gold gradient. Same geometry as `Wordmark`.
 */
export function WordmarkGold({ scale = 1 }: { scale?: number }) {
  const w = 132 * scale;
  const h = 28 * scale;
  return (
    <Svg width={w} height={h} viewBox="0 0 132 28">
      <Defs>
        <LinearGradient id="cureGoldGrad" x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor={GOLD_DARK} />
          <Stop offset="0.5" stopColor={GOLD} />
          <Stop offset="1" stopColor={GOLD_LIGHT} />
        </LinearGradient>
      </Defs>
      <Text
        x={0}
        y={21}
        fill="#f5f1e6"
        style={{ fontFamily: "Helvetica-Bold", fontSize: 24, letterSpacing: -0.5 }}
      >
        Turk
      </Text>
      <Text
        x={58}
        y={21}
        fill="url(#cureGoldGrad)"
        style={{ fontFamily: "Helvetica-Bold", fontSize: 24, letterSpacing: -0.5 }}
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
  const stops =
    accent === "gold" ? [GOLD_DARK, GOLD, GOLD_LIGHT] : [BLUE, CYAN, GREEN];
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
      {/* Thin gradient rule */}
      <Svg width="100%" height={2.5} style={{ marginBottom: 20 }}>
        <Defs>
          <LinearGradient id="ruleGrad" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor={stops[0]} />
            <Stop offset="0.5" stopColor={stops[1]} />
            <Stop offset="1" stopColor={stops[2]} />
          </LinearGradient>
        </Defs>
        <Rect x={0} y={0} width="100%" height={2.5} fill="url(#ruleGrad)" rx={1.25} />
      </Svg>
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
