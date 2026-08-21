import { describe, expect, it } from "vitest";
import { round2, round8, toCaseAmount } from "./fx";

/**
 * Pins the 0016 rounding contract: amount → 2dp, rate → 8dp, product → 2dp.
 * The server write (upsertPayment), the optimistic client rows and the DB
 * check constraint (|amount_case − amount·fx_rate| ≤ 0.01) all assume this
 * exact sequence — a drift here is a cent-level disagreement in real money.
 */
describe("fx rounding", () => {
  it("round2 / round8 round half away from zero at their precision", () => {
    expect(round2(10.005)).toBe(10.01);
    expect(round2(10.994)).toBe(10.99);
    expect(round8(1.123456789)).toBe(1.12345679);
  });

  it("toCaseAmount applies amount→2dp then rate→8dp then product→2dp", () => {
    // 10.999 → 11.00 first; a raw product (10.999 × 1.1 = 12.0989 → 12.10)
    // would differ from the sequenced result (11.00 × 1.1 = 12.10) elsewhere.
    expect(toCaseAmount(10.999, 1.1)).toBe(round2(round2(10.999) * round8(1.1)));
    expect(toCaseAmount(500, 1.08)).toBe(540);
    expect(toCaseAmount(0.01, 0.00000001)).toBe(0);
  });

  it("stays within the DB check tolerance for realistic magnitudes", () => {
    for (const [amount, rate] of [
      [1234.56, 0.03127411],
      [99999.99, 1.08],
      [7.77, 41.12345678],
    ] as const) {
      const stored = toCaseAmount(amount, rate);
      expect(Math.abs(stored - amount * rate)).toBeLessThanOrEqual(0.01);
    }
  });
});
