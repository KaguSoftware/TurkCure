import { describe, it, expect } from "vitest";
import { isHex6, mix, lighten, darken, rgba, relLuminance } from "./color";

describe("branding/color", () => {
  it("validates hex strings strictly", () => {
    expect(isHex6("#1d59d6")).toBe(true);
    expect(isHex6("#1D59D6")).toBe(true);
    expect(isHex6("#fff")).toBe(false);
    expect(isHex6("1d59d6")).toBe(false);
    expect(isHex6(null)).toBe(false);
  });

  it("mixes toward the endpoints", () => {
    expect(mix("#000000", "#ffffff", 0)).toBe("#000000");
    expect(mix("#000000", "#ffffff", 1)).toBe("#ffffff");
    expect(mix("#000000", "#ffffff", 0.5)).toBe("#808080");
    expect(lighten("#000000", 1)).toBe("#ffffff");
    expect(darken("#ffffff", 1)).toBe("#000000");
  });

  it("formats rgba and computes luminance monotonically", () => {
    expect(rgba("#1d59d6", 0.35)).toBe("rgba(29, 89, 214, 0.35)");
    expect(relLuminance("#ffffff")).toBeCloseTo(1);
    expect(relLuminance("#000000")).toBeCloseTo(0);
    // The cover-bg guard relies on dark colors scoring low.
    expect(relLuminance("#0b1f3f")).toBeLessThan(0.35);
    expect(relLuminance("#f5f5dc")).toBeGreaterThan(0.35);
  });
});
