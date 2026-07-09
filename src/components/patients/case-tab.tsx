"use client";

import * as React from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Select, Field, Textarea } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, THead, TBody, Tr, Th, Td, EmptyRow } from "@/components/ui/table";
import { upsertCase, upsertQuoteItem, deleteQuoteItem } from "@/lib/actions/cases";
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
  cases,
  quoteItemsByCase,
  isAdmin,
  directories,
}: {
  patient: Patient;
  cases: Case[];
  quoteItemsByCase: Record<string, QuoteItem[]>;
  isAdmin: boolean;
  directories: Directories;
}) {
  const activeCase = cases[0] ?? null;
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

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
      currency: fd.get("currency"),
      status: fd.get("status"),
      notes: fd.get("notes") ?? "",
    };
    const result = await upsertCase(patient.id, values, activeCase?.id);
    setSaving(false);
    if (result.error) setError(result.error);
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
          <form onSubmit={onSaveCase} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {selectFields.map((f) => (
              <Field key={f.key} label={f.label}>
                <Select name={f.key} defaultValue={f.value ?? ""}>
                  <option value="">—</option>
                  {f.options.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </Select>
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
              <Input name="arrival_date" type="date" defaultValue={activeCase?.arrival_date ?? ""} />
            </Field>
            <Field label="Surgery date">
              <Input name="surgery_date" type="date" defaultValue={activeCase?.surgery_date ?? ""} />
            </Field>
            <Field label="Departure date">
              <Input name="departure_date" type="date" defaultValue={activeCase?.departure_date ?? ""} />
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
              <Button type="submit" disabled={saving}>
                {saving ? "Saving…" : activeCase ? "Save case" : "Create case"}
              </Button>
              <p className="mt-2 text-xs text-muted-light">
                Saving regenerates arrival, operation and aftercare reminders from the dates above.
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
    </div>
  );
}

function QuoteEditor({
  patientId,
  caseId,
  currency,
  items,
  isAdmin,
}: {
  patientId: string;
  caseId: string;
  currency: string;
  items: QuoteItem[];
  isAdmin: boolean;
}) {
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const formRef = React.useRef<HTMLFormElement>(null);

  const totalPrice = items.reduce((s, i) => s + Number(i.price), 0);
  const totalCost = items.reduce((s, i) => s + Number(i.cost ?? 0), 0);

  async function onAdd(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    const result = await upsertQuoteItem(patientId, caseId, {
      kind: String(fd.get("kind")),
      description: String(fd.get("description")),
      price: Number(fd.get("price") || 0),
      cost: isAdmin ? Number(fd.get("cost") || 0) : undefined,
      sort_order: items.length,
    });
    setBusy(false);
    if (result.error) setError(result.error);
    else formRef.current?.reset();
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
              <EmptyRow colSpan={isAdmin ? 5 : 4} message="No quote items yet." />
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
                    onClick={async () => {
                      const r = await deleteQuoteItem(patientId, item.id);
                      if (r.error) alert(r.error);
                    }}
                  >
                    <Trash2 />
                  </Button>
                </Td>
              </Tr>
            ))}
          </TBody>
        </Table>

        <form ref={formRef} onSubmit={onAdd} className="space-y-3 px-5">
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
          {error && <p className="rounded-lg bg-danger-soft px-3 py-2 text-xs text-danger">{error}</p>}
          <Button type="submit" variant="soft" size="sm" disabled={busy}>
            <Plus /> Add item
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
