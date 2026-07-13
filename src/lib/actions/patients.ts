"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { createClient, requireProfile, requireAdmin } from "@/lib/supabase/server";
import type { Patient, PatientStatus } from "@/lib/types";

export async function upsertPatient(
  values: Record<string, unknown>,
  id?: string
): Promise<{ error?: string; id?: string }> {
  await requireProfile();
  const supabase = await createClient();
  if (id) {
    const { error } = await supabase
      .from("patients")
      .update({ ...values, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) return { error: error.message };
    revalidatePath("/patients");
    revalidatePath(`/patients/${id}`);
    return { id };
  }
  const { data, error } = await supabase.from("patients").insert(values).select("id").single();
  if (error) return { error: error.message };
  revalidatePath("/patients");
  return { id: data.id };
}

export async function deletePatient(id: string): Promise<{ error?: string }> {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("patients").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/patients");
  revalidateTag("finance", "max"); // cascades to cases → finance rows
  return {};
}

export async function setPatientStatus(
  id: string,
  status: PatientStatus
): Promise<{ error?: string }> {
  await requireProfile();
  const supabase = await createClient();
  const { error } = await supabase
    .from("patients")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/patients");
  revalidatePath(`/patients/${id}`);
  return {};
}

// Patients of a single status for the board's "maximize column" takeover, which
// is local state (no URL filter) and so can't rely on the page's paginated load.
// Capped at 50 like the board page; RLS-respected via the cookie client.
export async function getPatientsByStatus(
  status: PatientStatus
): Promise<{ patients?: Patient[]; error?: string }> {
  await requireProfile();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("patients")
    .select("id, full_name, status, created_at, country_id, assigned_agent_id, countries(name), profiles(name)")
    .eq("status", status)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) return { error: error.message };
  return { patients: (data ?? []) as unknown as Patient[] };
}

export async function bulkUpdatePatients(
  ids: string[],
  values: { status?: PatientStatus; assigned_agent_id?: string }
): Promise<{ error?: string; updated?: number }> {
  await requireProfile();
  if (ids.length === 0) return { error: "No patients selected" };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("patients")
    .update({ ...values, updated_at: new Date().toISOString() })
    .in("id", ids)
    .select("id");
  if (error) return { error: error.message };
  revalidatePath("/patients");
  return { updated: data?.length ?? 0 };
}

export async function bulkDeletePatients(ids: string[]): Promise<{ error?: string; deleted?: number }> {
  await requireAdmin();
  if (ids.length === 0) return { error: "No patients selected" };
  const supabase = await createClient();
  const { data, error } = await supabase.from("patients").delete().in("id", ids).select("id");
  if (error) return { error: error.message };
  revalidatePath("/patients");
  revalidateTag("finance", "max"); // cascades to cases → finance rows
  return { deleted: data?.length ?? 0 };
}

/** All patients matching the current filters, for CSV export (no pagination). */
export async function exportPatients(filters: {
  q?: string;
  status?: string;
  agent?: string;
  country?: string;
}): Promise<{ error?: string; csv?: string }> {
  await requireProfile();
  const supabase = await createClient();
  let query = supabase
    .from("patients")
    .select(
      "full_name, email, phone, status, source, gender, date_of_birth, passport_number, notes, created_at, countries(name), profiles(name)"
    )
    .order("created_at", { ascending: false });
  const q = (filters.q ?? "").trim();
  if (q) {
    const like = `%${q.replace(/[%_]/g, "\\$&")}%`;
    query = query.or(`full_name.ilike.${like},email.ilike.${like},phone.ilike.${like}`);
  }
  if (filters.status) query = query.eq("status", filters.status);
  if (filters.agent) query = query.eq("assigned_agent_id", filters.agent);
  if (filters.country) query = query.eq("country_id", filters.country);

  const { data, error } = await query;
  if (error) return { error: error.message };

  const esc = (v: unknown) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = [
    "Full name", "Email", "Phone", "Status", "Source", "Gender",
    "Date of birth", "Passport", "Country", "Agent", "Created", "Notes",
  ];
  const rows = (data ?? []).map((p) =>
    [
      p.full_name, p.email, p.phone, p.status, p.source, p.gender,
      p.date_of_birth, p.passport_number,
      (p.countries as unknown as { name?: string } | null)?.name ?? "",
      (p.profiles as unknown as { name?: string } | null)?.name ?? "",
      p.created_at?.slice(0, 10), p.notes,
    ]
      .map(esc)
      .join(",")
  );
  return { csv: [header.join(","), ...rows].join("\n") };
}

export async function importPatients(
  rows: { full_name: string; email?: string; phone?: string; source?: string; notes?: string }[]
): Promise<{ error?: string; inserted?: number; skipped?: number }> {
  const profile = await requireProfile();
  const supabase = await createClient();

  const cleaned = rows.filter((r) => r.full_name?.trim());
  if (cleaned.length === 0) return { error: "No valid rows (full_name is required)" };

  // Dedupe against existing patients by email or phone
  const emails = cleaned.map((r) => r.email?.trim().toLowerCase()).filter(Boolean) as string[];
  const phones = cleaned.map((r) => r.phone?.trim()).filter(Boolean) as string[];
  const { data: existing } = await supabase
    .from("patients")
    .select("email, phone")
    .or(
      [
        emails.length ? `email.in.(${emails.join(",")})` : null,
        phones.length ? `phone.in.(${phones.join(",")})` : null,
      ]
        .filter(Boolean)
        .join(",")
    );

  const existingEmails = new Set((existing ?? []).map((p) => p.email?.toLowerCase()).filter(Boolean));
  const existingPhones = new Set((existing ?? []).map((p) => p.phone).filter(Boolean));

  const toInsert = cleaned.filter((r) => {
    const email = r.email?.trim().toLowerCase();
    const phone = r.phone?.trim();
    return !(email && existingEmails.has(email)) && !(phone && existingPhones.has(phone));
  });

  if (toInsert.length > 0) {
    const { error } = await supabase.from("patients").insert(
      toInsert.map((r) => ({
        full_name: r.full_name.trim(),
        email: r.email?.trim() ?? "",
        phone: r.phone?.trim() ?? "",
        source: r.source?.trim() || "csv_import",
        notes: r.notes?.trim() ?? "",
        status: "lead",
        assigned_agent_id: profile.id,
      }))
    );
    if (error) return { error: error.message };
  }

  revalidatePath("/patients");
  return { inserted: toInsert.length, skipped: cleaned.length - toInsert.length };
}
