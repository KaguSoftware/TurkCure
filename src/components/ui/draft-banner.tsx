"use client";

import * as React from "react";
import { History } from "lucide-react";
import { cn } from "@/lib/utils";
import type { FormDraft } from "@/lib/use-form-draft";

/**
 * Shown above a form whose fields were silently restored from a local draft
 * (see useFormDraft). Restoring costs zero clicks; throwing the draft away is
 * one. Renders nothing when no draft is active.
 */
export function DraftBanner({ draft, className }: { draft: FormDraft; className?: string }) {
  if (draft.restoredAt === null) return null;
  const mins = Math.max(1, Math.round((Date.now() - draft.restoredAt) / 60000));
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-warning-soft px-3 py-2 text-xs text-warning",
        className
      )}
    >
      <span className="inline-flex items-center gap-1.5">
        <History className="size-3.5 shrink-0" />
        Restored unsaved changes from {mins} min ago.
      </span>
      <button
        type="button"
        onClick={draft.discard}
        className="font-medium underline underline-offset-2 hover:opacity-80 cursor-pointer"
      >
        Discard
      </button>
    </div>
  );
}
