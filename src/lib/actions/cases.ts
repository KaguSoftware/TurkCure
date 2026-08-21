"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { createClient, createAdminClient, requireProfile, requireAdmin } from "@/lib/supabase/server";
import { addDays, formatISO } from "date-fns";
import { CURRENCIES } from "@/lib/utils";
import type { SupabaseClient } from "@supabase/supabase-js";

function revalidateCase(patientId: string, orgId: string) {
  revalidatePath(`/patients/${patientId}`);
  revalidatePath("/dashboard");
  revalidatePath("/finance");
  // Case/quote-item edits change revenue/cost; bust this org's cached finance
  // rows (the cache is keyed and tagged per org — see lib/data/finance.ts).
  revalidateTag(`finance:${orgId}`, "max");
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
): Promise<{ count: number; error?: string }> {
  const { data: patient, error: pErr } = await supabase
    .from("patients")
    .select("full_name, assigned_agent_id")
    .eq("id", patientId)
    .single();
  if (pErr || !patient) return { count: 0, error: pErr?.message ?? "Patient not found." };

  // The delete and insert below both have to succeed for the schedule to be
  // intact — a failed insert after a successful delete would wipe it, so both
  // errors are propagated instead of swallowed.
  const { error: dErr } = await supabase
    .from("reminders")
    .delete()
    .eq("case_id", caseId)
    .is("done_at", null)
    .in("type", GENERATED_REMINDER_TYPES);
  if (dErr) return { count: 0, error: dErr.message };

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

  if (reminders.length) {
    const { error: iErr } = await supabase.from("reminders").insert(reminders);
    if (iErr) return { count: 0, error: `Reminders could not be rebuilt: ${iErr.message}` };
  }
  return { count: reminders.length };
}

export async function upsertCase(
  patientId: string,
  values: Record<string, unknown>,
  id?: string
): Promise<{ error?: string; id?: string }> {
  const profile = await requireProfile();
  const supabase = await createClient();
  let caseId = id;
  if (id) {
    // Every off-currency payment stores a rate computed AGAINST the case
    // currency (0016). Changing that currency silently invalidates all of them,
    // and no DB constraint can catch it — a check can't reference another table.
    // Block it and make the operator clear the payments first.
    if (values.currency) {
      // Whitelist before the value is spliced into a PostgREST .or() filter.
      if (!CURRENCIES.includes(values.currency as (typeof CURRENCIES)[number]))
        return { error: "Invalid currency." };
      const { data: existing } = await supabase
        .from("cases")
        .select("currency")
        .eq("id", id)
        .single();
      if (existing && existing.currency !== values.currency) {
        // A payment breaks the change if its stored rate was computed against
        // the old case currency — that's any off-currency row OR a row already
        // in the new currency whose fx_rate ≠ 1 (converted TO the old one).
        const { count } = await supabase
          .from("payments")
          .select("id", { count: "exact", head: true })
          .eq("case_id", id)
          .or(`currency.neq.${values.currency},fx_rate.neq.1`);
        if (count && count > 0)
          return {
            error:
              `This case has ${count} payment${count === 1 ? "" : "s"} converted against ` +
              `${existing.currency}. Changing the case currency would invalidate ${count === 1 ? "its" : "their"} ` +
              `stored rate${count === 1 ? "" : "s"} — delete or re-record ${count === 1 ? "it" : "them"} first.`,
          };
      }
    }
    const { data, error } = await supabase
      .from("cases")
      .update(values)
      .eq("id", id)
      .select("id");
    if (error) return { error: error.message };
    if (!data?.length) return { error: "Case not found." };
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
    // Schedule from the just-written row, not the client payload — a partial
    // update that omitted the date columns must not wipe the reminders to zero.
    const { data: caseRow } = await supabase
      .from("cases")
      .select(CASE_SCHEDULE_COLUMNS)
      .eq("id", caseId)
      .single();
    if (caseRow) {
      const { error } = await regenerateCaseReminders(
        supabase,
        caseId,
        patientId,
        caseRow as unknown as CaseSchedule
      );
      if (error) {
        revalidateCase(patientId, profile.org_id);
        return { id: caseId, error };
      }
    }
  }

  revalidateCase(patientId, profile.org_id);
  return { id: caseId };
}

/**
 * Delete a case and everything hanging off it. Admin-only, like every other
 * delete in the app (RLS enforces it too — `cases delete` is `is_admin()`).
 *
 * Quote items, payments, reminders, instructions and additional costs all
 * cascade at the FK level (0001, 0020), so this one delete is enough; there is
 * no orphan to sweep up. It moves money, so the finance tag has to fall with it
 * — `revalidateCase` already does that.
 */
export async function deleteCase(patientId: string, id: string): Promise<{ error?: string }> {
  const profile = await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("cases").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidateCase(patientId, profile.org_id);
  return {};
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
  const profile = await requireProfile();
  const supabase = await createClient();
  const { data: caseRow, error } = await supabase
    .from("cases")
    .select(CASE_SCHEDULE_COLUMNS)
    .eq("id", caseId)
    .single();
  if (error) return { error: error.message };

  const { count, error: rErr } = await regenerateCaseReminders(
    supabase,
    caseId,
    patientId,
    caseRow as unknown as CaseSchedule
  );
  if (rErr) return { error: rErr };

  revalidateCase(patientId, profile.org_id);
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

  if (!Number.isFinite(values.price) || values.price < 0)
    return { error: "Price must be zero or more." };
  if (values.cost !== undefined && (!Number.isFinite(values.cost) || values.cost < 0))
    return { error: "Cost must be zero or more." };

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
  // Service role bypasses RLS: the org fence is explicit. Inserts stamp the
  // caller's org — if caseId belongs to another org, the composite FK
  // (case_id, org_id) → cases rejects the row.
  const { data, error } = id
    ? await admin
        .from("quote_items")
        .update(row)
        .eq("id", id)
        .eq("org_id", profile.org_id)
        .select(columns)
        .single()
    : await admin
        .from("quote_items")
        .insert({ ...row, case_id: caseId, org_id: profile.org_id })
        .select(columns)
        .single();
  if (error) return { error: error.message };
  revalidateCase(patientId, profile.org_id);
  return { item: data as unknown as Record<string, unknown> };
}

/**
 * Deliberately agent-deletable (0022): quote lines are drafting data agents
 * create and edit, so they can remove them too — even though the cost column
 * they never see travels with the row. Deletes of the financial record proper
 * (payments, cases) stay admin-only.
 */
export async function deleteQuoteItem(patientId: string, id: string): Promise<{ error?: string }> {
  const profile = await requireProfile();
  const admin = createAdminClient();
  // .select("id") makes a cross-org (0-row) delete surface as an error instead
  // of a silent success — same pattern as deleteReminder.
  const { data, error } = await admin
    .from("quote_items")
    .delete()
    .eq("id", id)
    .eq("org_id", profile.org_id)
    .select("id");
  if (error) return { error: error.message };
  if (!data?.length) return { error: "Quote item not found." };
  revalidateCase(patientId, profile.org_id);
  return {};
}

/**
 * Rewrite sort_order = array index for a case's quote items in one round-trip
 * batch. Service-role client because quote_items RLS is admin-only — same
 * gating stance as upsert/deleteQuoteItem. The `.eq("case_id")` guard means ids
 * from another case are simply ignored rather than spliced in.
 */
export async function reorderQuoteItems(
  patientId: string,
  caseId: string,
  orderedIds: string[]
): Promise<{ error?: string }> {
  const profile = await requireProfile();
  if (orderedIds.length > 200) return { error: "Too many items to reorder." };
  const admin = createAdminClient();
  // One atomic statement (0028) — N independent updates could half-apply on a
  // partial failure or interleave with a concurrent reorder. p_org is the fence.
  const { error } = await admin.rpc("reorder_quote_items", {
    p_org: profile.org_id,
    p_case: caseId,
    p_ids: orderedIds,
  });
  if (error) {
    // Pre-0028 fallback: the old per-row batch, so a deploy ahead of the
    // migration degrades to the previous behavior instead of breaking.
    if (!isMissingFunction(error)) return { error: error.message };
    const results = await Promise.all(
      orderedIds.map((id, i) =>
        admin
          .from("quote_items")
          .update({ sort_order: i })
          .eq("id", id)
          .eq("case_id", caseId)
          .eq("org_id", profile.org_id)
      )
    );
    const failed = results.find((r) => r.error);
    if (failed?.error) return { error: failed.error.message };
  }
  revalidateCase(patientId, profile.org_id);
  return {};
}

/** PostgREST's "no such function" shapes — the pre-migration fallback trigger. */
function isMissingFunction(error: { code?: string; message: string }): boolean {
  return error.code === "42883" || error.code === "PGRST202";
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
    .eq("org_id", profile.org_id)
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
    .eq("org_id", profile.org_id)
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
    .eq("org_id", profile.org_id)
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
  const profile = await requireProfile();
  const supabase = await createClient();

  if (!Number.isFinite(values.amount) || values.amount < 0)
    return { error: "Amount must be zero or more." };

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
  revalidateCase(patientId, profile.org_id);
  return { item: data as unknown as Record<string, unknown> };
}

/**
 * Agent-deletable since 0022 (which relaxed the 0020 admin-only delete policy):
 * extras are drafting data like quote items. Before 0022 an agent's delete
 * matched zero rows and silently no-opped.
 */
export async function deleteAdditionalCost(
  patientId: string,
  id: string
): Promise<{ error?: string }> {
  const profile = await requireProfile();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("case_additional_costs")
    .delete()
    .eq("id", id)
    .select("id");
  if (error) return { error: error.message };
  if (!data?.length) return { error: "Cost not found." };
  revalidateCase(patientId, profile.org_id);
  return {};
}

/** Same as reorderQuoteItems but for extras; the cookie client suffices — RLS
 *  allows any authenticated staff to update this table. */
export async function reorderAdditionalCosts(
  patientId: string,
  caseId: string,
  orderedIds: string[]
): Promise<{ error?: string }> {
  const profile = await requireProfile();
  if (orderedIds.length > 200) return { error: "Too many items to reorder." };
  const supabase = await createClient();
  // Atomic since 0028 (invoker RPC — RLS applies inside), with the old per-row
  // batch as the pre-migration fallback.
  const { error } = await supabase.rpc("reorder_additional_costs", {
    p_case: caseId,
    p_ids: orderedIds,
  });
  if (error) {
    if (!isMissingFunction(error)) return { error: error.message };
    const results = await Promise.all(
      orderedIds.map((id, i) =>
        supabase
          .from("case_additional_costs")
          .update({ sort_order: i })
          .eq("id", id)
          .eq("case_id", caseId)
      )
    );
    const failed = results.find((r) => r.error);
    if (failed?.error) return { error: failed.error.message };
  }
  revalidateCase(patientId, profile.org_id);
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
  const profile = await requireProfile();
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
  revalidateCase(patientId, profile.org_id);
  return { instruction: data as unknown as Record<string, unknown> };
}

export async function updateInstruction(
  patientId: string,
  id: string,
  body_md: string
): Promise<{ error?: string }> {
  const profile = await requireProfile();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("case_instructions")
    .update({ body_md })
    .eq("id", id)
    .select("id");
  if (error) return { error: error.message };
  if (!data?.length) return { error: "Instruction not found." };
  revalidateCase(patientId, profile.org_id);
  return {};
}

export async function removeInstruction(patientId: string, id: string): Promise<{ error?: string }> {
  const profile = await requireProfile();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("case_instructions")
    .delete()
    .eq("id", id)
    .select("id");
  if (error) return { error: error.message };
  if (!data?.length) return { error: "Instruction not found." };
  revalidateCase(patientId, profile.org_id);
  return {};
}
