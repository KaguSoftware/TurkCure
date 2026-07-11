"use server";

import { revalidatePath } from "next/cache";
import { createClient, createAdminClient, requireProfile } from "@/lib/supabase/server";
import { addDays, formatISO } from "date-fns";
import type { SupabaseClient } from "@supabase/supabase-js";

function revalidateCase(patientId: string) {
  revalidatePath(`/patients/${patientId}`);
  revalidatePath("/dashboard");
}

/**
 * Rebuild the arrival/operation/aftercare reminders for a case from its dates.
 * Deletes existing open ones of those types first so it stays idempotent.
 */
async function regenerateCaseReminders(
  supabase: SupabaseClient,
  caseId: string,
  patientId: string,
  arrival: string | null,
  surgery: string | null
) {
  const { data: patient } = await supabase
    .from("patients")
    .select("full_name, assigned_agent_id")
    .eq("id", patientId)
    .single();
  if (!patient) return;

  await supabase
    .from("reminders")
    .delete()
    .eq("case_id", caseId)
    .is("done_at", null)
    .in("type", ["arrival", "operation", "aftercare"]);

  const reminders: Record<string, unknown>[] = [];
  if (arrival) {
    reminders.push({
      type: "arrival",
      case_id: caseId,
      patient_id: patientId,
      title: `${patient.full_name} arrives tomorrow`,
      due_at: formatISO(addDays(new Date(arrival), -1)),
      assigned_to: patient.assigned_agent_id,
    });
  }
  if (surgery) {
    reminders.push(
      {
        type: "operation",
        case_id: caseId,
        patient_id: patientId,
        title: `${patient.full_name} — operation day`,
        due_at: formatISO(new Date(surgery)),
        assigned_to: patient.assigned_agent_id,
      },
      {
        type: "aftercare",
        case_id: caseId,
        patient_id: patientId,
        title: `${patient.full_name} — 1 week aftercare check-in`,
        due_at: formatISO(addDays(new Date(surgery), 7)),
        assigned_to: patient.assigned_agent_id,
      },
      {
        type: "aftercare",
        case_id: caseId,
        patient_id: patientId,
        title: `${patient.full_name} — 1 month aftercare check-in`,
        due_at: formatISO(addDays(new Date(surgery), 30)),
        assigned_to: patient.assigned_agent_id,
      }
    );
  }
  if (reminders.length) await supabase.from("reminders").insert(reminders);
}

export async function upsertCase(
  patientId: string,
  values: Record<string, unknown>,
  id?: string
): Promise<{ error?: string; id?: string }> {
  await requireProfile();
  const supabase = await createClient();
  let caseId = id;
  if (id) {
    const { error } = await supabase.from("cases").update(values).eq("id", id);
    if (error) return { error: error.message };
  } else {
    const { data, error } = await supabase
      .from("cases")
      .insert({ ...values, patient_id: patientId })
      .select("id")
      .single();
    if (error) return { error: error.message };
    caseId = data.id;
  }

  if (caseId) {
    await regenerateCaseReminders(
      supabase,
      caseId,
      patientId,
      (values.arrival_date as string | null) ?? null,
      (values.surgery_date as string | null) ?? null
    );
  }

  revalidateCase(patientId);
  return { id: caseId };
}

/**
 * Mark a case completed and refresh its reminders. This is the write-heavy
 * "Done" action, deliberately separate from downloading the PDF (which is
 * read-only) so the two are no longer coupled in the UI.
 */
export async function completeCase(
  patientId: string,
  caseId: string
): Promise<{ error?: string }> {
  await requireProfile();
  const supabase = await createClient();
  const { data: caseRow, error } = await supabase
    .from("cases")
    .update({ status: "completed" })
    .eq("id", caseId)
    .select("arrival_date, surgery_date")
    .single();
  if (error) return { error: error.message };

  await regenerateCaseReminders(
    supabase,
    caseId,
    patientId,
    caseRow.arrival_date,
    caseRow.surgery_date
  );

  revalidateCase(patientId);
  return {};
}

/**
 * Quote items are written via the service-role client because direct table access
 * is admin-only under RLS (the cost column). Agents may set price but never cost:
 * for agents the cost field is discarded server-side.
 */
export async function upsertQuoteItem(
  patientId: string,
  caseId: string,
  values: { kind: string; description: string; price: number; cost?: number; sort_order?: number },
  id?: string
): Promise<{ error?: string; item?: Record<string, unknown> }> {
  const profile = await requireProfile();
  const admin = createAdminClient();

  const row: Record<string, unknown> = {
    kind: values.kind,
    description: values.description,
    price: values.price,
    sort_order: values.sort_order ?? 0,
  };
  if (profile.role === "admin" && values.cost !== undefined) row.cost = values.cost;

  const columns = profile.role === "admin" ? QUOTE_COLUMNS_ADMIN : QUOTE_COLUMNS_AGENT;
  const { data, error } = id
    ? await admin.from("quote_items").update(row).eq("id", id).select(columns).single()
    : await admin.from("quote_items").insert({ ...row, case_id: caseId }).select(columns).single();
  if (error) return { error: error.message };
  revalidateCase(patientId);
  return { item: data as unknown as Record<string, unknown> };
}

export async function deleteQuoteItem(patientId: string, id: string): Promise<{ error?: string }> {
  await requireProfile();
  const admin = createAdminClient();
  const { error } = await admin.from("quote_items").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidateCase(patientId);
  return {};
}

const QUOTE_COLUMNS_ADMIN = "id, case_id, kind, description, cost, price, sort_order";
const QUOTE_COLUMNS_AGENT = "id, case_id, kind, description, price, sort_order";

/** Quote items for a case; cost included only for admins. */
export async function getQuoteItems(caseId: string) {
  const profile = await requireProfile();
  const admin = createAdminClient();
  const columns = profile.role === "admin" ? QUOTE_COLUMNS_ADMIN : QUOTE_COLUMNS_AGENT;
  const { data } = await admin
    .from("quote_items")
    .select(columns)
    .eq("case_id", caseId)
    .order("sort_order")
    .order("created_at");
  return data ?? [];
}

/**
 * Quote items for many cases in a single query, grouped by case_id.
 * Avoids the N+1 round-trips (and repeated profile lookups) of calling
 * getQuoteItems per case. Cost included only for admins.
 */
export async function getQuoteItemsForCases(
  caseIds: string[]
): Promise<Record<string, Record<string, unknown>[]>> {
  const byCase: Record<string, Record<string, unknown>[]> = {};
  for (const id of caseIds) byCase[id] = [];
  if (caseIds.length === 0) return byCase;

  const profile = await requireProfile();
  const admin = createAdminClient();
  const columns = profile.role === "admin" ? QUOTE_COLUMNS_ADMIN : QUOTE_COLUMNS_AGENT;
  const { data } = await admin
    .from("quote_items")
    .select(columns)
    .in("case_id", caseIds)
    .order("sort_order")
    .order("created_at");

  for (const row of (data ?? []) as unknown as Record<string, unknown>[]) {
    const cid = row.case_id as string;
    (byCase[cid] ??= []).push(row);
  }
  return byCase;
}

/**
 * Same as getQuoteItemsForCases but keyed by patient, so the patient detail
 * page can fetch quote items in parallel with the cases query instead of
 * waiting for case ids. Cost included only for admins.
 */
export async function getQuoteItemsForPatient(
  patientId: string
): Promise<Record<string, Record<string, unknown>[]>> {
  const profile = await requireProfile();
  const admin = createAdminClient();
  const columns = profile.role === "admin" ? QUOTE_COLUMNS_ADMIN : QUOTE_COLUMNS_AGENT;
  const { data } = await admin
    .from("quote_items")
    .select(`${columns}, cases!inner(patient_id)`)
    .eq("cases.patient_id", patientId)
    .order("sort_order")
    .order("created_at");

  const byCase: Record<string, Record<string, unknown>[]> = {};
  for (const row of (data ?? []) as unknown as Record<string, unknown>[]) {
    delete row.cases;
    const cid = row.case_id as string;
    (byCase[cid] ??= []).push(row);
  }
  return byCase;
}

export async function attachInstruction(
  patientId: string,
  caseId: string,
  templateId: string
): Promise<{ error?: string; instruction?: Record<string, unknown> }> {
  await requireProfile();
  const supabase = await createClient();
  const { data: template, error: tErr } = await supabase
    .from("instruction_templates")
    .select("title, body_md")
    .eq("id", templateId)
    .single();
  if (tErr || !template) return { error: "Template not found" };
  const { data, error } = await supabase
    .from("case_instructions")
    .insert({
      case_id: caseId,
      template_id: templateId,
      title: template.title,
      body_md: template.body_md,
    })
    .select("*")
    .single();
  if (error) return { error: error.message };
  revalidateCase(patientId);
  return { instruction: data as unknown as Record<string, unknown> };
}

export async function updateInstruction(
  patientId: string,
  id: string,
  body_md: string
): Promise<{ error?: string }> {
  await requireProfile();
  const supabase = await createClient();
  const { error } = await supabase.from("case_instructions").update({ body_md }).eq("id", id);
  if (error) return { error: error.message };
  revalidateCase(patientId);
  return {};
}

export async function removeInstruction(patientId: string, id: string): Promise<{ error?: string }> {
  await requireProfile();
  const supabase = await createClient();
  const { error } = await supabase.from("case_instructions").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidateCase(patientId);
  return {};
}
