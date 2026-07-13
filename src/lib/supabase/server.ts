import { createServerClient } from "@supabase/ssr";
import { createClient as createBareClient } from "@supabase/supabase-js";
import { unstable_cache } from "next/cache";
import { cookies } from "next/headers";
import { cache } from "react";
import type { Profile } from "@/lib/types";

export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) => {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // called from a Server Component — middleware refreshes sessions
          }
        },
      },
    }
  );
}

/** Service-role client. Server only. Bypasses RLS — always gate with an auth check first. */
export function createAdminClient() {
  return createBareClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

/**
 * Anon-key client that never persists a session. For throwaway credential
 * checks (e.g. re-verifying a current password) that must not touch the real
 * session cookies.
 */
export function createAnonClient() {
  return createBareClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } }
  );
}

/**
 * Profiles row by user id, cached across requests. Uses the admin client
 * because unstable_cache callbacks cannot read cookies; callers must pass an
 * id taken from a verified JWT. Invalidated via the "profiles" tag by the
 * user-management actions, with a 5-minute revalidate as a safety net.
 */
const getCachedProfileRow = unstable_cache(
  async (id: string): Promise<Profile | null> => {
    const admin = createAdminClient();
    const { data } = await admin.from("profiles").select("*").eq("id", id).single();
    return (data as Profile) ?? null;
  },
  ["profile-row"],
  { tags: ["profiles"], revalidate: 300 }
);

/** Current user's profile, or null if unauthenticated. Cached per request. */
export const getProfile = cache(async (): Promise<Profile | null> => {
  const supabase = await createClient();
  // getClaims verifies the JWT locally (via cached JWKS) when the project uses
  // asymmetric signing keys, avoiding the network hop of getUser().
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) return null;
  const profile = await getCachedProfileRow(claims.sub);
  if (!profile) return null;
  return { ...profile, email: (claims.email as string | undefined) ?? profile.email };
});

export async function requireProfile(): Promise<Profile> {
  const profile = await getProfile();
  if (!profile || !profile.active) throw new Error("Not authenticated");
  return profile;
}

export async function requireAdmin(): Promise<Profile> {
  const profile = await requireProfile();
  if (profile.role !== "admin") throw new Error("Admin access required");
  return profile;
}
