import { redirect } from "next/navigation";
import { createAdminClient, getProfile } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { OrgsManager, type OrgRow } from "@/components/admin/orgs-manager";
import type { Organization } from "@/lib/types";

export const metadata = { title: "Organizations" };

/**
 * Platform-owner surface: the companies on this deployment. Super-only —
 * ordinary org admins never see it (nav is hidden and this redirect backs
 * that up, same pattern as the finance page's role gate).
 */
export default async function AdminPage() {
  const profile = await getProfile();
  if (!profile?.is_super) redirect("/dashboard");

  // Service role on purpose: this page reads ACROSS orgs, which RLS forbids —
  // exactly why it sits behind the is_super gate above.
  const admin = createAdminClient();
  const [{ data: orgs }, { data: memberRows }] = await Promise.all([
    admin.from("organizations").select("*").order("created_at", { ascending: true }),
    admin.from("profiles").select("org_id"),
  ]);

  const counts = new Map<string, number>();
  for (const row of memberRows ?? []) {
    counts.set(row.org_id, (counts.get(row.org_id) ?? 0) + 1);
  }
  const rows: OrgRow[] = ((orgs ?? []) as Organization[]).map((o) => ({
    ...o,
    members: counts.get(o.id) ?? 0,
  }));

  return (
    <>
      <PageHeader
        title="Organizations"
        subtitle="Companies on this platform — create workspaces and their first admin"
      />
      <OrgsManager orgs={rows} />
    </>
  );
}
