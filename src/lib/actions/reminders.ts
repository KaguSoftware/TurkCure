"use server";

import { revalidatePath } from "next/cache";
import { createClient, requireProfile } from "@/lib/supabase/server";
import type { Reminder } from "@/lib/types";

const REMINDER_TYPES = [
  "follow_up",
  "arrival",
  "operation",
  "payment",
  "aftercare",
  "hospital",
  "departure",
] as const;

/** The columns a client may write. done_at goes through toggleReminderDone
 *  only, and org_id self-stamps — a raw pass-through would let both ride in. */
const REMINDER_FIELDS = [
  "type",
  "title",
  "note",
  "due_at",
  "patient_id",
  "case_id",
  "assigned_to",
] as const;

export async function upsertReminder(
  values: Record<string, unknown>,
  id?: string
): Promise<{ error?: string; reminder?: Reminder }> {
  await requireProfile();
  const supabase = await createClient();

  // Partial updates are normal (snooze sends only due_at) — copy just the
  // known keys that are present instead of trusting the whole record.
  const row: Record<string, unknown> = {};
  for (const key of REMINDER_FIELDS) if (key in values) row[key] = values[key];
  if ("type" in row && !REMINDER_TYPES.includes(row.type as (typeof REMINDER_TYPES)[number]))
    return { error: "Invalid reminder type." };
  if (!id && (!String(row.title ?? "").trim() || !row.due_at))
    return { error: "A reminder needs a title and a due date." };

  const { data, error } = id
    ? await supabase.from("reminders").update(row).eq("id", id).select().single()
    : await supabase.from("reminders").insert(row).select().single();
  if (error) return { error: error.message };
  revalidatePath("/dashboard");
  return { reminder: data as Reminder };
}

export async function toggleReminderDone(id: string, done: boolean): Promise<{ error?: string }> {
  await requireProfile();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("reminders")
    .update({ done_at: done ? new Date().toISOString() : null })
    .eq("id", id)
    .select("id");
  if (error) return { error: error.message };
  if (!data?.length) return { error: "Reminder not found." };
  revalidatePath("/dashboard");
  return {};
}

export async function deleteReminder(id: string): Promise<{ error?: string }> {
  await requireProfile();
  const supabase = await createClient();
  // select() so RLS-blocked deletes (0 rows) surface as an error instead of silently succeeding
  const { data, error } = await supabase.from("reminders").delete().eq("id", id).select("id");
  if (error) return { error: error.message };
  if (!data || data.length === 0) return { error: "You don't have permission to delete this reminder." };
  revalidatePath("/dashboard");
  return {};
}
