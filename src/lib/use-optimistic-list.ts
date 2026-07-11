"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/components/ui/toast";

type ActionResult = { error?: string } | void;

/** Stable temporary id for optimistic rows until the server row arrives. */
export function tempId() {
  return `temp-${crypto.randomUUID()}`;
}

export function isTempId(id: string) {
  return id.startsWith("temp-");
}

/**
 * List state seeded from server props with optimistic mutations.
 *
 * The UI updates instantly from `optimistic`, the server action runs, and a
 * background router.refresh() reconciles with the server afterwards. On error
 * the pre-mutation snapshot is restored and an error toast is shown.
 *
 * Rollback uses a plain snapshot, which assumes mutations don't overlap
 * (forms/buttons disable while pending) — fine for this app's dialogs.
 */
export function useOptimisticList<T extends { id: string }>(serverItems: T[]) {
  const router = useRouter();
  const [items, setItems] = React.useState(serverItems);
  const [pending, setPending] = React.useState(false);

  // Whenever fresh server props arrive (after the background refresh), adopt
  // them as the source of truth (adjust-state-during-render pattern).
  const [prevServerItems, setPrevServerItems] = React.useState(serverItems);
  if (serverItems !== prevServerItems) {
    setPrevServerItems(serverItems);
    setItems(serverItems);
  }

  const mutate = React.useCallback(
    async <R extends ActionResult>(opts: {
      optimistic: (prev: T[]) => T[];
      action: () => Promise<R>;
      success?: string;
      /** Swap temp rows for real server rows once the action returns. */
      reconcile?: (result: R, prev: T[]) => T[];
    }): Promise<{ ok: boolean; result?: R }> => {
      let snapshot: T[] = [];
      setItems((prev) => {
        snapshot = prev;
        return opts.optimistic(prev);
      });
      setPending(true);
      try {
        const result = await opts.action();
        if (result && "error" in result && result.error) {
          setItems(snapshot);
          toast.error(result.error);
          return { ok: false, result };
        }
        if (opts.reconcile) {
          const reconcile = opts.reconcile;
          setItems((prev) => reconcile(result, prev));
        }
        if (opts.success) toast.success(opts.success);
        React.startTransition(() => router.refresh());
        return { ok: true, result };
      } catch {
        setItems(snapshot);
        toast.error("Something went wrong. Please try again.");
        return { ok: false };
      } finally {
        setPending(false);
      }
    },
    [router]
  );

  return { items, setItems, mutate, pending };
}
