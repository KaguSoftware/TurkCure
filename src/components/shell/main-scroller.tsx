"use client";

import * as React from "react";
import { usePathname } from "next/navigation";

/**
 * The app's scroll container. Scrolling lives here, below the topbar, instead
 * of on the window — the window scrollbar ran the full viewport height and cut
 * through the sticky topbar's right edge (its reserved gutter showed the page
 * background sliding past next to the header).
 *
 * Because the window no longer scrolls, Next's built-in scroll-to-top on
 * navigation is a no-op — reset manually on pathname change. Deliberately not
 * keyed on search params: ?tab= / ?case= updates must keep the scroll position
 * (they already navigate with scroll: false).
 */
export function MainScroller({ children }: { children: React.ReactNode }) {
  const ref = React.useRef<HTMLElement>(null);
  const pathname = usePathname();

  React.useEffect(() => {
    ref.current?.scrollTo({ top: 0 });
  }, [pathname]);

  return (
    <main
      ref={ref}
      className="flex-1 overflow-y-auto p-4 md:p-6 [scrollbar-gutter:stable]"
    >
      {children}
    </main>
  );
}
