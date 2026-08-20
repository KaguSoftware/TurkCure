import { describe, it, expect } from "vitest";
import { DEFAULT_PDF_THEME, orgToPdfTheme, orgToDocVars, type OrgBranding } from "./theme";

const DEFAULT_ORG: OrgBranding = {
  name: "TurkCure",
  logo_url: null,
  company_name: "Turkcure Health Tourism",
  whatsapp: "+90 552 112 99 52",
  website: "Turkcure.com",
  url: "https://turkcure.com",
  location: "Skyland, Istanbul",
  address: "Huzur, Azerbaycan Cd. B Blok No:48, 34475 Sarıyer/İstanbul",
  tagline: "Health Tourism · Istanbul",
  brand_primary: "#1d59d6",
  pdf_cover_bg: "#0b1f3f",
  pdf_cover_accent: "#c9a24b",
};

describe("orgToPdfTheme", () => {
  it("defaults-are-literal: an untouched org keeps the exact legacy hexes", () => {
    const t = orgToPdfTheme(DEFAULT_ORG);
    // Every derived value must be the stored legacy constant, not a re-derived
    // approximation of it — this is what keeps old PDFs byte-identical.
    expect(t.primary).toBe(DEFAULT_PDF_THEME.primary);
    expect(t.primaryDeep).toBe("#123a94");
    expect(t.markSecondary).toBe("#1aa0c8");
    expect(t.noteAccent).toBe("#0ea5a4");
    expect(t.accentSoft).toBe("#eef4ff");
    expect(t.coverBg).toBe("#0b1f3f");
    expect(t.coverAccent).toBe("#c9a24b");
    expect(t.coverAccentLight).toBe("#e6c87d");
    expect(t.coverAccentDark).toBe("#9a7a2e");
    expect(t.coverSoftBg).toBe("#faf3e0");
    // The text mark keeps the two-tone TurkCure split.
    expect(t.mark).toEqual({ kind: "text", text: "TurkCure", splitAt: 4 });
    expect(t.company.name).toBe("Turkcure Health Tourism");
  });

  it("derives a full family from a custom primary and cover pair", () => {
    const t = orgToPdfTheme({
      ...DEFAULT_ORG,
      name: "MediCare",
      company_name: "",
      brand_primary: "#0f766e",
      pdf_cover_bg: "#1c1917",
      pdf_cover_accent: "#dc2626",
    });
    expect(t.primary).toBe("#0f766e");
    expect(t.primaryDeep).not.toBe(DEFAULT_PDF_THEME.primaryDeep);
    expect(t.coverBg).toBe("#1c1917");
    expect(t.coverAccent).toBe("#dc2626");
    expect(t.coverAccentLight).not.toBe(DEFAULT_PDF_THEME.coverAccentLight);
    // company_name empty → display name is the printed name.
    expect(t.company.name).toBe("MediCare");
    // CamelCase names keep the two-tone treatment; the split generalizes.
    expect(t.mark).toEqual({ kind: "text", text: "MediCare", splitAt: 4 });
  });

  it("uses the logo when one is set, and single-color text for plain names", () => {
    const logo = orgToPdfTheme({ ...DEFAULT_ORG, logo_url: "https://x/logo.png" });
    expect(logo.mark).toEqual({ kind: "logo", url: "https://x/logo.png" });
    const plain = orgToPdfTheme({ ...DEFAULT_ORG, name: "Acme Clinic" });
    expect(plain.mark).toEqual({ kind: "text", text: "Acme Clinic", splitAt: null });
  });

  it("maps the editor sheet vars from the cover family", () => {
    const vars = orgToDocVars(DEFAULT_PDF_THEME);
    expect(vars["--doc-navy"]).toBe("#0b1f3f");
    expect(vars["--doc-gold"]).toBe("#c9a24b");
  });
});
