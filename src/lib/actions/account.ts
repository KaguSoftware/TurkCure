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
  revalidatePath("/settings"); // sidebar/topbar re-read via the "profiles" tag
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
  revalidatePath("/settings");
  return {};
}

const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
const AVATAR_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

export async function updateOwnAvatar(formData: FormData): Promise<{ error?: string }> {
  const profile = await requireProfile();
  const file = formData.get("avatar");
  if (!(file instanceof File) || file.size === 0) return { error: "No image selected." };
  const ext = AVATAR_TYPES[file.type];
  if (!ext) return { error: "Use a JPG, PNG, WebP, or GIF image." };
  if (file.size > MAX_AVATAR_BYTES) return { error: "Image must be under 2 MB." };

  const admin = createAdminClient();
  // Unique path per upload so stale CDN caches never show the old picture.
  const path = `${profile.id}/${Date.now()}.${ext}`;
  const { error: uploadError } = await admin.storage
    .from("avatars")
    .upload(path, file, { contentType: file.type });
  if (uploadError) return { error: uploadError.message };

  const { data } = admin.storage.from("avatars").getPublicUrl(path);
  const { error } = await admin
    .from("profiles")
    .update({ avatar_url: data.publicUrl })
    .eq("id", profile.id);
  if (error) return { error: error.message };

  await removeAvatarFiles(profile, path);
  revalidateTag("profiles", "max");
  revalidatePath("/settings");
  return {};
}

export async function removeOwnAvatar(): Promise<{ error?: string }> {
  const profile = await requireProfile();
  const admin = createAdminClient();
  const { error } = await admin
    .from("profiles")
    .update({ avatar_url: null })
    .eq("id", profile.id);
  if (error) return { error: error.message };
  await removeAvatarFiles(profile);
  revalidateTag("profiles", "max");
  revalidatePath("/settings");
  return {};
}

/** Best-effort cleanup of this user's avatar files, optionally keeping one. */
async function removeAvatarFiles(profile: { id: string }, keep?: string) {
  const admin = createAdminClient();
  const { data: files } = await admin.storage.from("avatars").list(profile.id);
  const stale = (files ?? [])
    .map((f) => `${profile.id}/${f.name}`)
    .filter((p) => p !== keep);
  if (stale.length) await admin.storage.from("avatars").remove(stale);
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
