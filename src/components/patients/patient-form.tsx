"use client";

import * as React from "react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Textarea, Select, Field } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { toast } from "@/components/ui/toast";
import { useAction } from "@/lib/use-action";
import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { upsertPatient, deletePatient } from "@/lib/actions/patients";
import { upsertCase } from "@/lib/actions/cases";
import { tempId } from "@/lib/use-optimistic-list";
import { PATIENT_STATUSES, type Patient } from "@/lib/types";
import { PATIENT_STATUS_LABEL } from "@/components/ui/badge";
import { CURRENCIES } from "@/lib/utils";

export interface CaseDirectories {
  doctors: { id: string; name: string }[];
  hospitals: { id: string; name: string }[];
  hotels: { id: string; name: string }[];
  drivers: { id: string; name: string }[];
  operationTypes: { id: string; name: string }[];
}

const DIAL_CODES = [
  { code: "+44", label: "UK +44" },
  { code: "+49", label: "DE +49" },
  { code: "+31", label: "NL +31" },
  { code: "+33", label: "FR +33" },
  { code: "+1", label: "US/CA +1" },
  { code: "+90", label: "TR +90" },
  { code: "+43", label: "AT +43" },
  { code: "+41", label: "CH +41" },
  { code: "+32", label: "BE +32" },
  { code: "+46", label: "SE +46" },
  { code: "+47", label: "NO +47" },
  { code: "+45", label: "DK +45" },
  { code: "+39", label: "IT +39" },
  { code: "+34", label: "ES +34" },
  { code: "+353", label: "IE +353" },
  { code: "+971", label: "AE +971" },
  { code: "+966", label: "SA +966" },
  { code: "+974", label: "QA +974" },
  { code: "+965", label: "KW +965" },
  { code: "+61", label: "AU +61" },
];

function splitPhone(phone: string): { code: string; rest: string } {
  const match = DIAL_CODES.map((d) => d.code)
    .sort((a, b) => b.length - a.length)
    .find((c) => phone.startsWith(c));
  return match ? { code: match, rest: phone.slice(match.length).trim() } : { code: "+44", rest: phone };
}

export function PatientFormDialog({
  open,
  onClose,
  patient,
  countries,
  agents,
  currentUserId,
  caseDirectories,
  isAdmin = false,
  optimistic,
}: {
  open: boolean;
  onClose: () => void;
  patient: Patient | null;
  countries: { id: string; name: string }[];
  agents: { id: string; name: string }[];
  currentUserId: string;
  /** When present (and creating a new patient), shows the full treatment & travel section. */
  caseDirectories?: CaseDirectories;
  isAdmin?: boolean;
  /** Optimistic list handlers: create appears instantly in the caller's list. */
  optimistic?: {
    insert: (row: Patient) => void;
    replace: (tempId: string, row: Patient) => void;
    remove: (id: string) => void;
  };
}) {
  const router = useRouter();
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const del = useAction();
  const initialPhone = splitPhone(patient?.phone ?? "");
  const [dob, setDob] = React.useState(patient?.date_of_birth ?? "");
  // Reset the DOB field when a different patient is loaded (adjust-state-during-render pattern)
  const [prevPatient, setPrevPatient] = React.useState(patient);
  if (patient !== prevPatient) {
    setPrevPatient(patient);
    setDob(patient?.date_of_birth ?? "");
  }

  function onAgeChange(e: React.ChangeEvent<HTMLInputElement>) {
    const age = Number(e.target.value);
    if (!age || age < 1 || age > 120) return;
    const year = new Date().getFullYear() - age;
    setDob(`${year}-01-01`);
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    const rawPhone = String(fd.get("phone") ?? "").trim();
    const values = {
      full_name: fd.get("full_name"),
      email: fd.get("email") ?? "",
      phone: rawPhone ? `${fd.get("dial_code")} ${rawPhone}` : "",
      date_of_birth: fd.get("date_of_birth") || null,
      gender: fd.get("gender") ?? "",
      passport_number: fd.get("passport_number") ?? "",
      country_id: fd.get("country_id") || null,
      source: fd.get("source") ?? "",
      status: fd.get("status"),
      assigned_agent_id: fd.get("assigned_agent_id") || null,
      notes: fd.get("notes") ?? "",
    };
    // Optimistic create: show the patient in the list immediately, save behind it.
    const optimisticRow: Patient | null =
      !patient && optimistic
        ? ({
            id: tempId(),
            full_name: String(values.full_name ?? ""),
            email: String(values.email ?? ""),
            phone: String(values.phone ?? ""),
            date_of_birth: (values.date_of_birth as string | null) ?? null,
            gender: String(values.gender ?? ""),
            passport_number: String(values.passport_number ?? ""),
            country_id: (values.country_id as string | null) ?? null,
            source: String(values.source ?? ""),
            status: String(values.status ?? "lead"),
            assigned_agent_id: (values.assigned_agent_id as string | null) ?? null,
            notes: String(values.notes ?? ""),
            created_at: new Date().toISOString(),
            countries: countries.find((c) => c.id === values.country_id) ?? null,
            profiles: agents.find((a) => a.id === values.assigned_agent_id) ?? null,
          } as unknown as Patient)
        : null;
    if (optimisticRow) {
      optimistic!.insert(optimisticRow);
      setSaving(false);
      onClose();
    }

    const result = await upsertPatient(values, patient?.id);
    if (result.error) {
      if (optimisticRow) {
        optimistic!.remove(optimisticRow.id);
        toast.error(result.error);
        return;
      }
      setError(result.error);
      setSaving(false);
      return;
    }
    if (optimisticRow && result.id) {
      optimistic!.replace(optimisticRow.id, { ...optimisticRow, id: result.id });
    }

    // New patient with any treatment/travel details filled → create the case too
    if (!patient && caseDirectories && result.id) {
      const caseKeys = [
        "operation_type_id",
        "doctor_id",
        "hospital_id",
        "hotel_id",
        "driver_id",
        "arrival_date",
        "surgery_date",
        "departure_date",
        "hospital_checkin",
        "hospital_checkout",
        "airport",
        "airport_pickup",
      ];
      const caseValues: Record<string, unknown> = {};
      let hasCase = false;
      for (const k of caseKeys) {
        const v = fd.get(k);
        caseValues[k] = v || null;
        if (v) hasCase = true;
      }
      if (hasCase) {
        caseValues.currency = fd.get("currency") ?? "EUR";
        const caseResult = await upsertCase(result.id, caseValues);
        if (caseResult.error) {
          if (optimisticRow) {
            toast.error(`Patient saved, but case failed: ${caseResult.error}`);
            React.startTransition(() => router.refresh());
            return;
          }
          setError(`Patient saved, but case failed: ${caseResult.error}`);
          setSaving(false);
          return;
        }
      }
    }

    toast.success(patient ? "Patient updated." : "Patient created.");
    if (optimisticRow) {
      React.startTransition(() => router.refresh());
    } else {
      setSaving(false);
      onClose();
      React.startTransition(() => router.refresh());
    }
  }

  async function onDelete() {
    if (!patient) return;
    const { ok } = await del.run(deletePatient(patient.id), {
      success: "Patient deleted.",
      refresh: false,
    });
    if (ok) {
      setConfirmDelete(false);
      onClose();
      router.push("/patients");
      React.startTransition(() => router.refresh());
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title={patient ? "Edit Patient" : "New Patient"} wide>
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Full name">
            <Input name="full_name" required autoComplete="name" defaultValue={patient?.full_name ?? ""} />
          </Field>
          <Field label="Status">
            <Select name="status" defaultValue={patient?.status ?? "lead"}>
              {PATIENT_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {PATIENT_STATUS_LABEL[s]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Email">
            <Input name="email" type="email" inputMode="email" autoComplete="email" defaultValue={patient?.email ?? ""} />
          </Field>
          <Field label="Phone">
            <div className="flex gap-1.5">
              <Select name="dial_code" defaultValue={initialPhone.code} className="w-28 shrink-0">
                {DIAL_CODES.map((d) => (
                  <option key={d.code} value={d.code}>
                    {d.label}
                  </option>
                ))}
              </Select>
              <Input
                name="phone"
                type="tel"
                inputMode="tel"
                autoComplete="tel-national"
                pattern="[0-9 ()-]*"
                title="Digits, spaces, parentheses and dashes only"
                defaultValue={initialPhone.rest}
                placeholder="7911 123456"
              />
            </div>
          </Field>
          <Field label="Date of birth (or type age)">
            <div className="flex gap-1.5">
              <DatePicker name="date_of_birth" value={dob} onChange={setDob} className="flex-1" />
              <Input
                type="number"
                min={1}
                max={120}
                placeholder="Age"
                className="w-20 shrink-0"
                onChange={onAgeChange}
              />
            </div>
          </Field>
          <Field label="Gender">
            <Select name="gender" defaultValue={patient?.gender ?? ""}>
              <option value="">—</option>
              <option value="female">Female</option>
              <option value="male">Male</option>
            </Select>
          </Field>
          <Field label="Passport number">
            <Input
              name="passport_number"
              autoComplete="off"
              autoCapitalize="characters"
              defaultValue={patient?.passport_number ?? ""}
            />
          </Field>
          <Field label="Country">
            <Select name="country_id" defaultValue={patient?.country_id ?? ""}>
              <option value="">—</option>
              {countries.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Source">
            <Input
              name="source"
              placeholder="Instagram, WhatsApp, referral…"
              defaultValue={patient?.source ?? ""}
            />
          </Field>
          <Field label="Assigned agent" className="sm:col-span-2">
            <Select
              name="assigned_agent_id"
              defaultValue={patient?.assigned_agent_id ?? currentUserId}
            >
              <option value="">Unassigned</option>
              {agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="Notes">
          <Textarea name="notes" rows={3} defaultValue={patient?.notes ?? ""} />
        </Field>

        {!patient && caseDirectories && (
          <>
            <div className="border-t border-border pt-4">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">
                Treatment & travel — all optional
              </p>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Operation">
                  <Select name="operation_type_id" defaultValue="">
                    <option value="">—</option>
                    {caseDirectories.operationTypes.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Doctor">
                  <Select name="doctor_id" defaultValue="">
                    <option value="">—</option>
                    {caseDirectories.doctors.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Hospital">
                  <Select name="hospital_id" defaultValue="">
                    <option value="">—</option>
                    {caseDirectories.hospitals.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Hotel">
                  <Select name="hotel_id" defaultValue="">
                    <option value="">—</option>
                    {caseDirectories.hotels.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Driver">
                  <Select name="driver_id" defaultValue="">
                    <option value="">—</option>
                    {caseDirectories.drivers.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Currency">
                  <Select name="currency" defaultValue="EUR">
                    {CURRENCIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Arrival date">
                  <DatePicker name="arrival_date" />
                </Field>
                <Field label="Surgery date">
                  <DatePicker name="surgery_date" />
                </Field>
                <Field label="Departure date">
                  <DatePicker name="departure_date" />
                </Field>
                <Field label="Hospital check-in">
                  <DatePicker name="hospital_checkin" />
                </Field>
                <Field label="Hospital check-out">
                  <DatePicker name="hospital_checkout" />
                </Field>
                <Field label="Airport">
                  <Input name="airport" placeholder="IST" />
                </Field>
                <Field label="Airport pickup">
                  <Input name="airport_pickup" placeholder="IST" />
                </Field>
              </div>
            </div>
          </>
        )}
        {error && <p className="rounded-lg bg-danger-soft px-3 py-2 text-xs text-danger">{error}</p>}
        <div className="flex items-center justify-between gap-2">
          <div>
            {patient && isAdmin && (
              <Button
                type="button"
                variant="ghost"
                className="text-danger hover:bg-danger-soft"
                onClick={() => setConfirmDelete(true)}
              >
                <Trash2 /> Delete patient
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" pending={saving}>
              Save
            </Button>
          </div>
        </div>
      </form>
      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={onDelete}
        pending={del.pending}
        title="Delete patient"
        confirmLabel="Delete permanently"
        description={
          <>
            This permanently deletes <strong>{patient?.full_name}</strong> and{" "}
            <strong>all</strong> of their cases, quotes, payments, reminders, instructions and
            files. This cannot be undone.
          </>
        }
      />
    </Dialog>
  );
}
