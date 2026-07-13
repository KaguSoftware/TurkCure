import { unstable_cache } from "next/cache";
import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/server";

export interface FinanceRow {
  id: string;
  patient_id: string | null;
  patient_name: string;
  operation: string;
  currency: string;
  status: string;
  month: string;
  revenue: number;
  cost: number;
  collected: number;
}

/**
 * Per-case finance rows from the finance_case_rows() aggregate. This is the
 * heaviest query in the app (it scans every non-cancelled case), so it's cached
 * across requests via `unstable_cache`. It's admin-only and tolerant of a few
 * minutes' staleness. Invalidated by the "finance" tag, which the payment and
 * case/quote-item write actions raise; the 5-minute revalidate is a safety net
 * (and covers indirect edits like patient renames). The admin client is used
 * because unstable_cache callbacks can't read cookies — the finance page already
 * gates on an admin profile before calling this.
 */
const getCachedFinanceRows = unstable_cache(
  async (): Promise<FinanceRow[]> => {
    const admin = createAdminClient();
    const { data } = await admin.rpc("finance_case_rows");
    return (data ?? []) as FinanceRow[];
  },
  ["finance-case-rows"],
  { tags: ["finance"], revalidate: 300 }
);

export const getFinanceRows = cache(getCachedFinanceRows);
