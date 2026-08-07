import type { Currency } from "@/lib/utils";

/**
 * Offline fallback rates. Live rates come from `lib/data/fx.ts` (frankfurter.app);
 * this hand-maintained table is only what that module falls back to when the API
 * is unreachable, and what the aggregate "All" finance view uses. Update RATES
 * and FX_RATES_AS_OF together — the Finance page surfaces the date so nobody
 * trusts stale numbers.
 *
 * Kept pure and IO-free on purpose: `finance-view.tsx` is a client component and
 * imports this.
 */
export const FX_RATES_AS_OF = "2026-07-09";

export const FALLBACK_RATES_TO_USD: Record<Currency, number> = {
  USD: 1,
  EUR: 1.08,
  GBP: 1.27,
  TRY: 0.03,
};

/** Convert an amount to USD. Unknown currencies are treated as USD 1:1. */
export function toUsd(
  amount: number,
  currency: string,
  rates: Record<Currency, number> = FALLBACK_RATES_TO_USD
): number {
  return amount * (rates[currency as Currency] ?? 1);
}
