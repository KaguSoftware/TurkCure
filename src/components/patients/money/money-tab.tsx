"use client";

import * as React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { useOptimisticList, tempId } from "@/lib/use-optimistic-list";
import {
  upsertQuoteItem,
  deleteQuoteItem,
  reorderQuoteItems,
  upsertAdditionalCost,
  deleteAdditionalCost,
  reorderAdditionalCosts,
} from "@/lib/actions/cases";
import type { Case, CaseAdditionalCost, Patient, Payment, QuoteItem } from "@/lib/types";
import type { Directories } from "../patient-detail";
import { MoneySummary } from "./money-summary";
import { QuoteTable, type QuoteItemValues } from "./quote-table";
import { AdditionalCostsTable, type AdditionalCostValues } from "./additional-costs-table";
import { PaymentsSection } from "./payments-section";

/**
 * Everything money for one case: the quote, the extras, the payments and the
 * summary that ties them together. All three optimistic lists live here so an
 * in-flight edit anywhere is reflected in the summary immediately.
 */
export function MoneyTab({
  patient,
  activeCase,
  quoteItems: serverQuoteItems,
  additionalCosts: serverAdditionalCosts,
  payments: serverPayments,
  isAdmin,
  directories,
}: {
  patient: Patient;
  activeCase: Case | null;
  quoteItems: QuoteItem[];
  additionalCosts: CaseAdditionalCost[];
  payments: Payment[];
  isAdmin: boolean;
  directories: Directories;
}) {
  const quote = useOptimisticList<QuoteItem>(serverQuoteItems);
  const extras = useOptimisticList<CaseAdditionalCost>(serverAdditionalCosts);
  const paymentsList = useOptimisticList<Payment>(serverPayments);

  // Inline cells make rapid sequential commits likely, and the optimistic
  // hook's snapshot rollback assumes mutations don't overlap — serialize them.
  const queue = React.useRef<Promise<unknown>>(Promise.resolve());
  const serialize = React.useCallback(<T,>(fn: () => Promise<T>): Promise<T> => {
    const next = queue.current.then(fn, fn);
    queue.current = next.then(
      () => undefined,
      () => undefined
    );
    return next;
  }, []);

  const patientId = patient.id;
  const caseId = activeCase?.id ?? "";

  if (!activeCase) {
    return (
      <Card>
        <CardContent className="py-16 text-center text-sm text-muted">
          Create the case first — the quote and payments are tracked per case.
        </CardContent>
      </Card>
    );
  }

  const currency = activeCase.currency;

  // ----- quote items -------------------------------------------------------

  function quoteValues(item: QuoteItem, patch: Partial<QuoteItemValues>): QuoteItemValues & {
    sort_order: number;
  } {
    // upsertQuoteItem always writes the whole row, so merge the patch over the
    // current values. `cost` stays undefined for agents (server discards it
    // anyway) and undefined when unset, which leaves the column untouched.
    return {
      kind: patch.kind ?? item.kind ?? "",
      description: patch.description ?? item.description ?? "",
      price: patch.price ?? Number(item.price),
      cost: isAdmin ? (patch.cost ?? (item.cost != null ? Number(item.cost) : undefined)) : undefined,
      sort_order: item.sort_order,
    };
  }

  function onQuoteUpdate(item: QuoteItem, patch: Partial<QuoteItemValues>) {
    const values = quoteValues(item, patch);
    serialize(() =>
      quote.mutate({
        optimistic: (prev) => prev.map((i) => (i.id === item.id ? { ...i, ...values } : i)),
        action: () => upsertQuoteItem(patientId, caseId, values, item.id),
        reconcile: (r, prev) =>
          r?.item ? prev.map((i) => (i.id === item.id ? (r.item as unknown as QuoteItem) : i)) : prev,
      })
    );
  }

  function onQuoteAdd(values: QuoteItemValues) {
    const withOrder = { ...values, sort_order: quote.items.length };
    const optimisticRow = {
      id: tempId(),
      case_id: caseId,
      kind: values.kind,
      description: values.description,
      price: values.price,
      cost: values.cost ?? null,
      sort_order: withOrder.sort_order,
    } as QuoteItem;
    serialize(() =>
      quote.mutate({
        optimistic: (prev) => [...prev, optimisticRow],
        action: () => upsertQuoteItem(patientId, caseId, withOrder),
        success: "Quote item added.",
        reconcile: (r, prev) =>
          r?.item
            ? prev.map((i) => (i.id === optimisticRow.id ? (r.item as unknown as QuoteItem) : i))
            : prev,
      })
    );
  }

  function onQuoteDelete(item: QuoteItem) {
    serialize(() =>
      quote.mutate({
        optimistic: (prev) => prev.filter((i) => i.id !== item.id),
        action: () => deleteQuoteItem(patientId, item.id),
        success: "Quote item deleted.",
      })
    );
  }

  function onQuoteMove(index: number, delta: -1 | 1) {
    const next = [...quote.items];
    const [row] = next.splice(index, 1);
    next.splice(index + delta, 0, row);
    const reordered = next.map((i, sort_order) => ({ ...i, sort_order }));
    serialize(() =>
      quote.mutate({
        optimistic: () => reordered,
        action: () => reorderQuoteItems(patientId, caseId, reordered.map((i) => i.id)),
      })
    );
  }

  // ----- additional costs --------------------------------------------------

  function onExtraUpdate(item: CaseAdditionalCost, patch: Partial<AdditionalCostValues>) {
    const values = {
      title: patch.title ?? item.title ?? "",
      amount: patch.amount ?? Number(item.amount),
      sort_order: item.sort_order,
    };
    serialize(() =>
      extras.mutate({
        optimistic: (prev) => prev.map((i) => (i.id === item.id ? { ...i, ...values } : i)),
        action: () => upsertAdditionalCost(patientId, caseId, values, item.id),
        reconcile: (r, prev) =>
          r?.item
            ? prev.map((i) => (i.id === item.id ? (r.item as unknown as CaseAdditionalCost) : i))
            : prev,
      })
    );
  }

  function onExtraAdd(values: AdditionalCostValues) {
    const withOrder = { ...values, sort_order: extras.items.length };
    const optimisticRow = {
      id: tempId(),
      case_id: caseId,
      title: values.title,
      amount: values.amount,
      sort_order: withOrder.sort_order,
    } as CaseAdditionalCost;
    serialize(() =>
      extras.mutate({
        optimistic: (prev) => [...prev, optimisticRow],
        action: () => upsertAdditionalCost(patientId, caseId, withOrder),
        success: "Additional cost added.",
        reconcile: (r, prev) =>
          r?.item
            ? prev.map((i) =>
                i.id === optimisticRow.id ? (r.item as unknown as CaseAdditionalCost) : i
              )
            : prev,
      })
    );
  }

  function onExtraDelete(item: CaseAdditionalCost) {
    serialize(() =>
      extras.mutate({
        optimistic: (prev) => prev.filter((i) => i.id !== item.id),
        action: () => deleteAdditionalCost(patientId, item.id),
        success: "Additional cost deleted.",
      })
    );
  }

  function onExtraMove(index: number, delta: -1 | 1) {
    const next = [...extras.items];
    const [row] = next.splice(index, 1);
    next.splice(index + delta, 0, row);
    const reordered = next.map((i, sort_order) => ({ ...i, sort_order }));
    serialize(() =>
      extras.mutate({
        optimistic: () => reordered,
        action: () => reorderAdditionalCosts(patientId, caseId, reordered.map((i) => i.id)),
      })
    );
  }

  return (
    <div className="space-y-5">
      <MoneySummary
        currency={currency}
        quoteItems={quote.items}
        additionalCosts={extras.items}
        payments={paymentsList.items}
        isAdmin={isAdmin}
      />
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <QuoteTable
            items={quote.items}
            currency={currency}
            isAdmin={isAdmin}
            onUpdate={onQuoteUpdate}
            onAdd={onQuoteAdd}
            onDelete={onQuoteDelete}
            onMove={onQuoteMove}
          />
        </div>
        <AdditionalCostsTable
          items={extras.items}
          currency={currency}
          onUpdate={onExtraUpdate}
          onAdd={onExtraAdd}
          onDelete={onExtraDelete}
          onMove={onExtraMove}
        />
      </div>
      <PaymentsSection
        patient={patient}
        activeCase={activeCase}
        payments={paymentsList.items}
        mutate={paymentsList.mutate}
        pending={paymentsList.pending}
        isAdmin={isAdmin}
        directories={directories}
      />
    </div>
  );
}
