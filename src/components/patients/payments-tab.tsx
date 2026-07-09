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

const COUNTERPARTIES: { value: CounterpartyType; label: string }[] = [
  { value: "patient", label: "Patient" },
  { value: "doctor", label: "Doctor" },
  { value: "hospital", label: "Hospital" },
  { value: "hotel", label: "Hotel" },
  { value: "driver", label: "Driver" },
];

export function PaymentsTab({
  patient,
  cases,
  payments,
  isAdmin,
  directories,
}: {
  patient: Patient;
  cases: Case[];
  payments: Payment[];
  isAdmin: boolean;
  directories: Directories;
}) {
  const activeCase = cases[0] ?? null;
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Payment | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [counterparty, setCounterparty] = React.useState<CounterpartyType>("patient");
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

  // Doctor payouts are boss-only: agents never see them
  const visiblePayments = isAdmin
    ? payments
    : payments.filter((p) => p.counterparty_type !== "doctor");
  const incoming = visiblePayments.filter((p) => p.direction === "in");
  const outgoing = visiblePayments.filter((p) => p.direction === "out");
  const counterpartyChoices = isAdmin
    ? COUNTERPARTIES
    : COUNTERPARTIES.filter((c) => c.value !== "doctor");

  function counterpartyOptions(type: CounterpartyType) {
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
    const match = counterpartyOptions(p.counterparty_type).find((o) => o.id === p.counterparty_id);
    return match?.name ?? p.counterparty_type;
  }

  function openNew() {
    setEditing(null);
    setCounterparty("patient");
    setError(null);
    setOpen(true);
  }

  function openEdit(p: Payment) {
    setEditing(p);
    setCounterparty(p.counterparty_type);
    setError(null);
    setOpen(true);
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    const direction = String(fd.get("direction"));
    const values = {
      case_id: activeCase!.id,
      direction,
      counterparty_type: fd.get("counterparty_type"),
      counterparty_id: fd.get("counterparty_id") || null,
      amount: Number(fd.get("amount") || 0),
      currency: fd.get("currency"),
      method: fd.get("method") ?? "",
      iban: fd.get("iban") ?? "",
      due_date: fd.get("due_date") || null,
      paid_at: fd.get("paid_at") || null,
      status: fd.get("status"),
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
      <div className="flex justify-end">
        <Button onClick={openNew}>
          <Plus /> Record payment
        </Button>
      </div>
      {section("Incoming — patient pays TurkCure", incoming, <ArrowDownLeft className="size-4 text-success" />)}
      {section("Outgoing — payouts to providers", outgoing, <ArrowUpRight className="size-4 text-warning" />)}

      <Dialog open={open} onClose={() => setOpen(false)} title={editing ? "Edit payment" : "Record payment"} wide>
        <form onSubmit={onSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Direction">
            <Select name="direction" defaultValue={editing?.direction ?? "in"}>
              <option value="in">Incoming (patient → TurkCure)</option>
              <option value="out">Outgoing (TurkCure → provider)</option>
            </Select>
          </Field>
          <Field label="Counterparty type">
            <Select
              name="counterparty_type"
              value={counterparty}
              onChange={(e) => setCounterparty(e.target.value as CounterpartyType)}
            >
              {counterpartyChoices.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </Select>
          </Field>
          {counterparty !== "patient" && (
            <Field label="Counterparty">
              <Select name="counterparty_id" defaultValue={editing?.counterparty_id ?? ""}>
                <option value="">—</option>
                {counterpartyOptions(counterparty).map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          <Field label="Amount">
            <Input name="amount" type="number" step="0.01" min="0" required defaultValue={editing?.amount ?? ""} />
          </Field>
          <Field label="Currency">
            <Select name="currency" defaultValue={editing?.currency ?? activeCase.currency}>
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
          <Field label="Paid date">
            <DatePicker name="paid_at" defaultValue={editing?.paid_at ?? ""} />
          </Field>
          <Field label="Status">
            <Select name="status" defaultValue={editing?.status ?? "pending"}>
              <option value="pending">Pending</option>
              <option value="partial">Partial</option>
              <option value="paid">Paid</option>
            </Select>
          </Field>
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
