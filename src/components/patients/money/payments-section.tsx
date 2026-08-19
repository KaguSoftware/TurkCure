"use client";

import * as React from "react";
import { ArrowDownLeft, ArrowUpRight, Paperclip, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, THead, TBody, Tr, Th, Td, EmptyRow } from "@/components/ui/table";
import { Badge, PAYMENT_STATUS_TONE } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { toast } from "@/components/ui/toast";
import { createClient } from "@/lib/supabase/client";
import { tempId } from "@/lib/use-optimistic-list";
import { upsertPayment, deletePayment } from "@/lib/actions/payments";
import { formatMoney, formatDate } from "@/lib/utils";
import type { Case, CounterpartyType, Patient, Payment } from "@/lib/types";
import type { Directories } from "../patient-detail";
import { PaymentDialog, type PaymentValues } from "./payment-dialog";

/** Must match the server's rounding in upsertPayment, or the optimistic row and
 *  the saved row disagree by a cent. */
const round2 = (n: number) => Math.round(n * 100) / 100;

type Mutate = <R extends { error?: string } | void>(opts: {
  optimistic: (prev: Payment[]) => Payment[];
  action: () => Promise<R>;
  success?: string;
  reconcile?: (result: R, prev: Payment[]) => Payment[];
}) => Promise<{ ok: boolean; result?: R }>;

/**
 * The cash half of the Money tab: incoming and outgoing payments with explicit
 * edit affordances (the old table's only hint was cursor-pointer). The
 * optimistic list lives in the parent so the summary cards react to edits here.
 */
export function PaymentsSection({
  patient,
  activeCase,
  payments,
  mutate,
  pending,
  isAdmin,
  directories,
}: {
  patient: Patient;
  activeCase: Case;
  payments: Payment[];
  mutate: Mutate;
  pending: boolean;
  isAdmin: boolean;
  directories: Directories;
}) {
  const caseCurrency = activeCase.currency;
  const [open, setOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Payment | null>(null);
  // Remount the dialog per open so its field state resets without effects.
  const [dialogKey, setDialogKey] = React.useState(0);
  const [confirmDelete, setConfirmDelete] = React.useState<Payment | null>(null);

  // Doctor payouts are boss-only: agents never see them.
  const visiblePayments = isAdmin
    ? payments
    : payments.filter((p) => p.counterparty_type !== "doctor");
  const incoming = visiblePayments.filter((p) => p.direction === "in");
  const outgoing = visiblePayments.filter((p) => p.direction === "out");
  const convertedCount = incoming.filter((p) => p.currency !== caseCurrency).length;

  function providerOptions(type: CounterpartyType) {
    switch (type) {
      case "doctor":
        return directories.doctors;
      case "hospital":
        return directories.hospitals;
      case "hotel":
        return directories.hotels;
      case "driver":
        return directories.drivers;
      default:
        return [];
    }
  }

  function counterpartyName(p: Payment) {
    if (p.counterparty_type === "patient") return patient.full_name;
    const match = providerOptions(p.counterparty_type).find((o) => o.id === p.counterparty_id);
    return match?.name ?? p.counterparty_type;
  }

  function openNew() {
    setEditing(null);
    setDialogKey((k) => k + 1);
    setOpen(true);
  }

  function openEdit(p: Payment) {
    setEditing(p);
    setDialogKey((k) => k + 1);
    setOpen(true);
  }

  async function viewReceipt(path: string) {
    const supabase = createClient();
    const { data, error } = await supabase.storage.from("receipts").createSignedUrl(path, 300);
    if (error || !data) toast.error(error?.message ?? "Could not open receipt");
    else window.open(data.signedUrl, "_blank");
  }

  /** The dialog awaits this, so it can stay open on failure and show the error
   *  inline instead of toasting at a closed dialog. */
  async function onSave(values: PaymentValues, editingId: string | undefined) {
    // Mirror the server's derived fields so the optimistic row matches — without
    // amount_case the summary cards flicker wrong for one round-trip.
    const optimisticRow = {
      ...(editing ?? {}),
      ...values,
      id: editingId ?? tempId(),
      status: values.paid_at ? "paid" : "pending",
      amount_case: round2(values.amount * values.fx_rate),
    } as Payment;
    return mutate({
      optimistic: (prev) =>
        editingId
          ? prev.map((p) => (p.id === editingId ? optimisticRow : p))
          : [...prev, optimisticRow],
      action: () => upsertPayment(patient.id, values, editingId),
      success: editingId ? "Payment updated." : "Payment recorded.",
      reconcile: (r, prev) =>
        r?.payment
          ? prev.map((p) => (p.id === optimisticRow.id ? (r.payment as unknown as Payment) : p))
          : prev,
    });
  }

  async function onDelete(p: Payment) {
    // Keep the confirm dialog open with a spinner until the delete resolves.
    await mutate({
      optimistic: (prev) => prev.filter((x) => x.id !== p.id),
      action: () => deletePayment(patient.id, p.id),
      success: "Payment deleted.",
    });
    setConfirmDelete(null);
    setOpen(false); // the row the dialog was editing is gone
  }

  const section = (title: string, list: Payment[], icon: React.ReactNode) => (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {icon} {title}
        </CardTitle>
        <span className="text-xs text-muted">
          {list.length} payment{list.length === 1 ? "" : "s"}
        </span>
      </CardHeader>
      {/* Inset bordered table, matching the Quote and Additional-costs cards. */}
      <CardContent className="px-5 pb-5">
        <Table className="min-w-0 sm:min-w-[34rem]">
          <THead>
            <tr>
              {/* Method/Due drop below md — on a phone the row is about who,
                  how much, and whether it landed. */}
              <Th>Counterparty</Th>
              <Th className="text-right">Amount</Th>
              <Th className="hidden md:table-cell">Method</Th>
              <Th className="hidden md:table-cell">Due</Th>
              <Th className="hidden sm:table-cell">Paid</Th>
              <Th>Status</Th>
              <Th className="w-20" />
            </tr>
          </THead>
          <TBody>
            {list.length === 0 && <EmptyRow colSpan={7} message="No payments recorded." />}
            {list.map((p) => (
              <Tr key={p.id} className="cursor-pointer" onClick={() => openEdit(p)}>
                <Td className="font-medium">
                  {counterpartyName(p)}
                  <span className="ml-1.5 text-xs capitalize text-muted-light">
                    ({p.counterparty_type})
                  </span>
                </Td>
                <Td className="text-right font-medium">
                  {formatMoney(Number(p.amount), p.currency)}
                  {p.currency !== caseCurrency && p.amount_case != null && (
                    // Shows the converted figure that actually hits the cards above.
                    <span className="block text-xs font-normal text-muted-light">
                      ≈ {formatMoney(Number(p.amount_case), caseCurrency)}
                    </span>
                  )}
                </Td>
                <Td className="hidden text-muted md:table-cell">
                  <span className="inline-flex items-center gap-1.5">
                    {p.method || "—"}
                    {p.receipt_path && (
                      <button
                        type="button"
                        aria-label="View receipt"
                        className="text-primary hover:opacity-70 cursor-pointer"
                        onClick={(e) => {
                          e.stopPropagation();
                          viewReceipt(p.receipt_path);
                        }}
                      >
                        <Paperclip className="size-3.5" />
                      </button>
                    )}
                  </span>
                </Td>
                <Td className="hidden text-muted md:table-cell">{formatDate(p.due_date)}</Td>
                <Td className="hidden text-muted sm:table-cell">{formatDate(p.paid_at)}</Td>
                <Td>
                  <Badge tone={PAYMENT_STATUS_TONE[p.status] ?? "slate"} className="capitalize">
                    {p.status}
                  </Badge>
                </Td>
                <Td onClick={(e) => e.stopPropagation()}>
                  <span className="flex justify-end gap-0.5">
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Edit payment"
                      onClick={() => openEdit(p)}
                    >
                      <Pencil />
                    </Button>
                    {isAdmin && (
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Delete payment"
                        className="hover:text-danger"
                        onClick={() => setConfirmDelete(p)}
                      >
                        <Trash2 />
                      </Button>
                    )}
                  </span>
                </Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">Payments</h2>
        <Button onClick={openNew}>
          <Plus /> Record payment
        </Button>
      </div>
      {convertedCount > 0 && (
        // Information, not a defect: these used to be silently excluded.
        <p className="rounded-lg bg-surface-hover px-3 py-2 text-xs text-muted">
          {convertedCount} incoming payment{convertedCount === 1 ? " was" : "s were"} recorded in
          another currency and {convertedCount === 1 ? "is" : "are"} included in the totals above,
          converted to {caseCurrency} at the rate stored on each payment.
        </p>
      )}
      {section(
        "Incoming — patient pays TurkCure",
        incoming,
        <ArrowDownLeft className="size-4 text-success" />
      )}
      {section(
        "Outgoing — payouts to providers",
        outgoing,
        <ArrowUpRight className="size-4 text-warning" />
      )}

      <PaymentDialog
        key={dialogKey}
        open={open}
        onClose={() => setOpen(false)}
        editing={editing}
        patient={patient}
        activeCase={activeCase}
        isAdmin={isAdmin}
        directories={directories}
        onSave={onSave}
        onRequestDelete={(p) => setConfirmDelete(p)}
      />
      <ConfirmDialog
        open={confirmDelete !== null}
        onClose={() => setConfirmDelete(null)}
        onConfirm={() => confirmDelete && onDelete(confirmDelete)}
        pending={pending}
        title="Delete payment"
        description={
          <>
            Permanently delete this{" "}
            {confirmDelete ? formatMoney(Number(confirmDelete.amount), confirmDelete.currency) : ""}{" "}
            payment? This cannot be undone.
          </>
        }
      />
    </div>
  );
}
