"use client";

import * as React from "react";

const FOCUSABLE =
  'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

/**
 * Traps Tab focus inside `ref` while `active`, autofocuses the first focusable
 * element on activation, and restores focus to the previously-focused element
 * when it deactivates. Portaled overlays (custom Select popovers, etc.) live
 * outside the container in the DOM, so Tab-cycling only covers what's inside —
 * which is the intended behaviour for a modal.
 */
export function useFocusTrap(
  ref: React.RefObject<HTMLElement | null>,
  active: boolean
) {
  React.useEffect(() => {
    if (!active) return;
    const container = ref.current;
    if (!container) return;

    const root = container;
    const previouslyFocused = document.activeElement as HTMLElement | null;

    // Autofocus the first focusable element (or the container itself).
    const focusables = () =>
      Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null || el === document.activeElement
      );
    const first = focusables()[0];
    (first ?? root).focus();

    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Tab") return;
      const els = focusables();
      if (els.length === 0) {
        e.preventDefault();
        return;
      }
      const firstEl = els[0];
      const lastEl = els[els.length - 1];
      const activeEl = document.activeElement;
      if (e.shiftKey && (activeEl === firstEl || !root.contains(activeEl))) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && activeEl === lastEl) {
        e.preventDefault();
        firstEl.focus();
      }
    }

    root.addEventListener("keydown", onKeyDown);
    return () => {
      root.removeEventListener("keydown", onKeyDown);
      // Restore focus to whatever was focused before the trap opened.
      previouslyFocused?.focus?.();
    };
  }, [active, ref]);
}
