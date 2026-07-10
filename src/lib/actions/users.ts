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
  await requireAdmin();
  const admin = createAdminClient();
  const { error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name, role },
  });
  if (error) return { error: error.message };
  revalidateTag("directories", "max"); // new user may appear as an agent
  revalidatePath("/settings");
  return {};
}

export async function setUserActive(id: string, active: boolean): Promise<{ error?: string }> {
  await requireAdmin();
  const admin = createAdminClient();
  const { error } = await admin.from("profiles").update({ active }).eq("id", id);
  if (error) return { error: error.message };
  revalidateTag("profiles", "max");
  revalidateTag("directories", "max"); // agent lists come from profiles
  revalidatePath("/settings");
  return {};
}

export async function setUserRole(id: string, role: Role): Promise<{ error?: string }> {
  await requireAdmin();
  const admin = createAdminClient();
  const { error } = await admin.from("profiles").update({ role }).eq("id", id);
  if (error) return { error: error.message };
  revalidateTag("profiles", "max");
  revalidatePath("/settings");
  return {};
}
