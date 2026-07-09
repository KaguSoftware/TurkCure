"use server";

import { revalidatePath } from "next/cache";
import { createClient, requireProfile, requireAdmin } from "@/lib/supabase/server";
import type { PatientStatus } from "@/lib/types";

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
