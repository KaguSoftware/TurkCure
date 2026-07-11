"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { createClient as createBareClient } from "@supabase/supabase-js";
import { createAdminClient, createClient, requireProfile } from "@/lib/supabase/server";
import { ACCENT_THEMES, type AccentTheme } from "@/lib/types";

export async function updateOwnProfile(name: string): Promise<{ error?: string }> {
  const profile = await requireProfile();
  const trimmed = name.trim();
  if (!trimmed) return { error: "Name cannot be empty." };
  if (trimmed.length > 80) return { error: "Name is too long." };
  const admin = createAdminClient();
  const { error } = await admin.from("profiles").update({ name: trimmed }).eq("id", profile.id);
  if (error) return { error: error.message };
  revalidateTag("profiles", "max");
  revalidateTag("directories", "max"); // agent lists come from profiles
  revalidatePath("/", "layout"); // sidebar/topbar user name
  return {};
}

export async function updateOwnAccentTheme(theme: AccentTheme): Promise<{ error?: string }> {
  const profile = await requireProfile();
  if (!ACCENT_THEMES.some((t) => t.value === theme)) return { error: "Unknown theme." };
  const admin = createAdminClient();
  const { error } = await admin
    .from("profiles")
    .update({ accent_theme: theme })
    .eq("id", profile.id);
  if (error) return { error: error.message };
  revalidateTag("profiles", "max");
  revalidatePath("/", "layout");
  return {};
}

export async function changeOwnPassword(
  currentPassword: string,
  newPassword: string
): Promise<{ error?: string }> {
  const profile = await requireProfile();
  if (!profile.email) return { error: "No email on this account." };
  if (newPassword.length < 8) return { error: "New password must be at least 8 characters." };

  // Verify the current password with a throwaway client so the real session
  // cookies are untouched either way.
  const bare = createBareClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } }
  );
  const { error: verifyError } = await bare.auth.signInWithPassword({
    email: profile.email,
    password: currentPassword,
  });
  if (verifyError) return { error: "Current password is incorrect." };

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) return { error: error.message };
  return {};
}
