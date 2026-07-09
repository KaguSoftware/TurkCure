"use server";

import { revalidatePath } from "next/cache";
import { createClient, requireProfile, requireAdmin } from "@/lib/supabase/server";

export async function upsertPayment(
  patientId: string,
  values: Record<string, unknown>,
  id?: string
): Promise<{ error?: string }> {
  await requireProfile();
  const supabase = await createClient();
  const { error } = id
    ? await supabase.from("payments").update(values).eq("id", id)
    : await supabase.from("payments").insert(values);
  if (error) return { error: error.message };
  revalidatePath(`/patients/${patientId}`);
  revalidatePath("/dashboard");
  revalidatePath("/finance");
  return {};
}

export async function deletePayment(patientId: string, id: string): Promise<{ error?: string }> {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("payments").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath(`/patients/${patientId}`);
  revalidatePath("/finance");
  return {};
}
