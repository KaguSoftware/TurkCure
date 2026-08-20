"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { createAdminClient, requireAdmin } from "@/lib/supabase/server";
import type { Role } from "@/lib/types";

export async function inviteUser(
  email: string,
  name: string,
  role: Role,
  password: string
): Promise<{ error?: string }> {
  const profile = await requireAdmin();
  const admin = createAdminClient();
  // org_id and role travel in app_metadata: only the service-role admin API can
  // write it, so neither can be forged through signup metadata. handle_new_user
  // consumes both; the org_id claim additionally rides every JWT this user is
  // issued, which is what the RLS org predicate reads. (The role copy is
  // consumed once at creation and is NOT synced by setUserRole — nothing reads
  // a role claim afterwards; is_admin() stays a live lookup.)
  const { error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name },
    app_metadata: { org_id: profile.org_id, role },
  });
  if (error) return { error: error.message };
  revalidateTag(`directories:${profile.org_id}`, "max"); // new user may appear as an agent
  revalidatePath("/settings");
  return {};
}

export async function setUserActive(id: string, active: boolean): Promise<{ error?: string }> {
  const profile = await requireAdmin();
  const admin = createAdminClient();
  // Admin client bypasses RLS, so the org fence is explicit — and .select("id")
  // turns a cross-org (0-row) update into a loud error instead of a silent ok.
  const { data, error } = await admin
    .from("profiles")
    .update({ active })
    .eq("id", id)
    .eq("org_id", profile.org_id)
    .select("id");
  if (error) return { error: error.message };
  if (!data?.length) return { error: "User not found." };
  revalidateTag("profiles", "max");
  revalidateTag(`directories:${profile.org_id}`, "max"); // agent lists come from profiles
  revalidatePath("/settings");
  return {};
}

export async function setUserRole(id: string, role: Role): Promise<{ error?: string }> {
  const profile = await requireAdmin();
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("profiles")
    .update({ role })
    .eq("id", id)
    .eq("org_id", profile.org_id)
    .select("id");
  if (error) return { error: error.message };
  if (!data?.length) return { error: "User not found." };
  revalidateTag("profiles", "max");
  revalidateTag(`directories:${profile.org_id}`, "max"); // role changes reach agent lists too
  revalidatePath("/settings");
  return {};
}
