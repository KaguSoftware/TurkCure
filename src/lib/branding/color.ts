/**
 * Tiny pure hex-color helpers — the ONE derivation source for every brand
 * shade. The PDF theme (node), the app-accent <style> emitter (server) and the
 * org-settings live preview (client) all derive hover/soft/light/dark variants
 * through these, so the three surfaces can never disagree on what "10% darker"
 * means. No dependencies, no color spaces — simple sRGB mixing is all the
 * derived shades need.
 */

export function isHex6(value: unknown): value is string {
  return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value);
}

function channels(hex: string): [number, number, number] {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}

function toHex(r: number, g: number, b: number): string {
  const c = (n: number) => Math.round(Math.min(255, Math.max(0, n))).toString(16).padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}

/** Mix `a` toward `b` by t (0 = a, 1 = b). */
export function mix(a: string, b: string, t: number): string {
  const [ar, ag, ab] = channels(a);
  const [br, bg, bb] = channels(b);
  return toHex(ar + (br - ar) * t, ag + (bg - ag) * t, ab + (bb - ab) * t);
}

export function lighten(hex: string, t: number): string {
  return mix(hex, "#ffffff", t);
}

export function darken(hex: string, t: number): string {
  return mix(hex, "#000000", t);
}

/** CSS rgba() string from a hex color. */
export function rgba(hex: string, alpha: number): string {
  const [r, g, b] = channels(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** WCAG relative luminance (0 = black, 1 = white). */
export function relLuminance(hex: string): number {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  const [r, g, b] = channels(hex);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}
