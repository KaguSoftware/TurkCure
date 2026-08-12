"use client";

import * as React from "react";
import { FileDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";
import { formatDate } from "@/lib/utils";
import type { Case } from "@/lib/types";

/**
 * Picks which of a patient's cases go into one PDF. Selecting a single case
 * routes to the existing single-case route rather than the combined one: two
 * code paths producing two slightly different single-case documents (2.1 vs 2,
 * an extra per-case heading) would be a support liability.
 */
export function CombinedPdfDialog({
  open,
  onClose,
  cases,
}: {
  open: boolean;
  onClose: () => void;
  cases: Case[];
}) {
  // Default to everything checked — "give me all of it" is the common case.
  const [selected, setSelected] = React.useState<ReadonlySet<string>>(
    () => new Set(cases.map((c) => c.id))
  );

  // Drop ids that no longer exist if the case list changes under us.
  const [seenCases, setSeenCases] = React.useState(cases);
  if (seenCases !== cases) {
    setSeenCases(cases);
    setSelected((prev) => new Set(cases.filter((c) => prev.has(c.id)).map((c) => c.id)));
  }

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const allSelected = cases.length > 0 && cases.every((c) => selected.has(c.id));
  const ids = cases.filter((c) => selected.has(c.id)).map((c) => c.id);
  const mixedCurrency =
    new Set(cases.filter((c) => selected.has(c.id)).map((c) => c.currency)).size > 1;

  const href =
    ids.length === 1 ? `/api/pdf/${ids[0]}` : `/api/pdf/combined?cases=${ids.join(",")}`;

  return (
    <Dialog open={open} onClose={onClose} title="Download combined PDF">
      <div className="space-y-4">
        <p className="text-sm text-muted">
          Pick the cases to include. Patient details, contact block and the signature page appear
          once; each case gets its own cover and sections.
        </p>

        <div className="overflow-hidden rounded-xl border border-border">
          <label className="flex cursor-pointer items-center gap-3 border-b border-border bg-surface-hover/40 px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-muted">
            <input
              type="checkbox"
              aria-label="Select all cases"
              checked={allSelected}
              onChange={() =>
                setSelected(allSelected ? new Set() : new Set(cases.map((c) => c.id)))
              }
              className="size-4 cursor-pointer accent-[var(--color-primary)]"
            />
            Select all
          </label>
          {cases.map((c) => (
            <label
              key={c.id}
              className="flex cursor-pointer items-center gap-3 border-b border-border px-4 py-3 last:border-b-0 hover:bg-surface-hover"
            >
              <input
                type="checkbox"
                checked={selected.has(c.id)}
                onChange={() => toggle(c.id)}
                className="size-4 cursor-pointer accent-[var(--color-primary)]"
              />
              <span className="min-w-0 flex-1 text-sm font-medium">
                {c.operation_types?.name ?? "Case"}
              </span>
              {c.arrival_date && (
                <span className="text-xs text-muted">{formatDate(c.arrival_date)}</span>
              )}
              {mixedCurrency && (
                <span className="text-xs font-medium text-muted-light">{c.currency}</span>
              )}
            </label>
          ))}
        </div>

        {mixedCurrency && (
          <p className="rounded-lg bg-surface-hover px-3 py-2 text-xs text-muted">
            Selected cases use different currencies — the PDF shows each case&rsquo;s totals
            separately and prints no combined total.
          </p>
        )}

        <div className="flex items-center justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <a
            href={ids.length > 0 ? href : undefined}
            download
            onClick={() => {
              if (ids.length === 0) return;
              // renderToBuffer over several cases isn't instant and <a download>
              // gives no feedback, so the operator clicks twice without this.
              toast.success("Preparing your PDF…");
              onClose();
            }}
          >
            <Button disabled={ids.length === 0}>
              <FileDown /> Download {ids.length > 1 ? `${ids.length} cases` : "PDF"}
            </Button>
          </a>
        </div>
      </div>
    </Dialog>
  );
}
