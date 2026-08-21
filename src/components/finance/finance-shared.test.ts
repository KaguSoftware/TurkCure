import { describe, expect, it } from "vitest";
import { monthLabel } from "./finance-shared";

/** Regression: `new Date("2026-08-01")` is UTC midnight, so the old
 *  toLocaleDateString label showed "Jul" to viewers west of UTC. */
describe("monthLabel", () => {
  it("formats from the string, immune to timezone", () => {
    expect(monthLabel("2026-08")).toBe("Aug 26");
    expect(monthLabel("2025-01")).toBe("Jan 25");
    expect(monthLabel("2025-12")).toBe("Dec 25");
  });
});
