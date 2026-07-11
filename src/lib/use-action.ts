"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/components/ui/toast";

type ActionResult = { error?: string } | void;

/**
 * Wraps a server-action call with pending state, error/success toasts and a
 * router.refresh() so server components re-render with fresh data.
 */
export function useAction() {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);

  const run = React.useCallback(
    async <T extends ActionResult>(
      action: Promise<T> | (() => Promise<T>),
      opts?: { success?: string; refresh?: boolean | "blocking"; onSuccess?: (result: T) => void }
    ): Promise<{ ok: boolean; result?: T }> => {
      setPending(true);
      try {
        const result = await (typeof action === "function" ? action() : action);
        if (result && "error" in result && result.error) {
          toast.error(result.error);
          return { ok: false, result };
        }
        if (opts?.success) toast.success(opts.success);
        opts?.onSuccess?.(result as T);
        if (opts?.refresh === "blocking") router.refresh();
        else if (opts?.refresh !== false) {
          // Background reconciliation: don't block the UI on the RSC refetch.
          React.startTransition(() => router.refresh());
        }
        return { ok: true, result };
      } catch {
        toast.error("Something went wrong. Please try again.");
        return { ok: false };
      } finally {
        setPending(false);
      }
    },
    [router]
  );

  return { run, pending };
}
