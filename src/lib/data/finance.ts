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
  paid_out: number;
  hospital_id: string | null;
  hospital_name: string;
  doctor_id: string | null;
  doctor_name: string;
  source: string;
  country: string | null;
}

export interface FinancePaymentRow {
  id: string;
  case_id: string;
  patient_id: string | null;
  patient_name: string;
  case_currency: string;
  direction: "in" | "out";
  counterparty_type: string;
  counterparty_name: string;
  amount: number;
  currency: string;
  amount_case: number;
  status: string;
  due_date: string | null;
  paid_at: string | null;
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

/**
 * Flat per-payment feed (finance_payment_rows): the client derives the
 * cash-basis chart, period totals, receivables aging and payables grouping from
 * this one list. Same caching story as the case rows — the "finance" tag is
 * raised by every payment/case/quote-item/patient write, so both feeds stay in
 * lockstep. Tolerates a not-yet-applied migration by returning [].
 */
const getCachedFinancePayments = unstable_cache(
  async (): Promise<FinancePaymentRow[]> => {
    const admin = createAdminClient();
    const { data } = await admin.rpc("finance_payment_rows");
    return (data ?? []) as FinancePaymentRow[];
  },
  ["finance-payment-rows"],
  { tags: ["finance"], revalidate: 300 }
);

export const getFinancePayments = cache(getCachedFinancePayments);
