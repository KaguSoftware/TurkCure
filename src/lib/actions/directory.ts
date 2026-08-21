"use server";

import { revalidatePath, revalidateTag } from "next/cache";
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
): Promise<{ error?: string; row?: Record<string, unknown> }> {
  const profile = await requireProfile();
  if (!(table in TABLES)) return { error: "Invalid table" };
  // Cookie client: RLS scopes reads/updates to the caller's org, and inserts
  // self-stamp org_id via the column default (0023).
  const supabase = await createClient();
  const query = id
    ? supabase.from(table).update(values).eq("id", id).select("*").single()
    : supabase.from(table).insert(values).select("*").single();
  const { data, error } = await query;
  if (error) return { error: error.message };
  revalidateTag(`directories:${profile.org_id}`, "max");
  // hospital/doctor names are denormalized into the cached finance rows.
  revalidateTag(`finance:${profile.org_id}`, "max");
  revalidatePath(TABLES[table]);
  return { row: data as unknown as Record<string, unknown> };
}

export async function deleteDirectoryRow(
  table: DirectoryTable,
  id: string
): Promise<{ error?: string }> {
  const profile = await requireAdmin();
  if (!(table in TABLES)) return { error: "Invalid table" };
  const supabase = await createClient();
  const { data, error } = await supabase.from(table).delete().eq("id", id).select("id");
  if (error) return { error: error.message };
  if (!data?.length) return { error: "Row not found." };
  revalidateTag(`directories:${profile.org_id}`, "max");
  revalidateTag(`finance:${profile.org_id}`, "max");
  revalidatePath(TABLES[table]);
  return {};
}
