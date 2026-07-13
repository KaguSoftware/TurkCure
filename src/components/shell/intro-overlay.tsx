"use client";

import * as React from "react";
import { INTRO_COOKIE } from "@/lib/auth/cookies";

// Re-exported for existing importers; the source of truth is @/lib/auth/cookies.
export { INTRO_COOKIE };

function greeting() {
  const h = new Date().getHours();
  if (h < 5) return "Working late";
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

/**
 * Full-screen brand splash, shown once per local day. The layout only renders
 * this when the daily cookie is absent, so the splash is in the initial
 * server-rendered HTML and covers the very first paint — no flash of the app.
 */
export function IntroOverlay({ userName }: { userName: string }) {
  const [show, setShow] = React.useState(true);
  const [closing, setClosing] = React.useState(false);

  React.useEffect(() => {
    // Mark as seen until local midnight.
    const midnight = new Date();
    midnight.setHours(24, 0, 0, 0);
    document.cookie = `${INTRO_COOKIE}=1; path=/; expires=${midnight.toUTCString()}; samesite=lax`;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setShow(false);
      return;
    }
    const closeTimer = setTimeout(() => setClosing(true), 2550);
    const doneTimer = setTimeout(() => setShow(false), 3000);
    return () => {
      clearTimeout(closeTimer);
      clearTimeout(doneTimer);
    };
  }, []);

  if (!show) return null;

  return (
    <div
      aria-hidden
      className={
        "intro-overlay pointer-events-none fixed inset-0 z-100 flex items-center justify-center bg-background" +
        (closing ? " closing" : "")
      }
    >
      <div className="flex flex-col items-center gap-3">
        <div className="intro-content brand-gradient-text text-5xl font-bold tracking-tight">
          TurkCure
        </div>
        <div className="intro-greeting text-sm text-muted">
          {greeting()}, {userName.split(" ")[0]}
        </div>
      </div>
    </div>
  );
}
