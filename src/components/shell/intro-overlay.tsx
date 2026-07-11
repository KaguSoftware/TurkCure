"use client";

import * as React from "react";

const KEY_PREFIX = "turkcure:intro:";

function localDateKey() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${KEY_PREFIX}${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function greeting() {
  const h = new Date().getHours();
  if (h < 5) return "Working late";
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

/** Full-screen brand splash, shown once per local day per browser. */
export function IntroOverlay({ userName }: { userName: string }) {
  const [show, setShow] = React.useState(false);
  const [closing, setClosing] = React.useState(false);

  React.useEffect(() => {
    const key = localDateKey();
    try {
      if (localStorage.getItem(key)) return;
      // Prune yesterday's keys so only today's marker sticks around.
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i);
        if (k?.startsWith(KEY_PREFIX) && k !== key) localStorage.removeItem(k);
      }
      localStorage.setItem(key, "1");
    } catch {
      return; // storage unavailable: never show, to avoid replaying every load
    }
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    setShow(true);
    const closeTimer = setTimeout(() => setClosing(true), 1400);
    const doneTimer = setTimeout(() => setShow(false), 1750);
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
        "intro-overlay pointer-events-none fixed inset-0 z-[100] flex items-center justify-center bg-background" +
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
