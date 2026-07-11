import { redirect } from "next/navigation";
import { createClient, getProfile } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { SettingsView } from "@/components/settings/settings-view";
import type { Profile } from "@/lib/types";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const profile = await getProfile();
  if (!profile) redirect("/dashboard");

  let users: Profile[] | null = null;
  if (profile.role === "admin") {
    const supabase = await createClient();
    const { data } = await supabase.from("profiles").select("*").order("name");
    users = (data ?? []) as Profile[];
  }

  return (
    <>
      <PageHeader title="Settings" subtitle="Your account and preferences" />
      <SettingsView profile={profile} users={users} />
    </>
  );
}
