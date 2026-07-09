"use server";

import { revalidatePath } from "next/cache";
import { createClient, createAdminClient, requireProfile } from "@/lib/supabase/server";
import { addDays, formatISO } from "date-fns";

function revalidateCase(patientId: string) {
  revalidatePath(`/patients/${patientId}`);
  revalidatePath("/dashboard");
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

  // Auto-generate reminders for key dates (idempotent per case+type+date)
  const arrival = values.arrival_date as string | null;
  const surgery = values.surgery_date as string | null;
  const { data: patient } = await supabase
    .from("patients")
    .select("full_name, assigned_agent_id")
    .eq("id", patientId)
    .single();

  if (patient && caseId) {
    await supabase.from("reminders").delete().eq("case_id", caseId).is("done_at", null)
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

  revalidateCase(patientId);
  return { id: caseId };
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
): Promise<{ error?: string }> {
  const profile = await requireProfile();
  const admin = createAdminClient();

  const row: Record<string, unknown> = {
    kind: values.kind,
    description: values.description,
    price: values.price,
    sort_order: values.sort_order ?? 0,
  };
  if (profile.role === "admin" && values.cost !== undefined) row.cost = values.cost;

  const { error } = id
    ? await admin.from("quote_items").update(row).eq("id", id)
    : await admin.from("quote_items").insert({ ...row, case_id: caseId });
  if (error) return { error: error.message };
  revalidateCase(patientId);
  return {};
}

export async function deleteQuoteItem(patientId: string, id: string): Promise<{ error?: string }> {
  await requireProfile();
  const admin = createAdminClient();
  const { error } = await admin.from("quote_items").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidateCase(patientId);
  return {};
}

/** Quote items for a case; cost included only for admins. */
export async function getQuoteItems(caseId: string) {
  const profile = await requireProfile();
  const admin = createAdminClient();
  const columns =
    profile.role === "admin"
      ? "id, case_id, kind, description, cost, price, sort_order"
      : "id, case_id, kind, description, price, sort_order";
  const { data } = await admin
    .from("quote_items")
    .select(columns)
    .eq("case_id", caseId)
    .order("sort_order")
    .order("created_at");
  return data ?? [];
}

export async function attachInstruction(
  patientId: string,
  caseId: string,
  templateId: string
): Promise<{ error?: string }> {
  await requireProfile();
  const supabase = await createClient();
  const { data: template, error: tErr } = await supabase
    .from("instruction_templates")
    .select("title, body_md")
    .eq("id", templateId)
    .single();
  if (tErr || !template) return { error: "Template not found" };
  const { error } = await supabase.from("case_instructions").insert({
    case_id: caseId,
    template_id: templateId,
    title: template.title,
    body_md: template.body_md,
  });
  if (error) return { error: error.message };
  revalidateCase(patientId);
  return {};
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
