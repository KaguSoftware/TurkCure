"use client";

import Link, { useLinkStatus } from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  Building2,
  Hotel,
  Car,
  Wallet,
  Settings,
  ClipboardList,
  Loader2,
  LogOut,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/patients", label: "Patients", icon: Users },
  { href: "/hospitals", label: "Hospitals", icon: Building2 },
  { href: "/hotels", label: "Hotels", icon: Hotel },
  { href: "/drivers", label: "Drivers", icon: Car },
  { href: "/templates", label: "Instructions", icon: ClipboardList },
  { href: "/settings", label: "Settings", icon: Settings },
];

const ADMIN_NAV = [{ href: "/finance", label: "Finance", icon: Wallet }];

/** Shows the nav icon, swapping in a spinner while this link's navigation is pending. */
function NavIcon({ Icon }: { Icon: (typeof NAV)[number]["icon"] }) {
  const { pending } = useLinkStatus();
  return pending ? (
    <Loader2 className="size-4 shrink-0 animate-spin" />
  ) : (
    <Icon className="size-4 shrink-0" />
  );
}

/** Nav links + user footer, shared by the fixed sidebar and the mobile drawer. */
export function SidebarContent({
  isAdmin,
  userName,
  avatarUrl,
  onNavigate,
}: {
  isAdmin: boolean;
  userName: string;
  avatarUrl?: string | null;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const router = useRouter();

  async function signOut() {
    await createClient().auth.signOut();
    router.push("/login");
    router.refresh();
  }

  const link = (item: (typeof NAV)[number]) => {
    const active = pathname === item.href || pathname.startsWith(item.href + "/");
    return (
      <Link
        key={item.href}
        href={item.href}
        onClick={onNavigate}
        aria-current={active ? "page" : undefined}
        className={cn(
          "pressable flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium",
          active
            ? "bg-primary-soft text-primary"
            : "text-muted hover:bg-surface-hover hover:text-foreground"
        )}
      >
        <NavIcon Icon={item.icon} />
        {item.label}
      </Link>
    );
  };

  return (
    <>
      <nav aria-label="Main navigation" className="flex-1 space-y-0.5 overflow-y-auto p-3">
        {NAV.map(link)}
        {isAdmin && (
          <>
            <div className="pt-4 pb-1 px-3 text-[10px] font-semibold uppercase tracking-wider text-muted-light">
              Admin
            </div>
            {ADMIN_NAV.map(link)}
          </>
        )}
      </nav>
      <div className="border-t border-border p-4">
        <div className="flex items-center gap-3">
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- Supabase public URL, tiny avatar
            <img
              src={avatarUrl}
              alt=""
              className="size-8 shrink-0 rounded-full border border-border object-cover"
            />
          ) : (
            <div className="brand-gradient-bg flex size-8 items-center justify-center rounded-full text-xs font-semibold text-white">
              {userName.slice(0, 1).toUpperCase()}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{userName}</p>
            <p className="text-xs text-muted">{isAdmin ? "Administrator" : "Agent"}</p>
          </div>
          <button
            onClick={signOut}
            aria-label="Sign out"
            className="pressable shrink-0 rounded-lg p-2 text-muted hover:bg-surface-hover hover:text-foreground cursor-pointer"
          >
            <LogOut className="size-4" />
          </button>
        </div>
      </div>
    </>
  );
}

export function Sidebar({
  isAdmin,
  userName,
  avatarUrl,
}: {
  isAdmin: boolean;
  userName: string;
  avatarUrl?: string | null;
}) {
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-border bg-surface md:flex">
      <div className="flex h-14 items-center border-b border-border px-5">
        <Link href="/dashboard" className="text-lg font-bold tracking-tight">
          <span className="brand-gradient-text">TurkCure</span>
        </Link>
      </div>
      <SidebarContent isAdmin={isAdmin} userName={userName} avatarUrl={avatarUrl} />
    </aside>
  );
}
