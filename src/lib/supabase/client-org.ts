import { createClient } from "@/lib/supabase/client";

/**
 * The caller's org id, browser-side — for building org-prefixed storage paths
 * (0025 scopes storage policies to the first path folder). Fast path reads the
 * server-set app_metadata claim off the local session (no network); tokens
 * minted before the claims backfill fall back to one RLS-scoped profile read.
 */
export async function getOrgId(): Promise<string | null> {
  const supabase = createClient();
  const { data } = await supabase.auth.getSession();
  const claim = data.session?.user?.app_metadata?.org_id;
  if (typeof claim === "string" && claim) return claim;
  const uid = data.session?.user?.id;
  if (!uid) return null;
  const { data: row } = await supabase.from("profiles").select("org_id").eq("id", uid).single();
  return (row?.org_id as string | undefined) ?? null;
}
