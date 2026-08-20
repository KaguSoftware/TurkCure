"use client";

import * as React from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Select, Field, Textarea, ComboBox } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useRouter } from "next/navigation";
import { DatePicker } from "@/components/ui/date-picker";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DraftBanner } from "@/components/ui/draft-banner";
import { toast } from "@/components/ui/toast";
import { useFormDraft } from "@/lib/use-form-draft";
import { upsertDirectoryRow, type DirectoryTable } from "@/lib/actions/directory";
import { upsertCase, deleteCase } from "@/lib/actions/cases";
import { CURRENCIES, formatDate } from "@/lib/utils";
import type { Case, Patient } from "@/lib/types";
import type { Directories } from "./patient-detail";

// Common arrival/departure airports for Turkey medical-tourism trips. The
// airport fields are free-text (not directory-backed), so these are just
// suggestions — any code can still be typed and committed.
const AIRPORT_SUGGESTIONS = [
  { id: "IST", name: "IST — İstanbul Airport" },
  { id: "SAW", name: "SAW — İstanbul Sabiha Gökçen" },
  { id: "ESB", name: "ESB — Ankara Esenboğa" },
  { id: "ADB", name: "ADB — İzmir Adnan Menderes" },
  { id: "AYT", name: "AYT — Antalya" },
  { id: "DLM", name: "DLM — Dalaman" },
  { id: "BJV", name: "BJV — Bodrum Milas" },
  { id: "ADA", name: "ADA — Adana Şakirpaşa" },
  { id: "TZX", name: "TZX — Trabzon" },
  { id: "GZT", name: "GZT — Gaziantep" },
];

/**
 * The case form alone — the quote, extras and payments all live in the Money
 * tab since the 2026-08 money rebuild, so this tab gets the full width.
 */
export function CaseTab({
  patient,
  activeCase,
  isAdmin,
  directories,
  onCaseCreated,
  onCaseDeleted,
}: {
  patient: Patient;
  activeCase: Case | null;
  isAdmin: boolean;
  directories: Directories;
  onCaseCreated?: (id: string) => void;
  onCaseDeleted?: () => void;
}) {
  const router = useRouter();
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [confirmDeleteCase, setConfirmDeleteCase] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);
  // Unsaved input survives tab switches / navigation for 30 minutes. The
  // new-case key carries the patient id so drafts can't leak across patients.
  const draft = useFormDraft(activeCase ? `case:${activeCase.id}` : `case:new:${patient.id}`);

  async function onDeleteCase() {
    if (!activeCase) return;
    setDeleting(true);
    const result = await deleteCase(patient.id, activeCase.id);
    setDeleting(false);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    draft.clear();
    setConfirmDeleteCase(false);
    toast.success("Case deleted.");
    // Clear ?case= so the page doesn't try to select the case we just removed.
    onCaseDeleted?.();
    React.startTransition(() => router.refresh());
  }

  async function onSaveCase(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    const values = {
      protocol_number: fd.get("protocol_number") ?? "",
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
      // Clear before onCaseCreated switches the draft key to the new case id.
      draft.clear();
      toast.success(activeCase ? "Case saved. Reminders regenerated." : "Case created.");
      if (!activeCase && result.id) onCaseCreated?.(result.id);
      React.startTransition(() => router.refresh());
    }
  }

  // Each case dropdown is a search-or-create combobox backed by a directory
  // table. We hold the option lists in local state (seeded from the server
  // props) so a row created inline appears immediately, before the next refresh.
  const [comboOptions, setComboOptions] = React.useState({
    operation_type_id: directories.operationTypes,
    doctor_id: directories.doctors,
    hospital_id: directories.hospitals,
    hotel_id: directories.hotels,
    driver_id: directories.drivers,
  });

  // Re-seed from the server whenever the props change (e.g. after a refresh),
  // adjusting during render rather than in an effect to avoid a stale frame.
  const [seenDirectories, setSeenDirectories] = React.useState(directories);
  if (seenDirectories !== directories) {
    setSeenDirectories(directories);
    setComboOptions({
      operation_type_id: directories.operationTypes,
      doctor_id: directories.doctors,
      hospital_id: directories.hospitals,
      hotel_id: directories.hotels,
      driver_id: directories.drivers,
    });
  }

  const selectFields: {
    key: keyof typeof comboOptions;
    label: string;
    table: DirectoryTable;
    value: string | null;
  }[] = [
    { key: "operation_type_id", label: "Operation", table: "operation_types", value: activeCase?.operation_type_id ?? null },
    { key: "doctor_id", label: "Doctor", table: "doctors", value: activeCase?.doctor_id ?? null },
    { key: "hospital_id", label: "Hospital", table: "hospitals", value: activeCase?.hospital_id ?? null },
    { key: "hotel_id", label: "Hotel", table: "hotels", value: activeCase?.hotel_id ?? null },
    { key: "driver_id", label: "Driver", table: "drivers", value: activeCase?.driver_id ?? null },
  ];

  async function createDirectoryRow(
    key: keyof typeof comboOptions,
    table: DirectoryTable,
    name: string
  ): Promise<string | null> {
    const r = await upsertDirectoryRow(table, { name });
    if (r.error || !r.row) {
      toast.error(r.error ?? "Could not create.");
      return null;
    }
    const row = r.row as { id: string; name: string };
    setComboOptions((prev) => ({
      ...prev,
      [key]: [...prev[key], { id: row.id, name: row.name }].sort((a, b) =>
        a.name.localeCompare(b.name)
      ),
    }));
    toast.success(`${row.name} added.`);
    React.startTransition(() => router.refresh());
    return row.id;
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>{activeCase ? "Case details" : "Create case"}</CardTitle>
        </CardHeader>
        <CardContent>
          {/* key resets all defaultValue fields when switching between cases;
              the draft key remounts them again when a draft restores/discards */}
          <form
            key={`${activeCase?.id ?? "new"}:${draft.formKey}`}
            ref={draft.formRef}
            onSubmit={onSaveCase}
            className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
          >
            <DraftBanner draft={draft} className="sm:col-span-2 lg:col-span-3" />
            {/* The case's own identifier, so it heads the form. */}
            <Field label="Protocol number" className="sm:col-span-2 lg:col-span-3">
              <Input
                name="protocol_number"
                defaultValue={draft.value("protocol_number") ?? activeCase?.protocol_number ?? ""}
                placeholder="Hospital protocol / file number"
              />
            </Field>
            {selectFields.map((f) => (
              <Field key={f.key} label={f.label}>
                <ComboBox
                  name={f.key}
                  options={comboOptions[f.key]}
                  defaultValue={draft.value(f.key) ?? f.value ?? ""}
                  onCreate={(name) => createDirectoryRow(f.key, f.table, name)}
                  placeholder={`Search or add ${f.label.toLowerCase()}…`}
                />
              </Field>
            ))}
            <Field label="Status">
              <Select name="status" defaultValue={draft.value("status") ?? activeCase?.status ?? "planning"}>
                <option value="planning">Planning</option>
                <option value="confirmed">Confirmed</option>
                <option value="in_progress">In progress</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </Select>
            </Field>
            <Field label="Arrival date">
              <DatePicker name="arrival_date" defaultValue={draft.value("arrival_date") ?? activeCase?.arrival_date ?? ""} />
            </Field>
            <Field label="Surgery date">
              <DatePicker name="surgery_date" defaultValue={draft.value("surgery_date") ?? activeCase?.surgery_date ?? ""} />
            </Field>
            <Field label="Departure date">
              <DatePicker name="departure_date" defaultValue={draft.value("departure_date") ?? activeCase?.departure_date ?? ""} />
            </Field>
            <Field label="Hospital check-in">
              <DatePicker name="hospital_checkin" defaultValue={draft.value("hospital_checkin") ?? activeCase?.hospital_checkin ?? ""} />
            </Field>
            <Field label="Hospital check-out">
              <DatePicker name="hospital_checkout" defaultValue={draft.value("hospital_checkout") ?? activeCase?.hospital_checkout ?? ""} />
            </Field>
            <Field label="Departure airport">
              <ComboBox
                name="airport"
                freeText
                options={AIRPORT_SUGGESTIONS}
                defaultValue={draft.value("airport") ?? activeCase?.airport ?? ""}
                placeholder="Search or type a code…"
                createLabel="Use"
              />
            </Field>
            <Field label="Airport pickup">
              <ComboBox
                name="airport_pickup"
                freeText
                options={AIRPORT_SUGGESTIONS}
                defaultValue={draft.value("airport_pickup") ?? activeCase?.airport_pickup ?? ""}
                placeholder="Search or type a code…"
                createLabel="Use"
              />
            </Field>
            <Field label="Currency">
              <Select name="currency" defaultValue={draft.value("currency") ?? activeCase?.currency ?? "EUR"}>
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Notes" className="sm:col-span-2 lg:col-span-3">
              <Textarea name="notes" rows={2} defaultValue={draft.value("notes") ?? activeCase?.notes ?? ""} />
            </Field>
            {error && (
              <p className="sm:col-span-2 lg:col-span-3 rounded-lg bg-danger-soft px-3 py-2 text-xs text-danger">
                {error}
              </p>
            )}
            <div className="sm:col-span-2 lg:col-span-3">
              <div className="flex flex-wrap items-center gap-2">
                <Button type="submit" pending={saving}>
                  {activeCase ? "Save case" : "Create case"}
                </Button>
                {/* Admin-only, matching every other delete in the app. Sits apart
                    from Save so it can't be hit by muscle memory. */}
                {activeCase && isAdmin && (
                  <Button
                    type="button"
                    variant="ghost"
                    className="ml-auto text-danger hover:bg-danger-soft"
                    onClick={() => setConfirmDeleteCase(true)}
                  >
                    <Trash2 /> Delete case
                  </Button>
                )}
              </div>
              <p className="mt-2 text-xs text-muted-light">
                Saves the case details above and regenerates arrival, operation and aftercare
                reminders. The quote lives in the Money tab.
              </p>
            </div>
          </form>
        </CardContent>
      </Card>

      <ConfirmDialog
        open={confirmDeleteCase}
        onClose={() => setConfirmDeleteCase(false)}
        onConfirm={onDeleteCase}
        pending={deleting}
        title="Delete case"
        confirmLabel="Delete case"
        description={
          <>
            Delete{" "}
            <strong>{activeCase?.operation_types?.name ?? "this case"}</strong>
            {activeCase?.arrival_date ? ` (${formatDate(activeCase.arrival_date)})` : ""}? Its
            quote, payments, reminders, instructions and additional costs are deleted with it.
            This cannot be undone.
          </>
        }
      />
    </>
  );
}
