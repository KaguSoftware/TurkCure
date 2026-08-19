"use client";

import * as React from "react";
import { ArrowDown, ArrowUp, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, THead, TBody, Tr, Th, Td } from "@/components/ui/table";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EditableCell } from "@/components/ui/editable-cell";
import { formatMoney } from "@/lib/utils";
import type { CaseAdditionalCost } from "@/lib/types";

export type AdditionalCostValues = { title: string; amount: number };

/**
 * Extras quoted alongside the package but settled separately (0020). They print
 * on the PDF beneath Payment Information and are deliberately inert everywhere
 * else — no package total, no finance.
 *
 * Deliberately no totals row in the table: a subtotal here invites reconciling
 * these against the quote total, which is exactly the confusion the separate
 * table exists to prevent. The summary card above carries Σ extras, clearly
 * labeled as billed separately. No isAdmin branching — there's no cost column,
 * so agents get the full editor.
 */
export function AdditionalCostsTable({
  items,
  currency,
  onUpdate,
  onAdd,
  onDelete,
  onMove,
}: {
  items: CaseAdditionalCost[];
  currency: string;
  onUpdate: (item: CaseAdditionalCost, patch: Partial<AdditionalCostValues>) => void;
  onAdd: (values: AdditionalCostValues) => void;
  onDelete: (item: CaseAdditionalCost) => void;
  onMove: (index: number, delta: -1 | 1) => void;
}) {
  const [confirmDelete, setConfirmDelete] = React.useState<CaseAdditionalCost | null>(null);
  const empty = { title: "", amount: "" };
  const [draft, setDraft] = React.useState(empty);

  function commitDraft(patch: Partial<typeof empty>) {
    const next = { ...draft, ...patch };
    const amount = Number(next.amount);
    if (next.amount !== "" && Number.isFinite(amount) && amount >= 0) {
      onAdd({ title: next.title.trim(), amount });
      setDraft(empty);
    } else {
      setDraft(next);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Additional costs</CardTitle>
        <span className="text-xs text-muted">On the PDF, outside the package total</span>
      </CardHeader>
      <CardContent className="px-0 pb-5">
        <p className="mx-5 -mt-1 mb-3 text-xs text-muted">
          Shown on the PDF beneath Payment Information. Not included in the package total, and not
          counted in Finance.
        </p>
        {/* min-w-0: this card can sit in a 1/3-width column; four columns fit
            without forcing a sideways scroller. */}
        <Table className="min-w-0 border-0 shadow-none">
          <THead>
            <tr>
              <Th>Title</Th>
              <Th className="w-32 text-right">Amount</Th>
              <Th className="w-20" />
              <Th className="w-12" />
            </tr>
          </THead>
          <TBody>
            {items.map((item, index) => (
              <Tr key={item.id}>
                <Td className="py-1.5 font-medium">
                  <EditableCell
                    value={item.title}
                    ariaLabel={`title of cost ${index + 1}`}
                    onCommit={(next) => onUpdate(item, { title: next })}
                  />
                </Td>
                <Td className="py-1.5 font-medium">
                  <EditableCell
                    type="money"
                    align="right"
                    value={String(item.amount)}
                    display={formatMoney(Number(item.amount), currency)}
                    ariaLabel={`amount of cost ${index + 1}`}
                    onCommit={(next) => {
                      const n = Number(next);
                      if (!Number.isFinite(n) || n < 0) return;
                      onUpdate(item, { amount: n });
                    }}
                  />
                </Td>
                <Td className="py-1.5">
                  <span className="flex justify-end gap-0.5">
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Move up"
                      disabled={index === 0}
                      onClick={() => onMove(index, -1)}
                    >
                      <ArrowUp />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Move down"
                      disabled={index === items.length - 1}
                      onClick={() => onMove(index, 1)}
                    >
                      <ArrowDown />
                    </Button>
                  </span>
                </Td>
                <Td className="py-1.5">
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Delete additional cost"
                    className="hover:text-danger"
                    onClick={() => setConfirmDelete(item)}
                  >
                    <Trash2 />
                  </Button>
                </Td>
              </Tr>
            ))}

            {/* Ghost row — becomes a real cost once it has an amount. */}
            <Tr className="bg-surface-hover/30">
              <Td className="py-1.5">
                <EditableCell
                  value={draft.title}
                  placeholder="Add a cost — e.g. Revision surgery"
                  ariaLabel="new cost title"
                  onCommit={(next) => commitDraft({ title: next })}
                />
              </Td>
              <Td className="py-1.5">
                <EditableCell
                  type="money"
                  align="right"
                  value={draft.amount}
                  placeholder="0.00"
                  ariaLabel="new cost amount"
                  onCommit={(next) => commitDraft({ amount: next })}
                />
              </Td>
              <Td colSpan={2} className="py-1.5 text-right text-xs text-muted-light">
                Set an amount to add
              </Td>
            </Tr>

            {items.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 pb-4 pt-2 text-center text-xs text-muted-light">
                  No additional costs — this section is hidden on the PDF.
                </td>
              </tr>
            )}
          </TBody>
        </Table>
      </CardContent>
      <ConfirmDialog
        open={confirmDelete !== null}
        onClose={() => setConfirmDelete(null)}
        onConfirm={() => {
          if (confirmDelete) onDelete(confirmDelete);
          setConfirmDelete(null);
        }}
        pending={false}
        title="Delete additional cost"
        description={
          <>
            {/* The title is optional, so fall back to the amount rather than
                rendering an empty <strong>. */}
            Remove{" "}
            <strong>
              {confirmDelete
                ? confirmDelete.title ||
                  `this ${formatMoney(Number(confirmDelete.amount), currency)} cost`
                : "this cost"}
            </strong>
            ? This cannot be undone.
          </>
        }
      />
    </Card>
  );
}
