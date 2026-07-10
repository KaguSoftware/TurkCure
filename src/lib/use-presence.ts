"use client";

import * as React from "react";

/**
 * Keeps an element mounted while its exit animation plays.
 * `mounted` — render the element at all; `closing` — apply the exit classes.
 */
export function usePresence(open: boolean, duration = 180) {
  const [mounted, setMounted] = React.useState(open);
  const [closing, setClosing] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setMounted(true);
      setClosing(false);
      return;
    }
    setClosing(true);
    const t = setTimeout(() => {
      setMounted(false);
      setClosing(false);
    }, duration);
    return () => clearTimeout(t);
  }, [open, duration]);

  return { mounted: open || mounted, closing };
}
