import React from "react";
import path from "node:path";
import fs from "node:fs";
import { COMPANY } from "./company";
import { DEFAULT_PDF_THEME, type PdfTheme } from "./theme";
import {
  StyleSheet,
  Font,
  View,
  Text,
  Image,
  Svg,
  Polygon,
  Line,
  renderToBuffer,
} from "@react-pdf/renderer";

// Embedded brand fonts: Playfair Display (display serif) + Source Sans 3 (text).
//
// Resolve the font directory robustly. On Vercel the serverless function's cwd
// is the traced app root and the TTFs are pulled in via `outputFileTracingIncludes`
// in next.config.ts — but the exact location can differ between the dev server,
// `next start`, and the serverless bundle, so probe a few candidates and use the
// first that actually exists. If none resolve we skip custom fonts entirely
// rather than letting `renderToBuffer` throw and blow up the whole PDF route.
const FONT_CANDIDATES = [
  path.join(process.cwd(), "src", "lib", "pdf", "fonts"),
  path.join(process.cwd(), ".next", "server", "src", "lib", "pdf", "fonts"),
  path.join(__dirname, "fonts"),
];
const FONT_DIR =
  FONT_CANDIDATES.find((dir) => {
    try {
      return fs.existsSync(path.join(dir, "SourceSans3-Regular.ttf"));
    } catch {
      return false;
    }
  }) ?? null;

if (FONT_DIR) {
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
      { src: path.join(FONT_DIR, "SourceSans3-Italic.ttf"), fontWeight: 400, fontStyle: "italic" },
    ],
  });
} else {
  console.error(
    "PDF fonts not found; falling back to built-in Helvetica. Checked:",
    FONT_CANDIDATES.join(", ")
  );
}

// Family names to use throughout the PDFs. When the brand TTFs load we use them;
// otherwise fall back to react-pdf's built-in Helvetica so the route still renders
// (unstyled but working) instead of throwing "font not registered".
export const SERIF = FONT_DIR ? "Playfair" : "Helvetica";
export const SANS = FONT_DIR ? "SourceSans" : "Helvetica";

// Never hyphenate — broken words look terrible on a formal document.
Font.registerHyphenationCallback((word) => [word]);

// Neutral inks and hairlines — deliberately THEME-INVARIANT. Deriving
// near-neutrals from a brand hue produces garish tints; the brand colors live
// on PdfTheme (defaults in theme.ts hold the legacy hex values).
export const INK = "#0f1b2d";
export const TEXT = "#243244";
export const MUTED = "#6b7a8d";
export const FAINT = "#9aa7b6";
export const HAIRLINE = "#e7ecf2";
export const CARD_BG = "#fbfcfe";

// Re-exported so every existing `from "@/lib/pdf/common"` import keeps working.
// The values live in company.ts, which has no imports — this module pulls in
// node:fs for the fonts and so can never be reached from a client component.
export { COMPANY };

// Warm hairline + label-column tint used by the table sections.
export const TABLE_LINE = "#e5e0d4";
export const LABEL_BG = "#faf8f2";

/**
 * The style sheet, parameterized by theme. Only four styles carry brand color
 * (section band, its small rule, the section-title/instruction-heading ink and
 * the tick); everything else is neutral. Cached per theme — one theme per
 * request in practice.
 */
function buildStyles(theme: PdfTheme) {
  return StyleSheet.create({
    page: {
      paddingTop: 48,
      paddingHorizontal: 50,
      paddingBottom: 76,
      fontSize: 10,
      color: TEXT,
      fontFamily: SANS,
      lineHeight: 1.45,
    },
    docTitle: { fontSize: 14, color: INK, textAlign: "right", fontFamily: SERIF, fontWeight: 700 },
    docSub: { fontSize: 8.5, color: MUTED, textAlign: "right", marginTop: 3 },

    // Numbered table section — cover-colored header band + hairline body.
    tableSection: {
      marginBottom: 20,
    },
    tableHead: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: theme.coverBg,
      borderTopLeftRadius: 4,
      borderTopRightRadius: 4,
      paddingVertical: 7,
      paddingHorizontal: 14,
    },
    tableHeadRule: {
      width: 14,
      height: 1.2,
      backgroundColor: theme.coverAccent,
      marginRight: 9,
    },
    tableHeadTitle: {
      fontFamily: SERIF,
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
      backgroundColor: theme.noteAccent,
      marginRight: 7,
    },
    sectionTitle: {
      fontFamily: SERIF,
      fontWeight: 700,
      fontSize: 11,
      color: theme.primaryDeep,
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
      fontFamily: SERIF,
      fontWeight: 700,
      fontSize: 11,
      color: theme.primaryDeep,
      marginTop: 14,
      marginBottom: 6,
    },
    instrLine: { marginBottom: 3, lineHeight: 1.5, color: TEXT },
  });
}

export type PdfStyles = ReturnType<typeof buildStyles>;

const stylesCache = new Map<PdfTheme, PdfStyles>();
export function makePdfStyles(theme: PdfTheme): PdfStyles {
  let styles = stylesCache.get(theme);
  if (!styles) {
    styles = buildStyles(theme);
    stylesCache.set(theme, styles);
  }
  return styles;
}

/** The default-theme styles — what every document rendered before theming. */
export const pdfStyles = makePdfStyles(DEFAULT_PDF_THEME);

export interface PdfCtx {
  theme: PdfTheme;
  styles: PdfStyles;
}

const DEFAULT_CTX: PdfCtx = { theme: DEFAULT_PDF_THEME, styles: pdfStyles };

/**
 * The active theme for the render in progress. NOT React context: Next
 * bundles route handlers under the react-server condition, whose React build
 * has no createContext/useContext at all (that is what broke the build when
 * this was a real context). A module global scoped around renderToBuffer is
 * safe instead because react-pdf mounts on a synchronous legacy root — every
 * component (and so every usePdfTheme() read) executes before renderToBuffer
 * hits its first await; only layout/font work is async. Concurrent renders in
 * one lambda therefore never observe each other's theme. If react-pdf ever
 * moves to an async-concurrent component phase, revisit this.
 */
let currentCtx: PdfCtx = DEFAULT_CTX;

export function usePdfTheme(): PdfCtx {
  return currentCtx;
}

export function makePdfCtx(theme: PdfTheme): PdfCtx {
  return { theme, styles: makePdfStyles(theme) };
}

/** renderToBuffer with `ctx` active for the component phase. Always restores
 *  the default so tests and themeless renders keep the legacy output. */
export async function renderThemedPdf(
  ctx: PdfCtx,
  element: Parameters<typeof renderToBuffer>[0]
): Promise<Buffer> {
  currentCtx = ctx;
  try {
    return await renderToBuffer(element);
  } finally {
    currentCtx = DEFAULT_CTX;
  }
}

/**
 * The brand mark. An uploaded logo renders as an image in a fixed bounding box
 * (react-pdf will not reliably aspect-scale from a single dimension, so both
 * are pinned and objectFit does the letterboxing). A text mark renders as
 * plain flex Text — NEVER as <Svg> text: the SVG version placed glyph runs at
 * hardcoded x offsets measured against font metrics that don't match what
 * renders, which clipped "Cure" out of every page header for months. Flex Text
 * self-sizes to the real advance width, so it centres exactly and survives the
 * Helvetica fallback. Baseline-aligned SIBLINGS in a row are the known-good
 * pattern (the react-pdf collision trap is stacked siblings, not rows).
 *
 * `variant` picks the color pair: "inner" (light backgrounds — primary +
 * markSecondary, the legacy blue/cyan) or "cover" (dark cover ground —
 * coverFg + coverAccent, the legacy warm-white/gold).
 */
export function Mark({ scale = 1, variant = "inner" }: { scale?: number; variant?: "inner" | "cover" }) {
  const { theme } = usePdfTheme();
  if (theme.mark.kind === "logo") {
    return (
      // eslint-disable-next-line jsx-a11y/alt-text
      <Image
        src={theme.mark.url}
        style={{ width: 120 * scale, height: 30 * scale, objectFit: "contain" }}
      />
    );
  }
  const glyphs = {
    fontFamily: SANS,
    fontWeight: 700 as const,
    fontSize: 24 * scale,
    letterSpacing: -0.5 * scale,
    // Pin the line box so whatever sits under the mark keeps its spacing
    // instead of inheriting the page line-height.
    lineHeight: 1,
  };
  const [first, second] =
    variant === "cover" ? [theme.coverFg, theme.coverAccent] : [theme.primary, theme.markSecondary];
  const { text, splitAt } = theme.mark;
  const split = splitAt != null && splitAt > 0 && splitAt < text.length ? splitAt : null;
  return (
    <View style={{ flexDirection: "row", alignItems: "baseline" }}>
      <Text style={{ ...glyphs, color: first }}>{split ? text.slice(0, split) : text}</Text>
      {split ? <Text style={{ ...glyphs, color: second }}>{text.slice(split)}</Text> : null}
    </View>
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
  const { theme } = usePdfTheme();
  return (
    <Polygon
      points={`${cx},${cy - r} ${cx + r},${cy} ${cx},${cy + r} ${cx - r},${cy}`}
      fill={theme.coverAccent}
      fillOpacity={opacity}
    />
  );
}

/** Centered accent divider: thin rules flanking a diamond. */
export function CoverOrnament({ width = 180 }: { width?: number }) {
  const { theme } = usePdfTheme();
  const h = 12;
  const mid = h / 2;
  const cx = width / 2;
  return (
    <Svg width={width} height={h}>
      <Line x1={0} y1={mid} x2={cx - 14} y2={mid} stroke={theme.coverAccent} strokeWidth={0.8} />
      <Line x1={cx + 14} y1={mid} x2={width} y2={mid} stroke={theme.coverAccent} strokeWidth={0.8} />
      <Diamond cx={cx} cy={mid} r={4} />
    </Svg>
  );
}

/** Standard header: brand mark left, title + meta right, thin accent rule. */
export function PdfHeader({
  title,
  meta,
  accent = "brand",
}: {
  title: React.ReactNode;
  meta?: string;
  accent?: "gold" | "brand";
}) {
  const { theme, styles } = usePdfTheme();
  const ruleColor = accent === "gold" ? theme.coverAccent : theme.primary;
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
        <Mark />
        <View>
          {title}
          {meta ? <Text style={styles.docSub}>{meta}</Text> : null}
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

/**
 * Numbered, table-style section: cover-colored header band ("1. Patient
 * Information") with a small accent rule, above a hairline-bordered white body.
 */
export function TableSection({
  number,
  title,
  children,
  wrap,
}: {
  /** A plain index, or a dotted string like "2.1" when several cases share a document. */
  number?: number | string;
  title: string;
  children: React.ReactNode;
  wrap?: boolean;
}) {
  const { styles } = usePdfTheme();
  return (
    <View style={styles.tableSection} wrap={wrap}>
      <View style={styles.tableHead} minPresenceAhead={60}>
        <View style={styles.tableHeadRule} />
        <Text style={styles.tableHeadTitle}>
          {number != null ? `${number}. ` : ""}
          {title}
        </Text>
      </View>
      <View style={styles.tableBody}>{children}</View>
    </View>
  );
}

/** A label/value table row inside a TableSection. */
export function TRow({ label, value, last }: { label: string; value?: string | null; last?: boolean }) {
  const { styles } = usePdfTheme();
  return (
    <View style={last ? styles.tRowLast : styles.tRow}>
      <Text style={styles.tLabel}>{label}</Text>
      <Text style={styles.tValue}>{value ? value : "—"}</Text>
    </View>
  );
}

/** Fixed footer with the company address, url and page numbers. Empty company
 *  lines are skipped — a fresh org may not have filled them in yet. */
export function PdfFooter() {
  const { theme, styles } = usePdfTheme();
  return (
    <>
      <View style={styles.footer} fixed>
        {theme.company.address ? <Text style={styles.bold}>{theme.company.address}</Text> : null}
        {theme.company.url ? (
          <Text style={{ color: theme.primary, marginTop: 2 }}>{theme.company.url}</Text>
        ) : null}
      </View>
      <Text
        style={styles.pageNumber}
        fixed
        render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`}
      />
    </>
  );
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
