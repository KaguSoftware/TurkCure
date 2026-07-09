"use client";

import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
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
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/patients", label: "Patients", icon: Users },
  { href: "/hospitals", label: "Hospitals", icon: Building2 },
  { href: "/hotels", label: "Hotels", icon: Hotel },
  { href: "/drivers", label: "Drivers", icon: Car },
  { href: "/templates", label: "Instructions", icon: ClipboardList },
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

export function Sidebar({ isAdmin, userName }: { isAdmin: boolean; userName: string }) {
  const pathname = usePathname();

  const link = (item: (typeof NAV)[number]) => {
    const active = pathname === item.href || pathname.startsWith(item.href + "/");
    return (
      <Link
        key={item.href}
        href={item.href}
        className={cn(
          "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
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
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-border bg-surface md:flex">
      <div className="flex h-14 items-center border-b border-border px-5">
        <Link href="/dashboard" className="text-lg font-bold tracking-tight">
          <span className="brand-gradient-text">TurkCure</span>
        </Link>
      </div>
      <nav className="flex-1 space-y-0.5 overflow-y-auto p-3">
        {NAV.map(link)}
        {isAdmin && (
          <>
            <div className="pt-4 pb-1 px-3 text-[10px] font-semibold uppercase tracking-wider text-muted-light">
              Admin
            </div>
            {ADMIN_NAV.map(link)}
            {link({ href: "/settings", label: "Settings", icon: Settings })}
          </>
        )}
      </nav>
      <div className="border-t border-border p-4">
        <div className="flex items-center gap-3">
          <div className="brand-gradient-bg flex size-8 items-center justify-center rounded-full text-xs font-semibold text-white">
            {userName.slice(0, 1).toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{userName}</p>
            <p className="text-xs text-muted">{isAdmin ? "Administrator" : "Agent"}</p>
          </div>
        </div>
      </div>
    </aside>
  );
}
