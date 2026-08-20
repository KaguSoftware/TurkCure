"use client";

import * as React from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Field } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Table, THead, TBody, Tr, Th, Td, EmptyRow } from "@/components/ui/table";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DraftBanner } from "@/components/ui/draft-banner";
import { EditableCell } from "@/components/ui/editable-cell";
import { useFormDraft } from "@/lib/use-form-draft";
import { formatMoney } from "@/lib/utils";
import type { CaseAdditionalCost } from "@/lib/types";
import { RowControls } from "./quote-table";

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
  caseId,
  items,
  currency,
  onUpdate,
  onAdd,
  onDelete,
  onMove,
}: {
  caseId: string;
  items: CaseAdditionalCost[];
  currency: string;
  onUpdate: (item: CaseAdditionalCost, patch: Partial<AdditionalCostValues>) => void;
  onAdd: (values: AdditionalCostValues) => void;
  onDelete: (item: CaseAdditionalCost) => void;
  onMove: (index: number, delta: -1 | 1) => void;
}) {
  const [confirmDelete, setConfirmDelete] = React.useState<CaseAdditionalCost | null>(null);
  const [addOpen, setAddOpen] = React.useState(false);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Additional costs</CardTitle>
        <Button variant="soft" size="sm" onClick={() => setAddOpen(true)}>
          <Plus /> Add cost
        </Button>
      </CardHeader>
      {/* Inset bordered table, matching the Quote card. */}
      <CardContent className="px-5 pb-5">
        <p className="-mt-1 mb-3 text-xs text-muted">
          Shown on the PDF beneath Payment Information. Not included in the package total, and not
          counted in Finance.
        </p>
        <Table>
          <THead>
            <tr>
              <Th>Title</Th>
              <Th className="w-32 text-right">Amount</Th>
              <Th className="w-28" />
            </tr>
          </THead>
          <TBody>
            {items.length === 0 && (
              <EmptyRow
                colSpan={3}
                message="No additional costs — this section is hidden on the PDF."
              />
            )}
            {items.map((item, index) => (
              <Tr key={item.id} className="group">
                {/* px-2 + the control's own px-2 = the same 16px inset as the
                    px-4 headers; see quote-table. */}
                <Td className="px-2 py-1.5 font-medium">
                  <EditableCell
                    value={item.title}
                    ariaLabel={`title of cost ${index + 1}`}
                    onCommit={(next) => onUpdate(item, { title: next })}
                  />
                </Td>
                <Td className="px-2 py-1.5 font-medium">
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
                  <RowControls
                    index={index}
                    count={items.length}
                    onMove={onMove}
                    onDelete={() => setConfirmDelete(item)}
                    deleteLabel="Delete additional cost"
                  />
                </Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      </CardContent>

      <AdditionalCostDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        caseId={caseId}
        currency={currency}
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

/** Focused add dialog; same two-button pattern as the quote-item dialog. */
function AdditionalCostDialog({
  open,
  onClose,
  caseId,
  currency,
  onAdd,
}: {
  open: boolean;
  onClose: () => void;
  caseId: string;
  currency: string;
  onAdd: (values: AdditionalCostValues) => void;
}) {
  return (
    <Dialog open={open} onClose={onClose} title="Add additional cost">
      {/* Dialog unmounts its children when closed, so the form — and its
          draft state — mounts fresh on every open. */}
      <AdditionalCostForm caseId={caseId} currency={currency} onAdd={onAdd} onClose={onClose} />
    </Dialog>
  );
}

function AdditionalCostForm({
  caseId,
  currency,
  onAdd,
  onClose,
}: {
  caseId: string;
  currency: string;
  onAdd: (values: AdditionalCostValues) => void;
  onClose: () => void;
}) {
  const formRef = React.useRef<HTMLFormElement>(null);
  const [formKey, setFormKey] = React.useState(0);
  const draft = useFormDraft(`extra:${caseId}:new`);
  const setFormRef = React.useCallback(
    (el: HTMLFormElement | null) => {
      formRef.current = el;
      draft.formRef(el);
    },
    [draft.formRef]
  );

  function submit(addAnother: boolean) {
    const form = formRef.current;
    if (!form || !form.reportValidity()) return;
    const fd = new FormData(form);
    onAdd({
      title: String(fd.get("title") ?? "").trim(),
      amount: Number(fd.get("amount") || 0),
    });
    draft.clear(); // never restore a row that was just added
    if (addAnother) setFormKey((k) => k + 1);
    else onClose();
  }

  return (
    <form
      key={`${formKey}:${draft.formKey}`}
      ref={setFormRef}
      onSubmit={(e) => {
        e.preventDefault();
        submit(false);
      }}
      className="space-y-4"
    >
      <DraftBanner draft={draft} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Title">
          <Input name="title" placeholder="e.g. Revision surgery" defaultValue={draft.value("title") ?? ""} />
        </Field>
        <Field label={`Amount (${currency})`}>
          <Input
            name="amount"
            type="number"
            step="0.01"
            min="0"
            required
            placeholder="0.00"
            defaultValue={draft.value("amount") ?? ""}
          />
        </Field>
      </div>
      <p className="text-xs text-muted-light">
        Prints on the PDF under Payment Information; never added to the package total.
      </p>
      <div className="flex items-center justify-end gap-2">
        {/* Cancel is an explicit discard — Esc/backdrop keep the draft. */}
        <Button
          type="button"
          variant="secondary"
          onClick={() => {
            draft.clear();
            onClose();
          }}
        >
          Cancel
        </Button>
        <Button type="button" variant="soft" onClick={() => submit(true)}>
          Add &amp; another
        </Button>
        <Button type="submit">
          <Plus /> Add cost
        </Button>
      </div>
    </form>
  );
}
