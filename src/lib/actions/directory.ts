"use server";

import { revalidatePath } from "next/cache";
import { createClient, requireProfile, requireAdmin } from "@/lib/supabase/server";

const TABLES = {
  countries: "/countries",
  hospitals: "/hospitals",
  doctors: "/hospitals",
  hotels: "/hotels",
  drivers: "/drivers",
  operation_types: "/templates",
  instruction_templates: "/templates",
} as const;

export type DirectoryTable = keyof typeof TABLES;

export async function upsertDirectoryRow(
  table: DirectoryTable,
  values: Record<string, unknown>,
  id?: string
): Promise<{ error?: string }> {
  await requireProfile();
  if (!(table in TABLES)) return { error: "Invalid table" };
  const supabase = await createClient();
  const query = id
    ? supabase.from(table).update(values).eq("id", id)
    : supabase.from(table).insert(values);
  const { error } = await query;
  if (error) return { error: error.message };
  revalidatePath(TABLES[table]);
  return {};
}

export async function deleteDirectoryRow(
  table: DirectoryTable,
  id: string
): Promise<{ error?: string }> {
  await requireAdmin();
  if (!(table in TABLES)) return { error: "Invalid table" };
  const supabase = await createClient();
  const { error } = await supabase.from(table).delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath(TABLES[table]);
  return {};
}
