"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogOut, Menu, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "./theme-toggle";
import { SidebarContent } from "./sidebar";
import { CommandPalette, SearchTrigger } from "./command-palette";

export function Topbar({
  title,
  isAdmin,
  userName,
}: {
  title?: string;
  isAdmin: boolean;
  userName: string;
}) {
  const router = useRouter();
  const [drawerOpen, setDrawerOpen] = React.useState(false);

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

  async function signOut() {
    await createClient().auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-border bg-surface/80 px-4 backdrop-blur md:px-6">
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          aria-label="Open menu"
          className="md:hidden"
          onClick={() => setDrawerOpen(true)}
        >
          <Menu />
        </Button>
        <h1 className="text-sm font-semibold">{title ?? ""}</h1>
      </div>
      <div className="flex items-center gap-1">
        <SearchTrigger />
        <CommandPalette />
        <ThemeToggle />
        <Button variant="ghost" size="icon" aria-label="Sign out" onClick={signOut}>
          <LogOut />
        </Button>
      </div>

      {drawerOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            className="animate-overlay fixed inset-0 bg-black/40 backdrop-blur-[2px]"
            onClick={() => setDrawerOpen(false)}
          />
          <aside className="animate-drawer fixed inset-y-0 left-0 z-10 flex w-64 flex-col border-r border-border bg-surface shadow-pop">
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
              onNavigate={() => setDrawerOpen(false)}
            />
          </aside>
        </div>
      )}
    </header>
  );
}
