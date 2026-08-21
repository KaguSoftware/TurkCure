"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { createClient, requireProfile, requireAdmin } from "@/lib/supabase/server";
import { CURRENCIES } from "@/lib/utils";
import { round2, round8, toCaseAmount } from "@/lib/fx";

const DIRECTIONS = ["in", "out"] as const;
const COUNTERPARTY_TYPES = ["patient", "doctor", "hospital", "hotel", "driver"] as const;
const PROVIDER_TYPES = ["doctor", "hospital", "hotel", "driver"] as const;

/**
 * Normalize + validate a payment before writing. Enforces the rules the UI is
 * supposed to guarantee (incoming ⇒ patient, outgoing ⇒ provider), derives
 * status from paid_at (a payment is "paid" once it has a paid date), and blocks
 * agents from writing doctor-payout rows (which they can't read either).
 */
export async function upsertPayment(
  patientId: string,
  values: Record<string, unknown>,
  id?: string
): Promise<{ error?: string; payment?: Record<string, unknown> }> {
  const profile = await requireProfile();
  const supabase = await createClient();

  const direction = String(values.direction ?? "");
  if (!DIRECTIONS.includes(direction as (typeof DIRECTIONS)[number]))
    return { error: "Invalid payment direction." };

  // Direction dictates counterparty: incoming is always from the patient,
  // outgoing is always to a provider.
  const counterpartyType =
    direction === "in" ? "patient" : String(values.counterparty_type ?? "");
  if (!COUNTERPARTY_TYPES.includes(counterpartyType as (typeof COUNTERPARTY_TYPES)[number]))
    return { error: "Invalid counterparty type." };
  if (direction === "out" && !PROVIDER_TYPES.includes(counterpartyType as (typeof PROVIDER_TYPES)[number]))
    return { error: "Outgoing payments must go to a provider." };

  // Doctor payouts are confidential: only admins may create/edit them.
  if (counterpartyType === "doctor" && profile.role !== "admin")
    return { error: "Only admins can record doctor payouts." };

  const counterpartyId =
    counterpartyType === "patient" ? null : (values.counterparty_id ? String(values.counterparty_id) : null);
  if (counterpartyType !== "patient" && !counterpartyId)
    return { error: `Select which ${counterpartyType} this payment is for.` };

  // counterparty_id has no FK (the target table depends on the type), so the
  // composite-FK net (0023) can't catch a stale or cross-org id here — check it
  // against the caller's own directory via RLS instead.
  if (counterpartyId) {
    const table = `${counterpartyType}s` as "doctors" | "hospitals" | "hotels" | "drivers";
    const { data: cp } = await supabase.from(table).select("id").eq("id", counterpartyId).maybeSingle();
    if (!cp) return { error: `That ${counterpartyType} no longer exists.` };
  }

  const amount = Number(values.amount);
  if (!Number.isFinite(amount) || amount <= 0)
    return { error: "Enter an amount greater than zero." };
  // numeric(12,2) tops out at 10 digits before the point — reject early with a
  // friendly message instead of surfacing a raw Postgres overflow.
  if (amount > 9_999_999_999)
    return { error: "That amount is too large." };

  const currency = String(values.currency ?? "");
  if (!CURRENCIES.includes(currency as (typeof CURRENCIES)[number]))
    return { error: "Invalid currency." };

  // A payment may be recorded in any currency; the rate that expresses it in the
  // CASE currency is frozen onto the row so history never re-rates. The case
  // currency is read here rather than trusted from the client — it is the
  // authority for "the rate must be 1".
  // The patient fence matters: revalidation and the money tab are keyed by
  // patientId, so a payment attached to another patient's case would both be
  // wrong and invisibly cached.
  const caseId = String(values.case_id ?? "");
  const { data: caseRow } = await supabase
    .from("cases")
    .select("currency")
    .eq("id", caseId)
    .eq("patient_id", patientId)
    .single();
  if (!caseRow) return { error: "Case not found." };

  const sameCurrency = currency === caseRow.currency;
  // Forced rather than validated when the currencies match: the form hides the
  // field in that case, so there is nothing for the user to get wrong.
  const rawRate = sameCurrency ? 1 : Number(values.fx_rate);
  if (!sameCurrency) {
    if (!Number.isFinite(rawRate) || rawRate <= 0)
      return { error: `Enter a conversion rate from ${currency} to ${caseRow.currency}.` };
    // An inverted entry (e.g. EUR→TRY typed where TRY→EUR was wanted) produces a
    // plausible-looking number, not a crash — catch the obvious end of it.
    if (rawRate > 1_000_000)
      return {
        error: `That rate looks inverted — enter how many ${caseRow.currency} one ${currency} buys.`,
      };
  }

  // The 0016 rounding rule lives in lib/fx.ts so the client's optimistic row,
  // this write and the DB check constraint all agree.
  const fxRate = round8(rawRate);
  const amount2 = round2(amount);
  const amountCase = toCaseAmount(amount, rawRate);

  const paidAt = values.paid_at ? String(values.paid_at) : null;
  const dueDate = values.due_date ? String(values.due_date) : null;
  // Status is derived, never manual: paid date present ⇒ paid, else pending.
  const status = paidAt ? "paid" : "pending";

  const row = {
    case_id: caseId,
    direction,
    counterparty_type: counterpartyType,
    counterparty_id: counterpartyId,
    amount: amount2,
    currency,
    fx_rate: fxRate,
    amount_case: amountCase,
    method: values.method ? String(values.method) : "",
    iban: values.iban ? String(values.iban) : "",
    due_date: dueDate,
    paid_at: paidAt,
    status,
    receipt_path: values.receipt_path ? String(values.receipt_path) : "",
    notes: values.notes ? String(values.notes) : "",
  };

  // On update the id must already belong to this case — otherwise an edit could
  // re-point a payment at a case whose currency was never validated against it.
  const { data, error } = id
    ? await supabase
        .from("payments")
        .update(row)
        .eq("id", id)
        .eq("case_id", caseId)
        .select("*")
        .single()
    : await supabase.from("payments").insert(row).select("*").single();
  if (error) return { error: error.message };

  revalidatePath(`/patients/${patientId}`);
  revalidatePath("/dashboard");
  revalidatePath("/finance");
  revalidateTag(`finance:${profile.org_id}`, "max");
  return { payment: data as unknown as Record<string, unknown> };
}

export async function deletePayment(patientId: string, id: string): Promise<{ error?: string }> {
  const profile = await requireAdmin();
  const supabase = await createClient();
  // Fence the payment to this patient before deleting — the revalidated paths
  // are keyed by patientId, so a mismatched id would delete real money while
  // busting the wrong page.
  const { data: owned } = await supabase
    .from("payments")
    .select("id, cases!inner(patient_id)")
    .eq("id", id)
    .eq("cases.patient_id", patientId)
    .maybeSingle();
  if (!owned) return { error: "Payment not found." };
  // .select("id") surfaces a 0-row delete as an error rather than a silent
  // success (same pattern as deleteQuoteItem).
  const { data, error } = await supabase.from("payments").delete().eq("id", id).select("id");
  if (error) return { error: error.message };
  if (!data?.length) return { error: "Payment not found." };
  revalidatePath(`/patients/${patientId}`);
  revalidatePath("/dashboard");
  revalidatePath("/finance");
  revalidateTag(`finance:${profile.org_id}`, "max");
  return {};
}
