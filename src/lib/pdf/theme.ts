/**
 * The PDF brand theme: everything org-specific a document renders — company
 * strings, the brand mark, and the two color families (inner accents + cover).
 *
 * CLIENT-SAFE ON PURPOSE: imports only company.ts and the pure color helpers,
 * never common.tsx (which pulls node:fs for the fonts). buildCaseDoc runs in
 * the browser, and the org-settings preview derives shades from the same
 * functions — that is the whole point of this module existing apart.
 *
 * The defaults-are-literal rule: DEFAULT_PDF_THEME holds the exact historical
 * hex values, and orgToPdfTheme overrides a color FAMILY only when its base
 * column differs from the shipped default. An untouched org therefore renders
 * byte-identically to the pre-multi-tenant output — derived shades never get a
 * chance to drift a default document.
 */
import { COMPANY } from "./company";
import { darken, isHex6, mix, lighten } from "@/lib/branding/color";

export interface PdfCompany {
  name: string;
  whatsapp: string;
  website: string;
  location: string;
  address: string;
  url: string;
  tagline: string;
}

export type PdfMark =
  /** An uploaded logo image (public URL); react-pdf fetches it server-side. */
  | { kind: "logo"; url: string }
  /** Text mark. splitAt renders a two-tone CamelCase split ("Turk|Cure"). */
  | { kind: "text"; text: string; splitAt: number | null };

export interface PdfTheme {
  company: PdfCompany;
  mark: PdfMark;
  /** Inner-page accent family (links, headings, header rule). */
  primary: string;
  primaryDeep: string;
  accentSoft: string;
  noteAccent: string;
  /** Second half of a split text mark (legacy cyan). */
  markSecondary: string;
  /** Cover + section-band family (legacy navy/gold). */
  coverBg: string;
  coverAccent: string;
  coverAccentLight: string;
  coverAccentDark: string;
  coverSoftBg: string;
  /** Light text on the cover ground (warm white). */
  coverFg: string;
}

export const DEFAULT_BRAND_PRIMARY = "#1d59d6";
export const DEFAULT_COVER_BG = "#0b1f3f";
export const DEFAULT_COVER_ACCENT = "#c9a24b";

export const DEFAULT_PDF_THEME: PdfTheme = {
  company: { ...COMPANY, tagline: "Health Tourism · Istanbul" },
  mark: { kind: "text", text: "TurkCure", splitAt: 4 },
  primary: DEFAULT_BRAND_PRIMARY, // BLUE
  primaryDeep: "#123a94", // BLUE_DEEP
  accentSoft: "#eef4ff", // ACCENT_SOFT
  noteAccent: "#0ea5a4", // TEAL
  markSecondary: "#1aa0c8", // CYAN
  coverBg: DEFAULT_COVER_BG, // NAVY
  coverAccent: DEFAULT_COVER_ACCENT, // GOLD
  coverAccentLight: "#e6c87d", // GOLD_LIGHT
  coverAccentDark: "#9a7a2e", // GOLD_DARK
  coverSoftBg: "#faf3e0", // GOLD_SOFT_BG
  coverFg: "#f5f1e6",
};

/** The branding slice of an organizations row this module needs. */
export interface OrgBranding {
  name: string;
  logo_url: string | null;
  company_name: string;
  whatsapp: string;
  website: string;
  url: string;
  location: string;
  address: string;
  tagline: string;
  brand_primary: string;
  pdf_cover_bg: string;
  pdf_cover_accent: string;
}

/** "MediCare" → 4 (two-tone split point); "Acme" / "ACME" / "med" → null. */
function camelSplit(name: string): number | null {
  const m = /^([A-Z][a-z]+)[A-Z].*$/.exec(name.trim());
  return m ? m[1].length : null;
}

export function orgToPdfTheme(org: OrgBranding): PdfTheme {
  const theme: PdfTheme = {
    ...DEFAULT_PDF_THEME,
    company: {
      name: org.company_name || org.name,
      whatsapp: org.whatsapp,
      website: org.website,
      location: org.location,
      address: org.address,
      url: org.url,
      tagline: org.tagline,
    },
    mark: org.logo_url
      ? { kind: "logo", url: org.logo_url }
      : { kind: "text", text: org.name, splitAt: camelSplit(org.name) },
  };

  if (isHex6(org.brand_primary) && org.brand_primary.toLowerCase() !== DEFAULT_BRAND_PRIMARY) {
    const p = org.brand_primary;
    theme.primary = p;
    theme.primaryDeep = darken(p, 0.35);
    theme.accentSoft = mix(p, "#ffffff", 0.92);
    theme.noteAccent = p;
    theme.markSecondary = lighten(p, 0.3);
  }

  const bgCustom = isHex6(org.pdf_cover_bg) && org.pdf_cover_bg.toLowerCase() !== DEFAULT_COVER_BG;
  const accentCustom =
    isHex6(org.pdf_cover_accent) && org.pdf_cover_accent.toLowerCase() !== DEFAULT_COVER_ACCENT;
  if (bgCustom || accentCustom) {
    const accent = accentCustom ? org.pdf_cover_accent : DEFAULT_COVER_ACCENT;
    theme.coverBg = bgCustom ? org.pdf_cover_bg : DEFAULT_COVER_BG;
    theme.coverAccent = accent;
    theme.coverAccentLight = mix(accent, "#ffffff", 0.35);
    theme.coverAccentDark = darken(accent, 0.3);
    theme.coverSoftBg = mix(accent, "#ffffff", 0.9);
    // coverFg stays warm-white: the write action enforces a dark cover ground.
  }

  return theme;
}

/**
 * The editor sheet's --doc-* variables from the same theme, so the on-screen
 * document chrome tracks the PDF it previews. Only the themed five — the
 * neutral sheet vars (--doc-line/-tint/-ink/-muted/-focus*) stay literal in
 * editor.css. Values are literal hexes, never var() references: the sheet must
 * stay immune to app dark-mode tokens.
 */
export function orgToDocVars(theme: PdfTheme): Record<string, string> {
  return {
    "--doc-navy": theme.coverBg,
    "--doc-gold": theme.coverAccent,
    "--doc-gold-light": theme.coverAccentLight,
    "--doc-gold-dark": theme.coverAccentDark,
    "--doc-gold-soft": theme.coverSoftBg,
  };
}
