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
 * Per-case finance rows from the finance_case_rows(p_org) aggregate. This is
 * the heaviest query in the app, so it's cached across requests via
 * `unstable_cache` — per organization: orgId is in the cache key and the tag is
 * `finance:<orgId>`, raised by that org's payment and case/quote-item write
 * actions. The 5-minute revalidate is a safety net (and covers indirect edits
 * like patient renames). The RPC is SECURITY DEFINER with execute revoked from
 * user roles, so the org boundary is the p_org argument itself — RLS never
 * sees this query. The finance page gates on an admin profile and passes its
 * own profile.org_id.
 */
const cachedFinanceRows = (orgId: string) =>
  unstable_cache(
    async (): Promise<FinanceRow[]> => {
      const admin = createAdminClient();
      const { data, error } = await admin.rpc("finance_case_rows", { p_org: orgId });
      // Throw INSIDE the cached fn (same stance as data/fx.ts): a transient
      // failure must error the page, never be memoized as "€0 revenue" for 5 min.
      if (error) throw new Error(`finance_case_rows failed: ${error.message}`);
      return (data ?? []) as FinanceRow[];
    },
    ["finance-case-rows", orgId],
    { tags: [`finance:${orgId}`], revalidate: 300 }
  );

export const getFinanceRows = cache(async (orgId: string) => cachedFinanceRows(orgId)());

/**
 * Flat per-payment feed (finance_payment_rows): the client derives the
 * cash-basis chart, period totals, receivables aging and payables grouping from
 * this one list. Same per-org caching story as the case rows — one tag keeps
 * both feeds in lockstep.
 */
const cachedFinancePayments = (orgId: string) =>
  unstable_cache(
    async (): Promise<FinancePaymentRow[]> => {
      const admin = createAdminClient();
      const { data, error } = await admin.rpc("finance_payment_rows", { p_org: orgId });
      if (error) throw new Error(`finance_payment_rows failed: ${error.message}`);
      return (data ?? []) as FinancePaymentRow[];
    },
    ["finance-payment-rows", orgId],
    { tags: [`finance:${orgId}`], revalidate: 300 }
  );

export const getFinancePayments = cache(async (orgId: string) => cachedFinancePayments(orgId)());
