import { redirect } from "next/navigation";
import { createClient, getProfile } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { UsersManager } from "@/components/settings/users-manager";
import type { Profile } from "@/lib/types";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const profile = await getProfile();
  if (!profile || profile.role !== "admin") redirect("/dashboard");

  const supabase = await createClient();
  const { data: users } = await supabase.from("profiles").select("*").order("name");

  return (
    <>
      <PageHeader title="Settings" subtitle="Team members and access" />
      <UsersManager users={(users ?? []) as Profile[]} currentUserId={profile.id} />
    </>
  );
}
