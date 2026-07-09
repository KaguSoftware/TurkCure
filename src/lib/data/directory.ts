import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

/**
 * The directory lookups (countries, agents, doctors, hospitals, hotels,
 * drivers, operation types) shared by the patients list and detail pages.
 * Wrapped in React `cache()` so the seven queries run at most once per request
 * even when several components ask for them — deduping the previous double-fetch
 * across the patients list and patient detail.
 */
export const getDirectories = cache(async () => {
  const supabase = await createClient();
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
});
