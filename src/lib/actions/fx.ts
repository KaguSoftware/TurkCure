"use server";

import { requireProfile } from "@/lib/supabase/server";
import { getFxRates, crossRate } from "@/lib/data/fx";
import { CURRENCIES, type Currency } from "@/lib/utils";

/**
 * Today's rate for the payment dialog's prefill: 1 `from` = N `to`.
 *
 * Called only from an open dialog, never on a render path — a slow or dead
 * upstream must never delay a page. The caller treats a failure as "no prefill",
 * not as a blocked save; the rate field stays editable either way.
 */
export async function getLiveRate(
  from: string,
  to: string
): Promise<{ rate?: number; asOf?: string; source?: "live" | "fallback"; error?: string }> {
  await requireProfile();
  if (!CURRENCIES.includes(from as Currency) || !CURRENCIES.includes(to as Currency))
    return { error: "Unsupported currency." };
  const snap = await getFxRates();
  return {
    rate: Number(crossRate(snap, from as Currency, to as Currency).toFixed(8)),
    asOf: snap.date,
    source: snap.source,
  };
}
