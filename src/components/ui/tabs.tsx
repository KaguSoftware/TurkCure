"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Accessible underline tab bar: a `role="tablist"` of `role="tab"` buttons with
 * roving tabindex and Left/Right/Home/End keyboard navigation. Panels are
 * rendered by the caller (conditionally); wrap the active one in `<TabPanel>`
 * so screen readers announce it as a tab panel.
 */
export function TabBar<T extends string>({
  tabs,
  value,
  onChange,
  idBase,
  className,
}: {
  tabs: readonly T[];
  value: T;
  onChange: (tab: T) => void;
  /** Stable prefix so tab/panel ids line up across renders. */
  idBase: string;
  className?: string;
}) {
  const refs = React.useRef<(HTMLButtonElement | null)[]>([]);

  function onKeyDown(e: React.KeyboardEvent, i: number) {
    let next = i;
    if (e.key === "ArrowRight") next = (i + 1) % tabs.length;
    else if (e.key === "ArrowLeft") next = (i - 1 + tabs.length) % tabs.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = tabs.length - 1;
    else return;
    e.preventDefault();
    onChange(tabs[next]);
    refs.current[next]?.focus();
  }

  return (
    // Scrolls sideways rather than wrapping: at 390px the four patient tabs
    // used to break "Case & Quote" across three lines. overflow-y stays hidden:
    // a sideways scroller with computed overflow-y:auto grows a phantom
    // vertical scrollbar from 1px of overflow (fractional browser zoom is
    // enough) — never let these scroll vertically.
    <div
      role="tablist"
      className={cn(
        "flex gap-1 overflow-x-auto overflow-y-hidden border-b border-border [-webkit-overflow-scrolling:touch] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        className
      )}
    >
      {tabs.map((t, i) => {
        const active = t === value;
        return (
          <button
            key={t}
            ref={(el) => {
              refs.current[i] = el;
            }}
            role="tab"
            id={`${idBase}-tab-${i}`}
            aria-selected={active}
            aria-controls={`${idBase}-panel-${i}`}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(t)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={cn(
              // No -mb-px underline overlap: the container clips vertical
              // overflow (see above), so the 2px underline sits flush on the
              // rail instead of over it.
              "pressable shrink-0 whitespace-nowrap border-b-2 px-4 py-3 text-sm font-medium cursor-pointer",
              active
                ? "border-primary text-primary"
                : "border-transparent text-muted hover:text-foreground"
            )}
          >
            {t}
          </button>
        );
      })}
    </div>
  );
}

/** Panel wrapper linked to its tab for `role="tabpanel"` semantics. */
export function TabPanel({
  idBase,
  index,
  children,
}: {
  idBase: string;
  index: number;
  children: React.ReactNode;
}) {
  return (
    <div role="tabpanel" id={`${idBase}-panel-${index}`} aria-labelledby={`${idBase}-tab-${index}`}>
      {children}
    </div>
  );
}
