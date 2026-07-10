import { unstable_cache } from "next/cache";
import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/server";

/**
 * The directory lookups (countries, agents, doctors, hospitals, hotels,
 * drivers, operation types) shared by the patients list and detail pages.
 * Near-static, so they're cached across requests via `unstable_cache`
 * (invalidated by the "directories" tag from the directory/user actions,
 * hourly revalidate as a safety net). The admin client is used because
 * unstable_cache callbacks can't read cookies — the data is non-sensitive
 * lookup lists and every caller is behind requireProfile(). The outer React
 * `cache()` still dedupes within a single request.
 */
const getCachedDirectories = unstable_cache(
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
      supabase.from("countries").select("id, name").order("name"),
      supabase.from("profiles").select("id, name").eq("active", true).order("name"),
      supabase.from("doctors").select("id, name").order("name"),
      supabase.from("hospitals").select("id, name").order("name"),
      supabase.from("hotels").select("id, name").order("name"),
      supabase.from("drivers").select("id, name").order("name"),
      supabase.from("operation_types").select("id, name").order("name"),
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
  ["directories"],
  { tags: ["directories"], revalidate: 3600 }
);

export const getDirectories = cache(getCachedDirectories);
