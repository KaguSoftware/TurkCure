"use client";

import * as React from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Select, Field, Textarea } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, THead, TBody, Tr, Th, Td, EmptyRow } from "@/components/ui/table";
import { useRouter } from "next/navigation";
import { DatePicker } from "@/components/ui/date-picker";
import { Dialog } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { toast } from "@/components/ui/toast";
import { upsertDirectoryRow } from "@/lib/actions/directory";
import { upsertCase, upsertQuoteItem, deleteQuoteItem } from "@/lib/actions/cases";
import { useOptimisticList, tempId } from "@/lib/use-optimistic-list";
import { CURRENCIES, formatMoney } from "@/lib/utils";
import type { Case, Patient, QuoteItem, QuoteItemKind } from "@/lib/types";
import type { Directories } from "./patient-detail";

const KINDS: { value: QuoteItemKind; label: string }[] = [
  { value: "surgery", label: "Surgery" },
  { value: "hotel", label: "Hotel" },
  { value: "transfer", label: "Transfer" },
  { value: "extra", label: "Extra" },
];

export function CaseTab({
  patient,
  activeCase,
  quoteItemsByCase,
  isAdmin,
  directories,
  onCaseCreated,
}: {
  patient: Patient;
  activeCase: Case | null;
  quoteItemsByCase: Record<string, QuoteItem[]>;
  isAdmin: boolean;
  directories: Directories;
  onCaseCreated?: (id: string) => void;
}) {
  const router = useRouter();
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [doctorOpen, setDoctorOpen] = React.useState(false);
  const [doctorSaving, setDoctorSaving] = React.useState(false);

  async function onAddDoctor(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setDoctorSaving(true);
    const fd = new FormData(e.currentTarget);
    const r = await upsertDirectoryRow("doctors", {
      name: String(fd.get("name")),
      specialty: String(fd.get("specialty") ?? ""),
    });
    setDoctorSaving(false);
    if (r.error) toast.error(r.error);
    else {
      toast.success("Doctor added.");
      setDoctorOpen(false);
      React.startTransition(() => router.refresh());
    }
  }

  async function onSaveCase(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    const values = {
      operation_type_id: fd.get("operation_type_id") || null,
      doctor_id: fd.get("doctor_id") || null,
      hospital_id: fd.get("hospital_id") || null,
      hotel_id: fd.get("hotel_id") || null,
      driver_id: fd.get("driver_id") || null,
      arrival_date: fd.get("arrival_date") || null,
      surgery_date: fd.get("surgery_date") || null,
      departure_date: fd.get("departure_date") || null,
      hospital_checkin: fd.get("hospital_checkin") || null,
      hospital_checkout: fd.get("hospital_checkout") || null,
      airport: fd.get("airport") ?? "",
      airport_pickup: fd.get("airport_pickup") ?? "",
      currency: fd.get("currency"),
      status: fd.get("status"),
      notes: fd.get("notes") ?? "",
    };
    const result = await upsertCase(patient.id, values, activeCase?.id);
    setSaving(false);
    if (result.error) {
      setError(result.error);
      toast.error(result.error);
    } else {
      toast.success(activeCase ? "Case saved. Reminders regenerated." : "Case created.");
      if (!activeCase && result.id) onCaseCreated?.(result.id);
      React.startTransition(() => router.refresh());
    }
  }

  const selectFields: {
    key: string;
    label: string;
    options: { id: string; name: string }[];
    value: string | null;
  }[] = activeCase
    ? [
        { key: "operation_type_id", label: "Operation", options: directories.operationTypes, value: activeCase.operation_type_id },
        { key: "doctor_id", label: "Doctor", options: directories.doctors, value: activeCase.doctor_id },
        { key: "hospital_id", label: "Hospital", options: directories.hospitals, value: activeCase.hospital_id },
        { key: "hotel_id", label: "Hotel", options: directories.hotels, value: activeCase.hotel_id },
        { key: "driver_id", label: "Driver", options: directories.drivers, value: activeCase.driver_id },
      ]
    : [
        { key: "operation_type_id", label: "Operation", options: directories.operationTypes, value: null },
        { key: "doctor_id", label: "Doctor", options: directories.doctors, value: null },
        { key: "hospital_id", label: "Hospital", options: directories.hospitals, value: null },
        { key: "hotel_id", label: "Hotel", options: directories.hotels, value: null },
        { key: "driver_id", label: "Driver", options: directories.drivers, value: null },
      ];

  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>{activeCase ? "Case details" : "Create case"}</CardTitle>
        </CardHeader>
        <CardContent>
          {/* key resets all defaultValue fields when switching between cases */}
          <form
            key={activeCase?.id ?? "new"}
            onSubmit={onSaveCase}
            className="grid grid-cols-1 gap-4 sm:grid-cols-2"
          >
            {selectFields.map((f) => (
              <Field key={f.key} label={f.label}>
                <div className="flex gap-1.5">
                  <Select name={f.key} defaultValue={f.value ?? ""}>
                    <option value="">—</option>
                    {f.options.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name}
                      </option>
                    ))}
                  </Select>
                  {f.key === "doctor_id" && (
                    <Button
                      type="button"
                      variant="secondary"
                      size="icon"
                      aria-label="Add doctor"
                      className="shrink-0"
                      onClick={() => setDoctorOpen(true)}
                    >
                      <Plus />
                    </Button>
                  )}
                </div>
              </Field>
            ))}
            <Field label="Status">
              <Select name="status" defaultValue={activeCase?.status ?? "planning"}>
                <option value="planning">Planning</option>
                <option value="confirmed">Confirmed</option>
                <option value="in_progress">In progress</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </Select>
            </Field>
            <Field label="Arrival date">
              <DatePicker name="arrival_date" defaultValue={activeCase?.arrival_date ?? ""} />
            </Field>
            <Field label="Surgery date">
              <DatePicker name="surgery_date" defaultValue={activeCase?.surgery_date ?? ""} />
            </Field>
            <Field label="Departure date">
              <DatePicker name="departure_date" defaultValue={activeCase?.departure_date ?? ""} />
            </Field>
            <Field label="Hospital check-in">
              <DatePicker name="hospital_checkin" defaultValue={activeCase?.hospital_checkin ?? ""} />
            </Field>
            <Field label="Hospital check-out">
              <DatePicker name="hospital_checkout" defaultValue={activeCase?.hospital_checkout ?? ""} />
            </Field>
            <Field label="Airport">
              <Input name="airport" placeholder="IST" defaultValue={activeCase?.airport ?? ""} />
            </Field>
            <Field label="Airport pickup">
              <Input name="airport_pickup" placeholder="IST" defaultValue={activeCase?.airport_pickup ?? ""} />
            </Field>
            <Field label="Currency">
              <Select name="currency" defaultValue={activeCase?.currency ?? "EUR"}>
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Notes" className="sm:col-span-2">
              <Textarea name="notes" rows={2} defaultValue={activeCase?.notes ?? ""} />
            </Field>
            {error && (
              <p className="sm:col-span-2 rounded-lg bg-danger-soft px-3 py-2 text-xs text-danger">
                {error}
              </p>
            )}
            <div className="sm:col-span-2">
              <Button type="submit" pending={saving}>
                {activeCase ? "Save case" : "Create case"}
              </Button>
              <p className="mt-2 text-xs text-muted-light">
                Saves the case details above and regenerates arrival, operation and aftercare
                reminders. The quote is saved separately, item by item.
              </p>
            </div>
          </form>
        </CardContent>
      </Card>

      {activeCase ? (
        <QuoteEditor
          patientId={patient.id}
          caseId={activeCase.id}
          currency={activeCase.currency}
          items={quoteItemsByCase[activeCase.id] ?? []}
          isAdmin={isAdmin}
        />
      ) : (
        <Card>
          <CardContent className="flex h-full items-center justify-center py-16 text-sm text-muted">
            Create the case first, then build the quote.
          </CardContent>
        </Card>
      )}

      <Dialog open={doctorOpen} onClose={() => setDoctorOpen(false)} title="Add doctor">
        <form onSubmit={onAddDoctor} className="space-y-4">
          <Field label="Name">
            <Input name="name" required autoFocus />
          </Field>
          <Field label="Specialty">
            <Input name="specialty" placeholder="e.g. Plastic surgery" />
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setDoctorOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" pending={doctorSaving}>
              Add doctor
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}

function QuoteEditor({
  patientId,
  caseId,
  currency,
  items: serverItems,
  isAdmin,
}: {
  patientId: string;
  caseId: string;
  currency: string;
  items: QuoteItem[];
  isAdmin: boolean;
}) {
  const { items, mutate, pending } = useOptimisticList<QuoteItem>(serverItems);
  const [error, setError] = React.useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = React.useState<QuoteItem | null>(null);
  const formRef = React.useRef<HTMLFormElement>(null);

  async function onDelete(item: QuoteItem) {
    setConfirmDelete(null);
    await mutate({
      optimistic: (prev) => prev.filter((i) => i.id !== item.id),
      action: () => deleteQuoteItem(patientId, item.id),
      success: "Quote item deleted.",
    });
  }

  const totalPrice = items.reduce((s, i) => s + Number(i.price), 0);
  const totalCost = items.reduce((s, i) => s + Number(i.cost ?? 0), 0);

  async function onAdd(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    const values = {
      kind: String(fd.get("kind")),
      description: String(fd.get("description")),
      price: Number(fd.get("price") || 0),
      cost: isAdmin ? Number(fd.get("cost") || 0) : undefined,
      sort_order: items.length,
    };
    const optimisticRow = {
      id: tempId(),
      case_id: caseId,
      kind: values.kind,
      description: values.description,
      price: values.price,
      cost: values.cost ?? null,
      sort_order: values.sort_order,
    } as QuoteItem;
    formRef.current?.reset();
    const { ok, result } = await mutate({
      optimistic: (prev) => [...prev, optimisticRow],
      action: () => upsertQuoteItem(patientId, caseId, values),
      success: "Quote item added.",
      reconcile: (r, prev) =>
        r?.item
          ? prev.map((i) => (i.id === optimisticRow.id ? (r.item as unknown as QuoteItem) : i))
          : prev,
    });
    if (!ok && result?.error) setError(result.error);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Quote</CardTitle>
        <div className="text-right text-sm">
          <span className="font-semibold">{formatMoney(totalPrice, currency)}</span>
          <span className="text-muted"> patient total</span>
          {isAdmin && (
            <p className="text-xs text-muted">
              Cost {formatMoney(totalCost, currency)} · Margin{" "}
              <span className={totalPrice - totalCost >= 0 ? "text-success" : "text-danger"}>
                {formatMoney(totalPrice - totalCost, currency)}
              </span>
            </p>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4 px-0 pb-5">
        <Table className="border-0 shadow-none">
          <THead>
            <tr>
              <Th>Type</Th>
              <Th>Description</Th>
              {isAdmin && <Th className="text-right">Cost</Th>}
              <Th className="text-right">Price</Th>
              <Th className="w-12" />
            </tr>
          </THead>
          <TBody>
            {items.length === 0 && (
              <EmptyRow
                colSpan={isAdmin ? 5 : 4}
                message="No quote items yet — add the first one below."
              />
            )}
            {items.map((item) => (
              <Tr key={item.id}>
                <Td className="capitalize text-muted">{item.kind}</Td>
                <Td className="font-medium">{item.description}</Td>
                {isAdmin && (
                  <Td className="text-right text-muted">
                    {formatMoney(Number(item.cost ?? 0), currency)}
                  </Td>
                )}
                <Td className="text-right font-medium">
                  {formatMoney(Number(item.price), currency)}
                </Td>
                <Td>
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
            {items.length > 0 && (
              <Tr className="bg-surface-hover/40">
                <Td className="text-xs font-semibold uppercase tracking-wider text-muted">
                  Total
                </Td>
                <Td />
                {isAdmin && (
                  <Td className="text-right font-semibold text-muted">
                    {formatMoney(totalCost, currency)}
                  </Td>
                )}
                <Td className="text-right font-bold">{formatMoney(totalPrice, currency)}</Td>
                <Td />
              </Tr>
            )}
          </TBody>
        </Table>

        <div className="mx-5 rounded-xl border border-dashed border-border-strong p-4">
          <p className="mb-3 text-sm font-semibold">Add quote item</p>
          <form ref={formRef} onSubmit={onAdd} className="space-y-3">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Field label="Type">
                <Select name="kind" defaultValue="surgery">
                  {KINDS.map((k) => (
                    <option key={k.value} value={k.value}>
                      {k.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Description" className="col-span-2 sm:col-span-1">
                <Input name="description" required placeholder="e.g. FUE 3500 grafts" />
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
            {error && (
              <p className="rounded-lg bg-danger-soft px-3 py-2 text-xs text-danger">{error}</p>
            )}
            <div className="flex items-center gap-3">
              <Button type="submit" variant="soft" size="sm" pending={pending}>
                <Plus /> Add to quote
              </Button>
              <p className="text-xs text-muted-light">
                Items are saved instantly — no need to press &ldquo;Save case&rdquo;.
              </p>
            </div>
          </form>
        </div>
      </CardContent>
      <ConfirmDialog
        open={confirmDelete !== null}
        onClose={() => setConfirmDelete(null)}
        onConfirm={() => confirmDelete && onDelete(confirmDelete)}
        pending={false}
        title="Delete quote item"
        description={
          <>
            Remove <strong>{confirmDelete?.description}</strong> from the quote? This cannot be
            undone.
          </>
        }
      />
    </Card>
  );
}
