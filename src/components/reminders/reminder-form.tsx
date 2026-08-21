"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input, Select, Field } from "@/components/ui/input";
import { DateTimePicker } from "@/components/ui/date-picker";
import { DraftBanner } from "@/components/ui/draft-banner";
import { useFormDraft } from "@/lib/use-form-draft";
import type { Reminder, ReminderType } from "@/lib/types";
import type { Tone } from "@/components/ui/badge";

// Also drives the type <Select> in the reminder dialog — add a type here and it
// becomes pickable by hand as well as generatable from a case. Reminders are
// dashboard-only by design (the patient-page card was reverted on feedback).
export const TYPE_META: Record<ReminderType, { label: string; tone: Tone }> = {
  follow_up: { label: "Follow-up", tone: "blue" },
  arrival: { label: "Arrival", tone: "teal" },
  hospital: { label: "Hospital", tone: "violet" },
  operation: { label: "Operation", tone: "violet" },
  departure: { label: "Departure", tone: "teal" },
  payment: { label: "Payment", tone: "amber" },
  aftercare: { label: "Aftercare", tone: "green" },
};

/** ISO UTC → local "YYYY-MM-DDTHH:mm" for the DateTimePicker. */
export function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * The reminder dialog form, as its own component so useFormDraft mounts fresh
 * per dialog open — unsaved input survives an accidental close for 30 minutes.
 * Rendered inside a <Dialog> by both the dashboard panel and the patient page.
 */
export function ReminderForm({
  editing,
  agents,
  currentUserId,
  error,
  onSubmit,
  onCancel,
}: {
  editing: Reminder | null;
  agents: { id: string; name: string }[];
  currentUserId: string;
  error: string | null;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  onCancel: () => void;
}) {
  const draft = useFormDraft(`reminder:${editing?.id ?? "new"}`);
  return (
    <form
      key={`${editing?.id ?? "new"}:${draft.formKey}`}
      ref={draft.formRef}
      onSubmit={onSubmit}
      className="space-y-4"
    >
      <DraftBanner draft={draft} />
      <Field label="Title">
        <Input
          name="title"
          required
          placeholder="Call Ahmed about quote"
          defaultValue={draft.value("title") ?? editing?.title ?? ""}
        />
      </Field>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Type">
          <Select name="type" defaultValue={draft.value("type") ?? editing?.type ?? "follow_up"}>
            {Object.entries(TYPE_META).map(([value, m]) => (
              <option key={value} value={value}>
                {m.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Assign to">
          <Select
            name="assigned_to"
            defaultValue={draft.value("assigned_to") ?? editing?.assigned_to ?? currentUserId}
          >
            {agents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      {/* Full width: the date + time pair is too cramped in a half column. */}
      <Field label="Due">
        <DateTimePicker
          name="due_at"
          defaultValue={draft.value("due_at") ?? (editing ? toLocalInput(editing.due_at) : undefined)}
        />
      </Field>
      {/* The cron's dedupe marker (`payment:<uuid>`) lives in the note column.
          Editing it would let the next sweep re-create a duplicate reminder, so
          the field is hidden for marker rows and the value rides along intact. */}
      {editing?.type === "payment" && /^payment:[0-9a-f-]{36}$/i.test(editing.note ?? "") ? (
        <input type="hidden" name="note" value={editing.note} />
      ) : (
        <Field label="Note">
          <Input name="note" defaultValue={draft.value("note") ?? editing?.note ?? ""} />
        </Field>
      )}
      {error && <p className="rounded-lg bg-danger-soft px-3 py-2 text-xs text-danger">{error}</p>}
      <div className="flex justify-end gap-2">
        {/* Cancel is an explicit discard — Esc/backdrop keep the draft. */}
        <Button
          type="button"
          variant="secondary"
          onClick={() => {
            draft.clear();
            onCancel();
          }}
        >
          Cancel
        </Button>
        <Button type="submit">{editing ? "Save" : "Create"}</Button>
      </div>
    </form>
  );
}
