import { darken, isHex6, lighten, mix, relLuminance, rgba } from "@/lib/branding/color";
import { DEFAULT_BRAND_PRIMARY } from "@/lib/pdf/theme";
import type { Organization } from "@/lib/types";

/**
 * Emits the org's accent as a <style> tag scoped to [data-accent-root] — a
 * server component, no client JS. A style TAG rather than an inline style
 * because the dark set needs a `.dark` ancestor selector, which inline custom
 * properties cannot express (next-themes toggles `.dark` on <html>).
 *
 * Defaults-are-literal: while brand_primary is the shipped default this emits
 * NOTHING, so the app keeps its exact original palette (the app's default blue
 * #2563eb is deliberately not the PDF blue — don't "unify" them here).
 *
 * Rendered only when the user's personal accent_theme is "default" (Company
 * colors): the four .theme-* classes remain a personal override, and skipping
 * the tag entirely is what avoids a specificity fight with them.
 */
export function OrgAccentStyle({ org }: { org: Organization }) {
  const p = org.brand_primary;
  if (!isHex6(p) || p.toLowerCase() === DEFAULT_BRAND_PRIMARY) return null;

  // Derivations mirror the relationships between :root and the .theme-* blocks
  // in globals.css; all values are validated hex/rgba built by our own helpers.
  const darkPrimary = lighten(p, 0.25);
  const fgFor = (bg: string) => (relLuminance(bg) > 0.55 ? "#0f172a" : "#ffffff");
  const light = [
    `--brand-blue:${p}`,
    `--brand-teal:${lighten(p, 0.12)}`,
    `--brand-green:${lighten(p, 0.24)}`,
    `--primary:${p}`,
    `--primary-hover:${darken(p, 0.15)}`,
    `--primary-soft:${mix(p, "#ffffff", 0.92)}`,
    `--primary-fg:${fgFor(p)}`,
    `--ring:${rgba(p, 0.35)}`,
  ].join(";");
  const dark = [
    `--brand-blue:${darkPrimary}`,
    `--brand-teal:${lighten(p, 0.34)}`,
    `--brand-green:${lighten(p, 0.45)}`,
    `--primary:${darkPrimary}`,
    `--primary-hover:${lighten(p, 0.4)}`,
    `--primary-soft:${mix(p, "#0c1017", 0.85)}`,
    `--primary-fg:${fgFor(darkPrimary)}`,
    `--ring:${rgba(darkPrimary, 0.4)}`,
  ].join(";");

  return <style>{`[data-accent-root]{${light}}.dark [data-accent-root]{${dark}}`}</style>;
}
