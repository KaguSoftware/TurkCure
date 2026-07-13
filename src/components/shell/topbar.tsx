"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePresence } from "@/lib/use-presence";
import { useFocusTrap } from "@/lib/use-focus-trap";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "./theme-toggle";
import { SidebarContent } from "./sidebar";
import { CommandPalette, SearchTrigger, openCommandPalette } from "./command-palette";

// Route prefix → page title for wayfinding (mainly the mobile top bar, which
// otherwise shows only a hamburger). Longest prefix wins.
const ROUTE_TITLES: [string, string][] = [
  ["/dashboard", "Dashboard"],
  ["/patients/import", "Import Patients"],
  ["/patients", "Patients"],
  ["/hospitals", "Hospitals"],
  ["/hotels", "Hotels"],
  ["/drivers", "Drivers"],
  ["/templates", "Instructions"],
  ["/finance", "Finance"],
  ["/settings", "Settings"],
];

function titleForPath(pathname: string): string {
  for (const [prefix, label] of ROUTE_TITLES) {
    if (pathname === prefix || pathname.startsWith(prefix + "/")) return label;
  }
  return "";
}

export function Topbar({
  title,
  isAdmin,
  userName,
  avatarUrl,
}: {
  title?: string;
  isAdmin: boolean;
  userName: string;
  avatarUrl?: string | null;
}) {
  const pathname = usePathname();
  const pageTitle = title ?? titleForPath(pathname);
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const { mounted: drawerMounted, closing: drawerClosing } = usePresence(drawerOpen, 240);
  const drawerRef = React.useRef<HTMLElement>(null);
  useFocusTrap(drawerRef, drawerOpen && drawerMounted);

  React.useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setDrawerOpen(false);
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [drawerOpen]);

  return (
    <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-border bg-surface/80 px-4 backdrop-blur md:px-6">
      <div className="flex min-w-0 items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          aria-label="Open menu"
          className="md:hidden"
          onClick={() => setDrawerOpen(true)}
        >
          <Menu />
        </Button>
        {pageTitle && <h1 className="truncate text-sm font-semibold">{pageTitle}</h1>}
      </div>
      <div className="flex items-center gap-1">
        <SearchTrigger />
        {/* Below sm the SearchTrigger is hidden and there's no keyboard shortcut on
            touch devices, so surface a plain search button that opens the palette. */}
        <Button
          variant="ghost"
          size="icon"
          aria-label="Search"
          className="sm:hidden"
          onClick={openCommandPalette}
        >
          <Search />
        </Button>
        <CommandPalette />
        <ThemeToggle />
      </div>

      {drawerMounted &&
        createPortal(
          <div className="fixed inset-0 z-50 md:hidden">
            <div
              className={cn(
                "animate-overlay fixed inset-0 bg-black/40 backdrop-blur-[2px]",
                drawerClosing && "animate-overlay-out"
              )}
              onClick={() => setDrawerOpen(false)}
            />
            <aside
              ref={drawerRef}
              className={cn(
                "animate-drawer fixed inset-y-0 left-0 z-10 flex w-64 flex-col border-r border-border bg-surface shadow-pop",
                drawerClosing && "animate-drawer-out"
              )}
            >
              <div className="flex h-14 items-center justify-between border-b border-border px-5">
                <Link
                  href="/dashboard"
                  onClick={() => setDrawerOpen(false)}
                  className="text-lg font-bold tracking-tight"
                >
                  <span className="brand-gradient-text">TurkCure</span>
                </Link>
                <button
                  onClick={() => setDrawerOpen(false)}
                  aria-label="Close menu"
                  className="rounded-md p-1 text-muted hover:bg-surface-hover hover:text-foreground cursor-pointer"
                >
                  <X className="size-4" />
                </button>
              </div>
              <SidebarContent
                isAdmin={isAdmin}
                userName={userName}
                avatarUrl={avatarUrl}
                onNavigate={() => setDrawerOpen(false)}
              />
            </aside>
          </div>,
          document.body
        )}
    </header>
  );
}
