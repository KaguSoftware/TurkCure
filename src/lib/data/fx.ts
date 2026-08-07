import { unstable_cache } from "next/cache";
import { cache } from "react";
import { CURRENCIES, type Currency } from "@/lib/utils";
import { FALLBACK_RATES_TO_USD, FX_RATES_AS_OF } from "@/lib/fx";

export interface FxSnapshot {
  /** Every rate in `rates` is expressed against this base. */
  base: Currency;
  rates: Record<Currency, number>;
  /** Publication date of the rates (YYYY-MM-DD). */
  date: string;
  source: "live" | "fallback";
}

/**
 * frankfurter.app: ECB reference rates, no key, no quota, open-source and
 * self-hostable if it ever disappears. exchangerate.host is now key-gated and
 * open.er-api.com has opaque provenance. ECB publishes once per business day
 * (~16:00 CET), so rates are daily-granular — the right resolution for a rate
 * being frozen onto an accounting row anyway.
 */
const FRANKFURTER = "https://api.frankfurter.app/latest?base=EUR&symbols=USD,GBP,TRY";

/**
 * Throws on any failure ON PURPOSE — `unstable_cache` must not memoize a
 * fallback for an hour just because the API blipped. The wrapper below catches.
 */
const getCachedFxRates = unstable_cache(
  async (): Promise<FxSnapshot> => {
    const res = await fetch(FRANKFURTER, {
      // Without this, Next's own fetch cache layers a second, uncontrolled TTL
      // underneath unstable_cache.
      cache: "no-store",
      // This is the app's first outbound fetch, on Vercel serverless — a hung
      // upstream would otherwise burn the whole function budget.
      signal: AbortSignal.timeout(2500),
    });
    if (!res.ok) throw new Error(`frankfurter ${res.status}`);
    const json = (await res.json()) as { date: string; rates: Record<string, number> };
    const rates = { EUR: 1, ...json.rates } as Record<Currency, number>;
    if (CURRENCIES.some((c) => !Number.isFinite(rates[c]) || rates[c] <= 0))
      throw new Error("frankfurter: incomplete rate set");
    return { base: "EUR", rates, date: json.date, source: "live" };
  },
  ["fx-rates-eur"],
  { tags: ["fx"], revalidate: 3600 }
);

/**
 * Never throws. Falls back to the hand-maintained table in lib/fx.ts so a dead
 * API degrades the prefill rather than blocking a payment from being recorded.
 */
export const getFxRates = cache(async (): Promise<FxSnapshot> => {
  try {
    return await getCachedFxRates();
  } catch {
    return {
      base: "EUR",
      // Re-base the USD-pegged fallback table onto EUR so the shape matches.
      rates: Object.fromEntries(
        CURRENCIES.map((c) => [c, FALLBACK_RATES_TO_USD.EUR / FALLBACK_RATES_TO_USD[c]])
      ) as Record<Currency, number>,
      date: FX_RATES_AS_OF,
      source: "fallback",
    };
  }
});

/** Cross rate: 1 `from` = N `to`. Pure. */
export function crossRate(snap: FxSnapshot, from: Currency, to: Currency): number {
  return snap.rates[to] / snap.rates[from];
}
