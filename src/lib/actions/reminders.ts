"use server";

import { revalidatePath } from "next/cache";
import { createClient, requireProfile } from "@/lib/supabase/server";
import type { Reminder } from "@/lib/types";

export async function upsertReminder(
  values: Record<string, unknown>,
  id?: string
): Promise<{ error?: string; reminder?: Reminder }> {
  await requireProfile();
  const supabase = await createClient();
  const { data, error } = id
    ? await supabase.from("reminders").update(values).eq("id", id).select().single()
    : await supabase.from("reminders").insert(values).select().single();
  if (error) return { error: error.message };
  revalidatePath("/dashboard");
  return { reminder: data as Reminder };
}

export async function toggleReminderDone(id: string, done: boolean): Promise<{ error?: string }> {
  await requireProfile();
  const supabase = await createClient();
  const { error } = await supabase
    .from("reminders")
    .update({ done_at: done ? new Date().toISOString() : null })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/dashboard");
  return {};
}

export async function deleteReminder(id: string): Promise<{ error?: string }> {
  await requireProfile();
  const supabase = await createClient();
  const { error } = await supabase.from("reminders").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/dashboard");
  return {};
}
