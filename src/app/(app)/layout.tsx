import { redirect } from "next/navigation";
import { getProfile } from "@/lib/supabase/server";
import { Sidebar } from "@/components/shell/sidebar";
import { Topbar } from "@/components/shell/topbar";
import { Toaster } from "@/components/ui/toast";
import { IntroOverlay } from "@/components/shell/intro-overlay";
import { cn } from "@/lib/utils";
import type { AccentTheme } from "@/lib/types";

// Literal class map keeps Tailwind-safe class names and rejects unknown values.
const ACCENT_CLASS: Record<AccentTheme, string | undefined> = {
  default: undefined,
  violet: "theme-violet",
  emerald: "theme-emerald",
  amber: "theme-amber",
};

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const profile = await getProfile();
  // No profile row or deactivated: sign out via route handler instead of
  // redirecting to /login, which would loop (proxy bounces sessions off /login).
  if (!profile || !profile.active) redirect("/auth/signout");

  const themeClass = ACCENT_CLASS[profile.accent_theme];

  return (
    <div className={cn("flex min-h-screen w-full", themeClass)}>
      <Sidebar isAdmin={profile.role === "admin"} userName={profile.name} />
      <div className="flex min-w-0 flex-1 flex-col md:pl-60">
        <Topbar isAdmin={profile.role === "admin"} userName={profile.name} />
        <main className="flex-1 p-4 md:p-6">{children}</main>
      </div>
      <Toaster />
      <IntroOverlay userName={profile.name} />
    </div>
  );
}
