import { unstable_cache } from "next/cache";
import { cache } from "react";
import { createAdminClient, requireOrg } from "@/lib/supabase/server";
import type { Organization } from "@/lib/types";

/**
 * The caller's organization row — branding, PDF company fields, active flag.
 * Read on every authenticated layout render, so it's cached across requests
 * per org (tag `org:<orgId>`, raised by the org-branding and platform-admin
 * actions). Admin client because unstable_cache callbacks can't read cookies;
 * callers pass an org id taken from their own verified profile.
 */
const cachedOrganization = (orgId: string) =>
  unstable_cache(
    async (): Promise<Organization | null> => {
      const admin = createAdminClient();
      const { data } = await admin
        .from("organizations")
        .select("*")
        .eq("id", orgId)
        .single();
      return (data as Organization) ?? null;
    },
    ["org-row", orgId],
    { tags: [`org:${orgId}`], revalidate: 300 }
  );

export const getOrganization = cache(async (orgId: string) => cachedOrganization(orgId)());

/** The current user's organization. Throws if unauthenticated or org missing. */
export const getOrg = cache(async (): Promise<Organization> => {
  const { orgId } = await requireOrg();
  const org = await getOrganization(orgId);
  if (!org) throw new Error("Organization not found");
  return org;
});
