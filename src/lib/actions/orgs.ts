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

/**
 * Permanently delete a workspace: every member's login, every row, every
 * stored file. Platform-owner only, and never the caller's own org (that
 * would take the whole platform-admin surface down with it).
 *
 * The org_id FKs are NO ACTION on purpose (an accidental org-row delete must
 * not silently vaporize a company), so this deletes in dependency order
 * instead: auth users first (profiles cascade from auth.users; patient
 * assignments/uploader references SET NULL), then patients (everything
 * case-scoped cascades from there), then the org-scoped leftovers, then the
 * org row. Storage prefixes are cleared best-effort afterwards — an orphaned
 * object is unreachable anyway once the org is gone (policies key on the org
 * claim, which no user carries any more).
 */
export async function deleteOrganization(id: string): Promise<{ error?: string }> {
  const profile = await requireSuperAdmin();
  if (id === profile.org_id)
    return { error: "You can't delete your own workspace from inside it." };
  const admin = createAdminClient();

  const { data: org } = await admin.from("organizations").select("id, slug").eq("id", id).maybeSingle();
  if (!org) return { error: "Organization not found." };

  // 1. Members' logins (cascades their profiles rows).
  const { data: members } = await admin.from("profiles").select("id").eq("org_id", id);
  for (const m of members ?? []) {
    const { error } = await admin.auth.admin.deleteUser(m.id);
    if (error) return { error: `Could not remove a member account: ${error.message}` };
  }

  // 2. Rows, parents before the directory tables they reference. Patients
  //    cascade every case-scoped table; parentless reminders go explicitly.
  for (const table of [
    "patients",
    "reminders",
    "instruction_templates",
    "doctors",
    "hospitals",
    "hotels",
    "drivers",
    "operation_types",
    "countries",
  ] as const) {
    const { error } = await admin.from(table).delete().eq("org_id", id);
    if (error) return { error: `Could not clear ${table}: ${error.message}` };
  }

  // 3. The org row itself.
  const { error: orgError } = await admin.from("organizations").delete().eq("id", id);
  if (orgError) return { error: orgError.message };

  // 4. Storage, best-effort (failures leave unreachable orphans, not data).
  for (const bucket of ["patient-files", "receipts", "instruction-images", "org-assets"]) {
    try {
      const paths = await listBucketPrefix(bucket, id);
      if (paths.length) await admin.storage.from(bucket).remove(paths);
    } catch {
      // best-effort by design
    }
  }
  // Avatars are keyed by user id, not org — sweep each ex-member's folder so the
  // public bucket doesn't keep serving their photos after the workspace is gone.
  for (const m of members ?? []) {
    try {
      const paths = await listBucketPrefix("avatars", m.id);
      if (paths.length) await admin.storage.from("avatars").remove(paths);
    } catch {
      // best-effort by design
    }
  }

  revalidateTag(`org:${id}`, "max");
  // The per-org caches outlive the rows without this (directories has a 1h TTL).
  revalidateTag(`directories:${id}`, "max");
  revalidateTag(`finance:${id}`, "max");
  revalidatePath("/admin");
  return {};
}

/** Every object path under `<prefix>/` in a bucket (folders recurse). */
async function listBucketPrefix(bucket: string, prefix: string): Promise<string[]> {
  const admin = createAdminClient();
  const out: string[] = [];
  async function walk(dir: string) {
    let offset = 0;
    for (;;) {
      const { data, error } = await admin.storage.from(bucket).list(dir, { limit: 1000, offset });
      if (error || !data) return;
      for (const entry of data) {
        const full = `${dir}/${entry.name}`;
        if (entry.id === null) await walk(full);
        else out.push(full);
      }
      if (data.length < 1000) return;
      offset += 1000;
    }
  }
  await walk(prefix);
  return out;
}
