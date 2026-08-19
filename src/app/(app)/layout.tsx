import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getProfile } from "@/lib/supabase/server";
import { Sidebar } from "@/components/shell/sidebar";
import { Topbar } from "@/components/shell/topbar";
import { MainScroller } from "@/components/shell/main-scroller";
import { Toaster } from "@/components/ui/toast";
import { IntroOverlay, INTRO_COOKIE } from "@/components/shell/intro-overlay";
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
  // Cookie-gated so the splash is part of the first server-rendered paint
  // (no flash of the app before it appears). The client sets the cookie to
  // expire at local midnight, so it plays once per day.
  const introSeen = (await cookies()).has(INTRO_COOKIE);

  return (
    // h-dvh + overflow-hidden: the shell itself never scrolls — MainScroller
    // owns scrolling below the topbar, so the scrollbar no longer runs the full
    // viewport height through the topbar's edge.
    <div data-accent-root className={cn("flex h-dvh w-full overflow-hidden", themeClass)}>
      <Sidebar
        isAdmin={profile.role === "admin"}
        userName={profile.name}
        avatarUrl={profile.avatar_url}
      />
      <div className="flex min-w-0 flex-1 flex-col md:pl-60">
        <Topbar
          isAdmin={profile.role === "admin"}
          userName={profile.name}
          avatarUrl={profile.avatar_url}
        />
        <MainScroller>{children}</MainScroller>
      </div>
      <Toaster />
      {!introSeen && <IntroOverlay userName={profile.name} />}
    </div>
  );
}
