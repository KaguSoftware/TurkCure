import { redirect } from "next/navigation";
import { createClient, getProfile } from "@/lib/supabase/server";
import { getOrganization } from "@/lib/data/org";
import { PageHeader } from "@/components/page-header";
import { SettingsView } from "@/components/settings/settings-view";
import type { Organization, Profile } from "@/lib/types";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const profile = await getProfile();
  if (!profile) redirect("/dashboard");

  let users: Profile[] | null = null;
  let org: Organization | null = null;
  if (profile.role === "admin") {
    const supabase = await createClient();
    // The team list is org-scoped by RLS (0024); the org row feeds the
    // Organization/branding tab.
    const [{ data }, orgRow] = await Promise.all([
      supabase.from("profiles").select("*").order("name"),
      getOrganization(profile.org_id),
    ]);
    users = (data ?? []) as Profile[];
    org = orgRow;
  }

  return (
    <>
      <PageHeader title="Settings" subtitle="Your account and preferences" />
      <SettingsView profile={profile} users={users} org={org} />
    </>
  );
}
