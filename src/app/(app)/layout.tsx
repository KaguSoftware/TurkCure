import { redirect } from "next/navigation";
import { getProfile } from "@/lib/supabase/server";
import { Sidebar } from "@/components/shell/sidebar";
import { Topbar } from "@/components/shell/topbar";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const profile = await getProfile();
  // No profile row or deactivated: sign out via route handler instead of
  // redirecting to /login, which would loop (proxy bounces sessions off /login).
  if (!profile || !profile.active) redirect("/auth/signout");

  return (
    <div className="flex min-h-screen w-full">
      <Sidebar isAdmin={profile.role === "admin"} userName={profile.name} />
      <div className="flex min-w-0 flex-1 flex-col md:pl-60">
        <Topbar />
        <main className="flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
