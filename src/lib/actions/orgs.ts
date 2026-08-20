"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { createAdminClient, requireSuperAdmin } from "@/lib/supabase/server";
import { slugify } from "@/lib/utils";

/**
 * Create a company workspace: the org row, its seeded default directories
 * (countries / operation types / instruction templates via seed_org_defaults),
 * and its first admin account. Platform-owner only — there is no public
 * signup by design. The first admin is created exactly like inviteUser's
 * temp-password flow, with org_id + role in app_metadata (service-role-only
 * writable; handle_new_user reads them, and RLS reads the org claim from
 * every token minted afterwards).
 */
export async function createOrganization(
  name: string,
  adminName: string,
  adminEmail: string,
  tempPassword: string
): Promise<{ error?: string }> {
  await requireSuperAdmin();
  const trimmed = name.trim();
  if (!trimmed) return { error: "Company name cannot be empty." };
  if (trimmed.length > 80) return { error: "Company name is too long." };
  if (!adminEmail.includes("@")) return { error: "Enter a valid admin email." };
  if (tempPassword.length < 8) return { error: "Temporary password must be at least 8 characters." };

  const admin = createAdminClient();

  // Find a free slug (the display name may collide; the slug must not).
  const base = slugify(trimmed);
  let slug = base;
  for (let i = 2; ; i++) {
    const { data: taken } = await admin.from("organizations").select("id").eq("slug", slug).maybeSingle();
    if (!taken) break;
    if (i > 20) return { error: "Could not find a free identifier for this name." };
    slug = `${base}-${i}`;
  }

  const { data: org, error: orgError } = await admin
    .from("organizations")
    .insert({ name: trimmed, slug, company_name: trimmed })
    .select("id")
    .single();
  if (orgError || !org) return { error: orgError?.message ?? "Could not create the organization." };

  const { error: seedError } = await admin.rpc("seed_org_defaults", { p_org: org.id });
  if (seedError) {
    await admin.from("organizations").delete().eq("id", org.id);
    return { error: seedError.message };
  }

  const { error: userError } = await admin.auth.admin.createUser({
    email: adminEmail,
    password: tempPassword,
    email_confirm: true,
    user_metadata: { name: adminName },
    app_metadata: { org_id: org.id, role: "admin" },
  });
  if (userError) {
    // No orphan workspaces: the seeded rows cascade with the org.
    await admin.from("organizations").delete().eq("id", org.id);
    return { error: userError.message };
  }

  revalidatePath("/admin");
  return {};
}

/**
 * Enable/disable a whole workspace. The lockout is enforced in (app)/layout —
 * members of a disabled org are signed out on their next request.
 */
export async function setOrganizationActive(
  id: string,
  active: boolean
): Promise<{ error?: string }> {
  await requireSuperAdmin();
  const admin = createAdminClient();
  const { error } = await admin.from("organizations").update({ active }).eq("id", id);
  if (error) return { error: error.message };
  revalidateTag(`org:${id}`, "max");
  revalidatePath("/admin");
  revalidatePath("/", "layout"); // the lockout check lives in the app layout
  return {};
}
