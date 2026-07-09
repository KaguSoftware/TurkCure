"use client";

import * as React from "react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Textarea, Select, Field } from "@/components/ui/input";
import { upsertPatient } from "@/lib/actions/patients";
import { PATIENT_STATUSES, type Patient } from "@/lib/types";
import { PATIENT_STATUS_LABEL } from "@/components/ui/badge";

export function PatientFormDialog({
  open,
  onClose,
  patient,
  countries,
  agents,
  currentUserId,
}: {
  open: boolean;
  onClose: () => void;
  patient: Patient | null;
  countries: { id: string; name: string }[];
  agents: { id: string; name: string }[];
  currentUserId: string;
}) {
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    const values = {
      full_name: fd.get("full_name"),
      email: fd.get("email") ?? "",
      phone: fd.get("phone") ?? "",
      date_of_birth: fd.get("date_of_birth") || null,
      gender: fd.get("gender") ?? "",
      country_id: fd.get("country_id") || null,
      source: fd.get("source") ?? "",
      status: fd.get("status"),
      assigned_agent_id: fd.get("assigned_agent_id") || null,
      notes: fd.get("notes") ?? "",
    };
    const result = await upsertPatient(values, patient?.id);
    setSaving(false);
    if (result.error) setError(result.error);
    else onClose();
  }

  return (
    <Dialog open={open} onClose={onClose} title={patient ? "Edit Patient" : "New Patient"} wide>
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Full name">
            <Input name="full_name" required defaultValue={patient?.full_name ?? ""} />
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
            <Input name="email" type="email" defaultValue={patient?.email ?? ""} />
          </Field>
          <Field label="Phone">
            <Input name="phone" defaultValue={patient?.phone ?? ""} />
          </Field>
          <Field label="Date of birth">
            <Input name="date_of_birth" type="date" defaultValue={patient?.date_of_birth ?? ""} />
          </Field>
          <Field label="Gender">
            <Select name="gender" defaultValue={patient?.gender ?? ""}>
              <option value="">—</option>
              <option value="female">Female</option>
              <option value="male">Male</option>
            </Select>
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
        {error && <p className="rounded-lg bg-danger-soft px-3 py-2 text-xs text-danger">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
