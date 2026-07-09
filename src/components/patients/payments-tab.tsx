"use client";

import * as React from "react";
import { ArrowDownLeft, ArrowUpRight, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Select, Field } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Table, THead, TBody, Tr, Th, Td, EmptyRow } from "@/components/ui/table";
import { Badge, PAYMENT_STATUS_TONE } from "@/components/ui/badge";
import { DatePicker } from "@/components/ui/date-picker";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { toast } from "@/components/ui/toast";
import { useRouter } from "next/navigation";
import { upsertPayment, deletePayment } from "@/lib/actions/payments";
import { CURRENCIES, formatMoney, formatDate } from "@/lib/utils";
import type { Case, CounterpartyType, Patient, Payment } from "@/lib/types";
import type { Directories } from "./patient-detail";

const PROVIDER_TYPES: { value: CounterpartyType; label: string }[] = [
  { value: "hospital", label: "Hospital" },
  { value: "hotel", label: "Hotel" },
  { value: "driver", label: "Driver" },
  { value: "doctor", label: "Doctor" },
];

export function PaymentsTab({
  patient,
  cases,
  payments,
  quotedTotal,
  isAdmin,
  directories,
}: {
  patient: Patient;
  cases: Case[];
  payments: Payment[];
  /** Sum of the active case's quote item prices, in the case currency. */
  quotedTotal: number;
  isAdmin: boolean;
  directories: Directories;
}) {
  const activeCase = cases[0] ?? null;
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Payment | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  // Form state (controlled) so direction drives the counterparty fields and
  // switching provider type clears the stale provider id.
  const [direction, setDirection] = React.useState<"in" | "out">("in");
  const [providerType, setProviderType] = React.useState<CounterpartyType>("hospital");
  const [providerId, setProviderId] = React.useState<string>("");
  const [paidAt, setPaidAt] = React.useState<string>("");
  const [confirmDelete, setConfirmDelete] = React.useState<Payment | null>(null);
  const [deleting, setDeleting] = React.useState(false);

  if (!activeCase) {
    return (
      <Card>
        <CardContent className="py-16 text-center text-sm text-muted">
          Create a case first — payments are tracked per case.
        </CardContent>
      </Card>
    );
  }

  const caseCurrency = activeCase.currency;

  // Doctor payouts are boss-only: agents never see them
  const visiblePayments = isAdmin
    ? payments
    : payments.filter((p) => p.counterparty_type !== "doctor");
  const incoming = visiblePayments.filter((p) => p.direction === "in");
  const outgoing = visiblePayments.filter((p) => p.direction === "out");

  // Reconciliation is only meaningful within a single currency. Sum patient
  // payments that match the case currency; flag anything recorded in another.
  const paidInCaseCurrency = incoming
    .filter((p) => p.currency === caseCurrency && p.paid_at)
    .reduce((s, p) => s + Number(p.amount), 0);
  const outstanding = quotedTotal - paidInCaseCurrency;
  const otherCurrencyCount = incoming.filter((p) => p.currency !== caseCurrency).length;

  const providerChoices = isAdmin
    ? PROVIDER_TYPES
    : PROVIDER_TYPES.filter((c) => c.value !== "doctor");

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
    setDirection("in");
    setProviderType("hospital");
    setProviderId("");
    setPaidAt("");
    setError(null);
    setOpen(true);
  }

  function openEdit(p: Payment) {
    setEditing(p);
    setDirection(p.direction);
    setProviderType(p.counterparty_type === "patient" ? "hospital" : p.counterparty_type);
    setProviderId(p.counterparty_id ?? "");
    setPaidAt(p.paid_at ?? "");
    setError(null);
    setOpen(true);
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    const values = {
      case_id: activeCase!.id,
      direction,
      counterparty_type: direction === "in" ? "patient" : providerType,
      counterparty_id: direction === "in" ? null : providerId || null,
      amount: Number(fd.get("amount") || 0),
      currency: fd.get("currency"),
      method: fd.get("method") ?? "",
      iban: fd.get("iban") ?? "",
      due_date: fd.get("due_date") || null,
      paid_at: fd.get("paid_at") || null,
      notes: fd.get("notes") ?? "",
    };
    const result = await upsertPayment(patient.id, values, editing?.id);
    setSaving(false);
    if (result.error) {
      setError(result.error);
      toast.error(result.error);
    } else {
      toast.success(editing ? "Payment updated." : "Payment recorded.");
      setOpen(false);
      router.refresh();
    }
  }

  async function onDelete(p: Payment) {
    setDeleting(true);
    const r = await deletePayment(patient.id, p.id);
    setDeleting(false);
    if (r.error) toast.error(r.error);
    else {
      toast.success("Payment deleted.");
      setConfirmDelete(null);
      setOpen(false);
      router.refresh();
    }
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
      <CardContent className="px-0 pb-0">
        <Table className="border-0 shadow-none">
          <THead>
            <tr>
              <Th>Counterparty</Th>
              <Th className="text-right">Amount</Th>
              <Th>Method</Th>
              <Th>Due</Th>
              <Th>Paid</Th>
              <Th>Status</Th>
              <Th className="w-16" />
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
                <Td className="text-right font-medium">{formatMoney(Number(p.amount), p.currency)}</Td>
                <Td className="text-muted">{p.method || "—"}</Td>
                <Td className="text-muted">{formatDate(p.due_date)}</Td>
                <Td className="text-muted">{formatDate(p.paid_at)}</Td>
                <Td>
                  <Badge tone={PAYMENT_STATUS_TONE[p.status] ?? "slate"} className="capitalize">
                    {p.status}
                  </Badge>
                </Td>
                <Td onClick={(e) => e.stopPropagation()}>
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
      {/* Reconciliation: quoted vs collected vs outstanding, case currency only */}
      <Card>
        <CardContent className="grid grid-cols-1 gap-4 pt-5 sm:grid-cols-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted">Quoted total</p>
            <p className="mt-1 text-2xl font-bold tabular-nums">
              {formatMoney(quotedTotal, caseCurrency)}
            </p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted">Paid by patient</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-success">
              {formatMoney(paidInCaseCurrency, caseCurrency)}
            </p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted">Outstanding</p>
            <p
              className={
                "mt-1 text-2xl font-bold tabular-nums " +
                (outstanding <= 0 ? "text-success" : "text-warning")
              }
            >
              {formatMoney(Math.max(outstanding, 0), caseCurrency)}
            </p>
            {outstanding < 0 && (
              <p className="mt-0.5 text-xs text-success">
                Overpaid by {formatMoney(-outstanding, caseCurrency)}
              </p>
            )}
          </div>
          {otherCurrencyCount > 0 && (
            <p className="sm:col-span-3 rounded-lg bg-warning-soft px-3 py-2 text-xs text-warning">
              {otherCurrencyCount} incoming payment{otherCurrencyCount === 1 ? " is" : "s are"} in a
              currency other than the case currency ({caseCurrency}) and {otherCurrencyCount === 1 ? "is" : "are"} not
              included in the paid/outstanding figures above.
            </p>
          )}
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={openNew}>
          <Plus /> Record payment
        </Button>
      </div>
      {section("Incoming — patient pays TurkCure", incoming, <ArrowDownLeft className="size-4 text-success" />)}
      {section("Outgoing — payouts to providers", outgoing, <ArrowUpRight className="size-4 text-warning" />)}

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? "Edit payment" : "Record payment"}
        wide
      >
        <form onSubmit={onSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Direction">
            <Select
              name="direction"
              value={direction}
              onChange={(e) => setDirection(e.target.value as "in" | "out")}
            >
              <option value="in">Incoming — patient pays TurkCure</option>
              <option value="out">Outgoing — TurkCure pays a provider</option>
            </Select>
          </Field>
          {direction === "in" ? (
            <Field label="From">
              <Input value={patient.full_name} disabled readOnly />
            </Field>
          ) : (
            <>
              <Field label="Provider type">
                <Select
                  value={providerType}
                  onChange={(e) => {
                    setProviderType(e.target.value as CounterpartyType);
                    setProviderId(""); // clear stale id from the previous type's directory
                  }}
                >
                  {providerChoices.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Provider" className="sm:col-span-2">
                <Select value={providerId} onChange={(e) => setProviderId(e.target.value)}>
                  <option value="">— select —</option>
                  {providerOptions(providerType).map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </Select>
              </Field>
            </>
          )}
          <Field label="Amount">
            <Input
              name="amount"
              type="number"
              step="0.01"
              min="0.01"
              required
              defaultValue={editing?.amount ?? ""}
            />
          </Field>
          <Field label="Currency">
            <Select name="currency" defaultValue={editing?.currency ?? caseCurrency}>
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Method">
            <Input name="method" placeholder="Bank transfer, cash, card…" defaultValue={editing?.method ?? ""} />
          </Field>
          <Field label="IBAN">
            <Input
              name="iban"
              autoComplete="off"
              autoCapitalize="characters"
              pattern="[A-Za-z]{2}[0-9A-Za-z ]*"
              title="IBAN, e.g. TR12 0006 4000 0011 2345 6789 01"
              placeholder="TR12 0006 4000 0011 2345 6789 01"
              defaultValue={editing?.iban ?? ""}
            />
          </Field>
          <Field label="Due date">
            <DatePicker name="due_date" defaultValue={editing?.due_date ?? ""} />
          </Field>
          <Field label="Paid date — leave empty until paid">
            <div className="flex items-center gap-2">
              <DatePicker name="paid_at" value={paidAt} onChange={setPaidAt} className="flex-1" />
              {!paidAt && (
                <Button
                  type="button"
                  variant="soft"
                  size="sm"
                  onClick={() => setPaidAt(new Date().toISOString().slice(0, 10))}
                >
                  Mark paid today
                </Button>
              )}
            </div>
          </Field>
          <div className="sm:col-span-2 -mt-1 text-xs text-muted-light">
            Status is set automatically: <span className="font-medium text-success">Paid</span> once a
            paid date is set, otherwise <span className="font-medium text-warning">Pending</span>.
          </div>
          <Field label="Notes" className="sm:col-span-2">
            <Input name="notes" defaultValue={editing?.notes ?? ""} />
          </Field>
          {error && (
            <p className="sm:col-span-2 rounded-lg bg-danger-soft px-3 py-2 text-xs text-danger">{error}</p>
          )}
          <div className="flex items-center justify-between gap-2 sm:col-span-2">
            <div>
              {editing && isAdmin && (
                <Button
                  type="button"
                  variant="ghost"
                  className="text-danger hover:bg-danger-soft"
                  onClick={() => setConfirmDelete(editing)}
                >
                  <Trash2 /> Delete
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" pending={saving}>
                Save
              </Button>
            </div>
          </div>
        </form>
      </Dialog>
      <ConfirmDialog
        open={confirmDelete !== null}
        onClose={() => setConfirmDelete(null)}
        onConfirm={() => confirmDelete && onDelete(confirmDelete)}
        pending={deleting}
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
