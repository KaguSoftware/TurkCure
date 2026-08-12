"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { createClient, createAdminClient, requireProfile } from "@/lib/supabase/server";
import { addDays, formatISO } from "date-fns";
import type { SupabaseClient } from "@supabase/supabase-js";

function revalidateCase(patientId: string) {
  revalidatePath(`/patients/${patientId}`);
  revalidatePath("/dashboard");
  // Case/quote-item edits change revenue/cost; bust the cached finance rows.
  revalidateTag("finance", "max");
}

/** The reminder types this function owns — deleted and rebuilt on every run, so
 *  anything hand-created (follow_up, payment) is never touched. */
const GENERATED_REMINDER_TYPES = [
  "arrival",
  "operation",
  "aftercare",
  "hospital",
  "departure",
] as const;

/**
 * The date columns a case reminder can be generated from. Not exported — a
 * "use server" module may only export async functions.
 */
interface CaseSchedule {
  arrival_date: string | null;
  surgery_date: string | null;
  departure_date: string | null;
  hospital_checkin: string | null;
  hospital_checkout: string | null;
}

const CASE_SCHEDULE_COLUMNS =
  "arrival_date, surgery_date, departure_date, hospital_checkin, hospital_checkout";

/**
 * Rebuild every date-derived reminder for a case. Deletes the open generated
 * ones first so it stays idempotent — run it as often as you like; only
 * hand-written reminders survive, and anything already ticked off is left alone.
 *
 * Returns how many were written, so the UI can say something truthful.
 */
async function regenerateCaseReminders(
  supabase: SupabaseClient,
  caseId: string,
  patientId: string,
  schedule: CaseSchedule
): Promise<number> {
  const { data: patient } = await supabase
    .from("patients")
    .select("full_name, assigned_agent_id")
    .eq("id", patientId)
    .single();
  if (!patient) return 0;

  await supabase
    .from("reminders")
    .delete()
    .eq("case_id", caseId)
    .is("done_at", null)
    .in("type", GENERATED_REMINDER_TYPES);

  const name = patient.full_name;
  const base = { case_id: caseId, patient_id: patientId, assigned_to: patient.assigned_agent_id };
  const at = (date: string, offsetDays = 0) =>
    formatISO(offsetDays ? addDays(new Date(date), offsetDays) : new Date(date));

  // Every entry is [date, type, title, offset] — one table rather than five
  // near-identical if-blocks, so adding a date column is a one-line change.
  const plan: [string | null, string, string, number?][] = [
    // Arrival fires the day before: it's a "get ready" nudge, not a log entry.
    [schedule.arrival_date, "arrival", `${name} arrives tomorrow`, -1],
    [schedule.hospital_checkin, "hospital", `${name} — hospital check-in`],
    [schedule.surgery_date, "operation", `${name} — operation day`],
    [schedule.hospital_checkout, "hospital", `${name} — hospital check-out`],
    [schedule.departure_date, "departure", `${name} — departure`],
    [schedule.surgery_date, "aftercare", `${name} — 1 week aftercare check-in`, 7],
    [schedule.surgery_date, "aftercare", `${name} — 1 month aftercare check-in`, 30],
  ];

  const reminders = plan
    .filter(([date]) => Boolean(date))
    .map(([date, type, title, offset]) => ({
      ...base,
      type,
      title,
      due_at: at(date as string, offset ?? 0),
    }));

  if (reminders.length) await supabase.from("reminders").insert(reminders);
  return reminders.length;
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
    // Every off-currency payment stores a rate computed AGAINST the case
    // currency (0016). Changing that currency silently invalidates all of them,
    // and no DB constraint can catch it — a check can't reference another table.
    // Block it and make the operator clear the payments first.
    if (values.currency) {
      const { data: existing } = await supabase
        .from("cases")
        .select("currency")
        .eq("id", id)
        .single();
      if (existing && existing.currency !== values.currency) {
        const { count } = await supabase
          .from("payments")
          .select("id", { count: "exact", head: true })
          .eq("case_id", id)
          .neq("currency", values.currency as string);
        if (count && count > 0)
          return {
            error:
              `This case has ${count} payment${count === 1 ? "" : "s"} converted against ` +
              `${existing.currency}. Changing the case currency would invalidate ${count === 1 ? "its" : "their"} ` +
              `stored rate${count === 1 ? "" : "s"} — delete or re-record ${count === 1 ? "it" : "them"} first.`,
          };
      }
    }
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
    await regenerateCaseReminders(supabase, caseId, patientId, {
      arrival_date: (values.arrival_date as string | null) ?? null,
      surgery_date: (values.surgery_date as string | null) ?? null,
      departure_date: (values.departure_date as string | null) ?? null,
      hospital_checkin: (values.hospital_checkin as string | null) ?? null,
      hospital_checkout: (values.hospital_checkout as string | null) ?? null,
    });
  }

  revalidateCase(patientId);
  return { id: caseId };
}

/**
 * Push every date on the case into the reminders list — arrival, hospital
 * check-in/out, operation, departure and the two aftercare check-ins — so they
 * surface on the dashboard instead of sitting inert on the case form.
 *
 * Reads the case rather than trusting the client, and is safe to run repeatedly:
 * `regenerateCaseReminders` replaces only the open generated reminders, leaving
 * hand-written follow-ups and anything already ticked off untouched. Replaces
 * the old "Done" button — completing a case is now just the Status field, which
 * is where it belonged.
 */
export async function syncCaseReminders(
  patientId: string,
  caseId: string
): Promise<{ error?: string; count?: number }> {
  await requireProfile();
  const supabase = await createClient();
  const { data: caseRow, error } = await supabase
    .from("cases")
    .select(CASE_SCHEDULE_COLUMNS)
    .eq("id", caseId)
    .single();
  if (error) return { error: error.message };

  const count = await regenerateCaseReminders(
    supabase,
    caseId,
    patientId,
    caseRow as unknown as CaseSchedule
  );

  revalidateCase(patientId);
  return { count };
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

  // Both labels are free text and may be empty (0017) — trim and cap them, but
  // never reject a blank one.
  const label = (s: unknown) => String(s ?? "").trim().slice(0, 200);

  const row: Record<string, unknown> = {
    kind: label(values.kind),
    description: label(values.description),
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

const ADDITIONAL_COST_COLUMNS = "id, case_id, title, amount, sort_order";

/**
 * Additional costs are extras quoted alongside the package and settled
 * separately: they appear on the PDF beneath Payment Information but are
 * deliberately excluded from the package total and from finance (0020).
 *
 * Unlike quote items these go through the ordinary cookie client — the table
 * has no cost column, so RLS lets staff write it directly and there is no
 * reason to reach for the service role.
 */
export async function upsertAdditionalCost(
  patientId: string,
  caseId: string,
  values: { title: string; amount: number; sort_order?: number },
  id?: string
): Promise<{ error?: string; item?: Record<string, unknown> }> {
  await requireProfile();
  const supabase = await createClient();

  // The title is free text and may be empty — trim and cap it, but never
  // reject a blank one (same stance as the quote labels since 0017).
  const row = {
    title: String(values.title ?? "").trim().slice(0, 200),
    amount: values.amount,
    sort_order: values.sort_order ?? 0,
  };

  const { data, error } = id
    ? await supabase
        .from("case_additional_costs")
        .update(row)
        .eq("id", id)
        .select(ADDITIONAL_COST_COLUMNS)
        .single()
    : await supabase
        .from("case_additional_costs")
        .insert({ ...row, case_id: caseId })
        .select(ADDITIONAL_COST_COLUMNS)
        .single();
  if (error) return { error: error.message };
  revalidateCase(patientId);
  return { item: data as unknown as Record<string, unknown> };
}

export async function deleteAdditionalCost(
  patientId: string,
  id: string
): Promise<{ error?: string }> {
  await requireProfile();
  const supabase = await createClient();
  const { error } = await supabase.from("case_additional_costs").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidateCase(patientId);
  return {};
}

/**
 * Additional costs for every case of a patient, grouped by case_id — keyed by
 * patient so the detail page can fetch them in parallel with the cases query
 * instead of waiting for case ids.
 */
export async function getAdditionalCostsForPatient(
  patientId: string
): Promise<Record<string, Record<string, unknown>[]>> {
  await requireProfile();
  const supabase = await createClient();
  const { data } = await supabase
    .from("case_additional_costs")
    .select(`${ADDITIONAL_COST_COLUMNS}, cases!inner(patient_id)`)
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
