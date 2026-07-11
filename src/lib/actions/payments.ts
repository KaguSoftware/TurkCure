"use server";

import { revalidatePath } from "next/cache";
import { createClient, requireProfile, requireAdmin } from "@/lib/supabase/server";
import { CURRENCIES } from "@/lib/utils";

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

  const amount = Number(values.amount);
  if (!Number.isFinite(amount) || amount <= 0)
    return { error: "Enter an amount greater than zero." };

  const currency = String(values.currency ?? "");
  if (!CURRENCIES.includes(currency as (typeof CURRENCIES)[number]))
    return { error: "Invalid currency." };

  const paidAt = values.paid_at ? String(values.paid_at) : null;
  const dueDate = values.due_date ? String(values.due_date) : null;
  // Status is derived, never manual: paid date present ⇒ paid, else pending.
  const status = paidAt ? "paid" : "pending";

  const row = {
    case_id: values.case_id,
    direction,
    counterparty_type: counterpartyType,
    counterparty_id: counterpartyId,
    amount,
    currency,
    method: values.method ? String(values.method) : "",
    iban: values.iban ? String(values.iban) : "",
    due_date: dueDate,
    paid_at: paidAt,
    status,
    receipt_path: values.receipt_path ? String(values.receipt_path) : "",
    notes: values.notes ? String(values.notes) : "",
  };

  const { data, error } = id
    ? await supabase.from("payments").update(row).eq("id", id).select("*").single()
    : await supabase.from("payments").insert(row).select("*").single();
  if (error) return { error: error.message };

  revalidatePath(`/patients/${patientId}`);
  revalidatePath("/dashboard");
  revalidatePath("/finance");
  return { payment: data as unknown as Record<string, unknown> };
}

export async function deletePayment(patientId: string, id: string): Promise<{ error?: string }> {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("payments").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath(`/patients/${patientId}`);
  revalidatePath("/dashboard");
  revalidatePath("/finance");
  return {};
}
