import { redirect } from "next/navigation";
import { getProfile } from "@/lib/supabase/server";
import { Sidebar } from "@/components/shell/sidebar";
import { Topbar } from "@/components/shell/topbar";
import { Toaster } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

// Per-user accent themes, keyed by auth email.
const THEME_OVERRIDES: Record<string, string> = {
  "yacjamili@gmail.com": "theme-violet",
};

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const profile = await getProfile();
  // No profile row or deactivated: sign out via route handler instead of
  // redirecting to /login, which would loop (proxy bounces sessions off /login).
  if (!profile || !profile.active) redirect("/auth/signout");

  const themeClass = profile.email ? THEME_OVERRIDES[profile.email.toLowerCase()] : undefined;

  return (
    <div className={cn("flex min-h-screen w-full", themeClass)}>
      <Sidebar isAdmin={profile.role === "admin"} userName={profile.name} />
      <div className="flex min-w-0 flex-1 flex-col md:pl-60">
        <Topbar />
        <main className="flex-1 p-4 md:p-6">{children}</main>
      </div>
      <Toaster />
    </div>
  );
}
