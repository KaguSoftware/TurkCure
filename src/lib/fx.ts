import type { Currency } from "@/lib/utils";

/**
 * Approximate mid-market rates to USD, used only for the aggregate "All"
 * finance view. The app is local-only (no live FX fetch), so these are
 * hand-maintained — update RATES and FX_RATES_AS_OF together, and the Finance
 * page surfaces the date so nobody trusts stale numbers.
 */
export const FX_RATES_AS_OF = "2026-07-09";

const RATES_TO_USD: Record<Currency, number> = {
  USD: 1,
  EUR: 1.08,
  GBP: 1.27,
  TRY: 0.03,
};

/** Convert an amount to USD. Unknown currencies are treated as USD 1:1. */
export function toUsd(amount: number, currency: string): number {
  return amount * (RATES_TO_USD[currency as Currency] ?? 1);
}
