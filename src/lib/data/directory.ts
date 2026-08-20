import { unstable_cache } from "next/cache";
import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/server";

/**
 * The directory lookups (countries, agents, doctors, hospitals, hotels,
 * drivers, operation types) shared by the patients list and detail pages.
 * Near-static, so they're cached across requests via `unstable_cache` —
 * per organization: the org id is part of the cache key AND of a per-org tag
 * (`directories:<orgId>`), so one org's writes never evict (or worse, serve)
 * another org's lists. The admin client is used because unstable_cache
 * callbacks can't read cookies — which also means RLS is NOT in effect here,
 * so every query must carry the org filter explicitly. Callers are behind
 * requireProfile() and pass profile.org_id. The outer React `cache()` still
 * dedupes within a single request.
 */
const cachedDirectories = (orgId: string) =>
  unstable_cache(
    async () => {
      const supabase = createAdminClient();
      const [
        { data: countries },
        { data: agents },
        { data: doctors },
        { data: hospitals },
        { data: hotels },
        { data: drivers },
        { data: operationTypes },
      ] = await Promise.all([
        supabase.from("countries").select("id, name").eq("org_id", orgId).order("name"),
        supabase.from("profiles").select("id, name").eq("org_id", orgId).eq("active", true).order("name"),
        supabase.from("doctors").select("id, name").eq("org_id", orgId).order("name"),
        supabase.from("hospitals").select("id, name").eq("org_id", orgId).order("name"),
        supabase.from("hotels").select("id, name").eq("org_id", orgId).order("name"),
        supabase.from("drivers").select("id, name").eq("org_id", orgId).order("name"),
        supabase.from("operation_types").select("id, name").eq("org_id", orgId).order("name"),
      ]);

      return {
        countries: countries ?? [],
        agents: agents ?? [],
        doctors: doctors ?? [],
        hospitals: hospitals ?? [],
        hotels: hotels ?? [],
        drivers: drivers ?? [],
        operationTypes: operationTypes ?? [],
      };
    },
    ["directories", orgId],
    { tags: [`directories:${orgId}`], revalidate: 3600 }
  );

export const getDirectories = cache(async (orgId: string) => cachedDirectories(orgId)());
