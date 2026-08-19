"use client";

import * as React from "react";
import { ArrowDown, ArrowUp, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, THead, TBody, Tr, Th, Td } from "@/components/ui/table";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EditableCell } from "@/components/ui/editable-cell";
import { formatMoney } from "@/lib/utils";
import type { QuoteItem } from "@/lib/types";

// Suggested quote-item labels — the fast path only; `kind` is free text (0017)
// and blank is valid. Lowercase matches the values stored since the pre-0017 enum.
const KIND_SUGGESTIONS = ["surgery", "hotel", "transfer", "extra"];

export type QuoteItemValues = {
  kind: string;
  description: string;
  price: number;
  cost?: number;
};

/**
 * The quote as a spreadsheet: every cell edits in place, rows reorder with
 * arrows, and the last row is always a ghost — type into it and the item is
 * created the moment it has a price. No forms, no dialogs.
 */
export function QuoteTable({
  items,
  currency,
  isAdmin,
  onUpdate,
  onAdd,
  onDelete,
  onMove,
}: {
  items: QuoteItem[];
  currency: string;
  isAdmin: boolean;
  onUpdate: (item: QuoteItem, patch: Partial<QuoteItemValues>) => void;
  onAdd: (values: QuoteItemValues) => void;
  onDelete: (item: QuoteItem) => void;
  onMove: (index: number, delta: -1 | 1) => void;
}) {
  const [confirmDelete, setConfirmDelete] = React.useState<QuoteItem | null>(null);
  // The ghost row's draft, held as strings until a valid price makes it real.
  const empty = { kind: "", description: "", cost: "", price: "" };
  const [draft, setDraft] = React.useState(empty);

  const totalPrice = items.reduce((s, i) => s + Number(i.price), 0);
  const totalCost = items.reduce((s, i) => s + Number(i.cost ?? 0), 0);

  function commitDraft(patch: Partial<typeof empty>) {
    const next = { ...draft, ...patch };
    const price = Number(next.price);
    if (next.price !== "" && Number.isFinite(price) && price >= 0) {
      onAdd({
        kind: next.kind.trim(),
        description: next.description.trim(),
        price,
        cost: isAdmin && next.cost !== "" ? Number(next.cost) : undefined,
      });
      setDraft(empty);
    } else {
      setDraft(next);
    }
  }

  const moneyCommit =
    (item: QuoteItem, key: "price" | "cost") =>
    (next: string) => {
      const n = Number(next);
      if (!Number.isFinite(n) || n < 0) return; // leave the stored value alone
      onUpdate(item, { [key]: n });
    };

  const colSpan = isAdmin ? 6 : 5;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Quote</CardTitle>
        <span className="text-xs text-muted">
          Click any cell to edit — changes save instantly
        </span>
      </CardHeader>
      <CardContent className="px-0 pb-5">
        <Table className="border-0 shadow-none">
          <THead>
            <tr>
              <Th className="w-36">Type</Th>
              <Th>Description</Th>
              {isAdmin && <Th className="w-32 text-right">Cost</Th>}
              <Th className="w-32 text-right">Price</Th>
              <Th className="w-20" />
              <Th className="w-12" />
            </tr>
          </THead>
          <TBody>
            {items.map((item, index) => (
              <Tr key={item.id}>
                <Td className="py-1.5">
                  <EditableCell
                    value={item.kind}
                    display={
                      item.kind ? <span className="capitalize text-muted">{item.kind}</span> : undefined
                    }
                    suggestions={KIND_SUGGESTIONS}
                    ariaLabel={`type of row ${index + 1}`}
                    onCommit={(next) => onUpdate(item, { kind: next })}
                  />
                </Td>
                <Td className="py-1.5 font-medium">
                  <EditableCell
                    value={item.description}
                    ariaLabel={`description of row ${index + 1}`}
                    onCommit={(next) => onUpdate(item, { description: next })}
                  />
                </Td>
                {isAdmin && (
                  <Td className="py-1.5">
                    <EditableCell
                      type="money"
                      align="right"
                      value={String(item.cost ?? 0)}
                      display={
                        <span className="text-muted">
                          {formatMoney(Number(item.cost ?? 0), currency)}
                        </span>
                      }
                      ariaLabel={`cost of row ${index + 1}`}
                      onCommit={moneyCommit(item, "cost")}
                    />
                  </Td>
                )}
                <Td className="py-1.5 font-medium">
                  <EditableCell
                    type="money"
                    align="right"
                    value={String(item.price)}
                    display={formatMoney(Number(item.price), currency)}
                    ariaLabel={`price of row ${index + 1}`}
                    onCommit={moneyCommit(item, "price")}
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
                    aria-label="Delete item"
                    className="hover:text-danger"
                    onClick={() => setConfirmDelete(item)}
                  >
                    <Trash2 />
                  </Button>
                </Td>
              </Tr>
            ))}

            {/* The ghost row: always present, becomes a real item once priced. */}
            <Tr className="bg-surface-hover/30">
              <Td className="py-1.5">
                <EditableCell
                  value={draft.kind}
                  placeholder="Type…"
                  suggestions={KIND_SUGGESTIONS}
                  ariaLabel="new item type"
                  onCommit={(next) => commitDraft({ kind: next })}
                />
              </Td>
              <Td className="py-1.5">
                <EditableCell
                  value={draft.description}
                  placeholder="Add an item — e.g. FUE 3500 grafts"
                  ariaLabel="new item description"
                  onCommit={(next) => commitDraft({ description: next })}
                />
              </Td>
              {isAdmin && (
                <Td className="py-1.5">
                  <EditableCell
                    type="money"
                    align="right"
                    value={draft.cost}
                    placeholder="0.00"
                    ariaLabel="new item cost"
                    onCommit={(next) => commitDraft({ cost: next })}
                  />
                </Td>
              )}
              <Td className="py-1.5">
                <EditableCell
                  type="money"
                  align="right"
                  value={draft.price}
                  placeholder="0.00"
                  ariaLabel="new item price"
                  onCommit={(next) => commitDraft({ price: next })}
                />
              </Td>
              <Td colSpan={2} className="py-1.5 text-right text-xs text-muted-light">
                Set a price to add
              </Td>
            </Tr>

            {items.length > 0 && (
              <Tr className="bg-surface-hover/40">
                <Td className="text-xs font-semibold uppercase tracking-wider text-muted">
                  Total
                </Td>
                <Td />
                {isAdmin && (
                  <Td className="pr-2 text-right font-semibold text-muted">
                    {formatMoney(totalCost, currency)}
                  </Td>
                )}
                <Td className="pr-2 text-right font-bold">{formatMoney(totalPrice, currency)}</Td>
                <Td colSpan={2}>
                  {isAdmin && (
                    <span
                      className={
                        "block text-right text-xs font-medium " +
                        (totalPrice - totalCost >= 0 ? "text-success" : "text-danger")
                      }
                    >
                      {formatMoney(totalPrice - totalCost, currency)} margin
                    </span>
                  )}
                </Td>
              </Tr>
            )}
            {items.length === 0 && (
              <tr>
                <td colSpan={colSpan} className="px-4 pb-4 pt-2 text-center text-xs text-muted-light">
                  No quote items yet — type into the row above to add the first one.
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
        title="Delete quote item"
        description={
          <>
            {/* Both labels are optional, so fall back through them to the price
                rather than rendering an empty <strong>. */}
            Remove{" "}
            <strong>
              {confirmDelete
                ? confirmDelete.description ||
                  confirmDelete.kind ||
                  `this ${formatMoney(Number(confirmDelete.price), currency)} item`
                : "this item"}
            </strong>{" "}
            from the quote? This cannot be undone.
          </>
        }
      />
    </Card>
  );
}
