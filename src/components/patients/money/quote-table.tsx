"use client";

import * as React from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Field, ComboBox } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Table, THead, TBody, Tr, Th, Td, EmptyRow } from "@/components/ui/table";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EditableCell } from "@/components/ui/editable-cell";
import { formatMoney } from "@/lib/utils";
import type { QuoteItem } from "@/lib/types";

// Suggested quote-item labels — the fast path only; `kind` is free text (0017)
// and blank is valid. `id` is the stored value (lowercase, matching the
// pre-0017 enum labels).
const KIND_SUGGESTIONS = [
  { id: "surgery", name: "Surgery" },
  { id: "hotel", name: "Hotel" },
  { id: "transfer", name: "Transfer" },
  { id: "extra", name: "Extra" },
];

/** Plain values for the EditableCell datalist. */
const KIND_NAMES = KIND_SUGGESTIONS.map((k) => k.id);

export type QuoteItemValues = {
  kind: string;
  description: string;
  price: number;
  cost?: number;
};

/**
 * The quote: adding goes through a focused dialog (the one obvious path,
 * matching "Record payment"), while existing cells stay editable in place for
 * quick fixes. Row controls (reorder/delete) appear on hover so rows read as
 * data, not toolbars.
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
  const [addOpen, setAddOpen] = React.useState(false);

  const totalPrice = items.reduce((s, i) => s + Number(i.price), 0);
  const totalCost = items.reduce((s, i) => s + Number(i.cost ?? 0), 0);

  const moneyCommit =
    (item: QuoteItem, key: "price" | "cost") =>
    (next: string) => {
      const n = Number(next);
      if (!Number.isFinite(n) || n < 0) return; // leave the stored value alone
      onUpdate(item, { [key]: n });
    };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Quote</CardTitle>
        <div className="flex items-center gap-3">
          <span className="hidden text-xs text-muted sm:inline">Click any cell to edit</span>
          <Button variant="soft" size="sm" onClick={() => setAddOpen(true)}>
            <Plus /> Add item
          </Button>
        </div>
      </CardHeader>
      <CardContent className="px-0 pb-5">
        <Table className="border-0 shadow-none">
          <THead>
            <tr>
              <Th className="w-36">Type</Th>
              <Th>Description</Th>
              {isAdmin && <Th className="w-32 text-right">Cost</Th>}
              <Th className="w-32 text-right">Price</Th>
              <Th className="w-28" />
            </tr>
          </THead>
          <TBody>
            {items.length === 0 && (
              <EmptyRow
                colSpan={isAdmin ? 5 : 4}
                message="No quote items yet — press “Add item” to start the quote."
              />
            )}
            {items.map((item, index) => (
              <Tr key={item.id} className="group">
                <Td className="py-1.5">
                  <EditableCell
                    value={item.kind}
                    display={
                      item.kind ? <span className="capitalize text-muted">{item.kind}</span> : undefined
                    }
                    suggestions={KIND_NAMES}
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
                  <RowControls
                    index={index}
                    count={items.length}
                    onMove={onMove}
                    onDelete={() => setConfirmDelete(item)}
                    deleteLabel="Delete item"
                  />
                </Td>
              </Tr>
            ))}
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
                <Td>
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
          </TBody>
        </Table>
      </CardContent>

      <QuoteItemDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        currency={currency}
        isAdmin={isAdmin}
        onAdd={onAdd}
      />

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

/**
 * Reorder + delete for one row. Hidden until the row is hovered (or a control
 * inside it is focused) on pointer devices; always visible below md, where
 * there is no hover.
 */
export function RowControls({
  index,
  count,
  onMove,
  onDelete,
  deleteLabel,
}: {
  index: number;
  count: number;
  onMove: (index: number, delta: -1 | 1) => void;
  onDelete: () => void;
  deleteLabel: string;
}) {
  return (
    <span className="flex justify-end gap-0.5 transition-opacity md:opacity-0 md:focus-within:opacity-100 md:group-hover:opacity-100">
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
        disabled={index === count - 1}
        onClick={() => onMove(index, 1)}
      >
        <ArrowDown />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        aria-label={deleteLabel}
        className="hover:text-danger"
        onClick={onDelete}
      >
        <Trash2 />
      </Button>
    </span>
  );
}

/**
 * Focused add dialog. "Add & another" keeps it open with cleared fields for
 * the common case of entering a whole quote in one sitting; plain "Add" closes.
 * Adds are optimistic, so neither button waits on the server.
 */
function QuoteItemDialog({
  open,
  onClose,
  currency,
  isAdmin,
  onAdd,
}: {
  open: boolean;
  onClose: () => void;
  currency: string;
  isAdmin: boolean;
  onAdd: (values: QuoteItemValues) => void;
}) {
  const formRef = React.useRef<HTMLFormElement>(null);
  // The Type ComboBox keeps its value in React state, so form.reset() can't
  // clear it — remount the form instead for "Add & another".
  const [formKey, setFormKey] = React.useState(0);

  function submit(addAnother: boolean) {
    const form = formRef.current;
    if (!form || !form.reportValidity()) return;
    const fd = new FormData(form);
    onAdd({
      kind: String(fd.get("kind") ?? "").trim(),
      description: String(fd.get("description") ?? "").trim(),
      price: Number(fd.get("price") || 0),
      cost: isAdmin ? Number(fd.get("cost") || 0) : undefined,
    });
    if (addAnother) setFormKey((k) => k + 1);
    else onClose();
  }

  return (
    <Dialog open={open} onClose={onClose} title="Add quote item">
      <form
        key={formKey}
        ref={formRef}
        onSubmit={(e) => {
          e.preventDefault();
          submit(false);
        }}
        className="space-y-4"
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Type">
            <ComboBox
              name="kind"
              freeText
              options={KIND_SUGGESTIONS}
              placeholder="Pick, type, or leave blank"
              createLabel="Use"
            />
          </Field>
          {/* Both label fields are optional — a line can be priced without
              being named (see 0017). */}
          <Field label="Description">
            <Input name="description" placeholder="e.g. FUE 3500 grafts" />
          </Field>
          {isAdmin && (
            <Field label={`Cost (${currency})`}>
              <Input name="cost" type="number" step="0.01" min="0" placeholder="0.00" />
            </Field>
          )}
          <Field label={`Price (${currency})`}>
            <Input name="price" type="number" step="0.01" min="0" required placeholder="0.00" />
          </Field>
        </div>
        <p className="text-xs text-muted-light">
          The description also appears on the PDF as a package bullet.
        </p>
        <div className="flex items-center justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" variant="soft" onClick={() => submit(true)}>
            Add &amp; another
          </Button>
          <Button type="submit">
            <Plus /> Add item
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
