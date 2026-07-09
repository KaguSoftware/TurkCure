"use client";

import * as React from "react";
import Link from "next/link";
import { Bell, Check, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Select, Field } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Badge, type Tone } from "@/components/ui/badge";
import { upsertReminder, toggleReminderDone, deleteReminder } from "@/lib/actions/reminders";
import type { Reminder, ReminderType } from "@/lib/types";
import { cn } from "@/lib/utils";

const TYPE_META: Record<ReminderType, { label: string; tone: Tone }> = {
  follow_up: { label: "Follow-up", tone: "blue" },
  arrival: { label: "Arrival", tone: "teal" },
  operation: { label: "Operation", tone: "violet" },
  payment: { label: "Payment", tone: "amber" },
  aftercare: { label: "Aftercare", tone: "green" },
};

export function RemindersPanel({
  reminders,
  agents,
  currentUserId,
}: {
  reminders: Reminder[];
  agents: { id: string; name: string }[];
  currentUserId: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const now = Date.now();

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    const result = await upsertReminder({
      type: fd.get("type"),
      title: fd.get("title"),
      note: fd.get("note") ?? "",
      due_at: new Date(String(fd.get("due_at"))).toISOString(),
      assigned_to: fd.get("assigned_to") || null,
    });
    setSaving(false);
    if (result.error) setError(result.error);
    else setOpen(false);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bell className="size-4 text-primary" /> Reminders
        </CardTitle>
        <Button size="sm" variant="soft" onClick={() => setOpen(true)}>
          <Plus /> New reminder
        </Button>
      </CardHeader>
      <CardContent className="space-y-2">
        {reminders.length === 0 && (
          <p className="py-8 text-center text-sm text-muted">
            All clear — nothing due in the next 14 days.
          </p>
        )}
        {reminders.map((r) => {
          const overdue = new Date(r.due_at).getTime() < now;
          const meta = TYPE_META[r.type];
          return (
            <div
              key={r.id}
              className={cn(
                "flex items-center gap-3 rounded-lg border border-border p-3",
                overdue && "border-danger/40 bg-danger-soft/40"
              )}
            >
              <button
                aria-label="Mark done"
                onClick={() => toggleReminderDone(r.id, true)}
                className="flex size-5 shrink-0 items-center justify-center rounded-full border border-border-strong text-transparent transition-colors hover:border-success hover:bg-success hover:text-white cursor-pointer"
              >
                <Check className="size-3" />
              </button>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {r.patient_id ? (
                    <Link href={`/patients/${r.patient_id}`} className="hover:text-primary">
                      {r.title}
                    </Link>
                  ) : (
                    r.title
                  )}
                </p>
                <p className="text-xs text-muted">
                  {new Date(r.due_at).toLocaleString("en-GB", {
                    day: "numeric",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                  {overdue && <span className="ml-1.5 font-medium text-danger">Overdue</span>}
                  {r.note && <span className="ml-1.5">· {r.note}</span>}
                </p>
              </div>
              <Badge tone={meta.tone}>{meta.label}</Badge>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Delete"
                className="hover:text-danger"
                onClick={() => deleteReminder(r.id)}
              >
                <Trash2 />
              </Button>
            </div>
          );
        })}
      </CardContent>

      <Dialog open={open} onClose={() => setOpen(false)} title="New reminder">
        <form onSubmit={onSubmit} className="space-y-4">
          <Field label="Title">
            <Input name="title" required placeholder="Call Ahmed about quote" />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Type">
              <Select name="type" defaultValue="follow_up">
                {Object.entries(TYPE_META).map(([value, m]) => (
                  <option key={value} value={value}>
                    {m.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Due">
              <Input name="due_at" type="datetime-local" required />
            </Field>
          </div>
          <Field label="Assign to">
            <Select name="assigned_to" defaultValue={currentUserId}>
              {agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Note">
            <Input name="note" />
          </Field>
          {error && <p className="rounded-lg bg-danger-soft px-3 py-2 text-xs text-danger">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : "Create"}
            </Button>
          </div>
        </form>
      </Dialog>
    </Card>
  );
}
