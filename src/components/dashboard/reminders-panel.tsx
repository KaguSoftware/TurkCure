"use client";

import * as React from "react";
import Link from "next/link";
import { Bell, Check, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Select, Field } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Badge, type Tone } from "@/components/ui/badge";
import { DateTimePicker } from "@/components/ui/date-picker";
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

const STRIKE_MS = 750; // check pop + line draw before the row starts leaving
const EXIT_MS = 260; // matches reminder-out in globals.css

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
  const [error, setError] = React.useState<string | null>(null);
  const [listError, setListError] = React.useState<string | null>(null);
  const [now] = React.useState(() => Date.now());

  // Optimistic copy of the list. Server revalidation resets it via the effect
  // below; pendingIds keeps in-flight optimistic inserts, removedIds keeps
  // optimistic removals from resurfacing until the server catches up.
  const [items, setItems] = React.useState(reminders);
  const [completing, setCompleting] = React.useState<ReadonlySet<string>>(new Set());
  const [exiting, setExiting] = React.useState<ReadonlySet<string>>(new Set());
  const pendingIds = React.useRef(new Set<string>());
  const removedIds = React.useRef(new Set<string>());
  const timers = React.useRef(new Map<string, ReturnType<typeof setTimeout>[]>());

  React.useEffect(() => {
    for (const id of removedIds.current)
      if (!reminders.some((r) => r.id === id)) removedIds.current.delete(id);
    setItems((prev) => {
      const inFlight = prev.filter((p) => pendingIds.current.has(p.id));
      const fromServer = reminders.filter((r) => !removedIds.current.has(r.id));
      return [...fromServer, ...inFlight].sort(
        (a, b) => new Date(a.due_at).getTime() - new Date(b.due_at).getTime()
      );
    });
  }, [reminders]);

  React.useEffect(() => {
    const map = timers.current;
    return () => map.forEach((list) => list.forEach(clearTimeout));
  }, []);

  function setInSet(
    setter: React.Dispatch<React.SetStateAction<ReadonlySet<string>>>,
    id: string,
    present: boolean
  ) {
    setter((prev) => {
      const next = new Set(prev);
      if (present) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function removeRow(id: string) {
    removedIds.current.add(id);
    setItems((prev) => prev.filter((r) => r.id !== id));
    setInSet(setCompleting, id, false);
    setInSet(setExiting, id, false);
    timers.current.delete(id);
  }

  function cancelTimers(id: string) {
    timers.current.get(id)?.forEach(clearTimeout);
    timers.current.delete(id);
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    if (!fd.get("due_at")) {
      setError("Pick a due date");
      return;
    }
    const values = {
      type: fd.get("type"),
      title: fd.get("title"),
      note: fd.get("note") ?? "",
      due_at: new Date(String(fd.get("due_at"))).toISOString(),
      assigned_to: fd.get("assigned_to") || null,
    };

    // Optimistic: show the reminder and close the dialog immediately.
    const tempId = crypto.randomUUID();
    const optimistic: Reminder = {
      id: tempId,
      type: values.type as ReminderType,
      patient_id: null,
      case_id: null,
      title: String(values.title),
      note: String(values.note),
      due_at: values.due_at,
      assigned_to: values.assigned_to ? String(values.assigned_to) : null,
      done_at: null,
    };
    pendingIds.current.add(tempId);
    setListError(null);
    setItems((prev) =>
      [...prev, optimistic].sort(
        (a, b) => new Date(a.due_at).getTime() - new Date(b.due_at).getTime()
      )
    );
    setOpen(false);

    const result = await upsertReminder(values);
    pendingIds.current.delete(tempId);
    if (result.error) {
      setItems((prev) => prev.filter((r) => r.id !== tempId));
      setListError(`Couldn't save reminder: ${result.error}`);
    } else if (result.reminder) {
      const saved = result.reminder;
      setItems((prev) =>
        prev.some((r) => r.id === saved.id)
          ? prev.filter((r) => r.id !== tempId)
          : prev.map((r) => (r.id === tempId ? { ...optimistic, ...saved } : r))
      );
    }
  }

  function onMarkDone(r: Reminder) {
    if (completing.has(r.id) || exiting.has(r.id)) return;
    setListError(null);
    setInSet(setCompleting, r.id, true);
    timers.current.set(r.id, [
      setTimeout(() => setInSet(setExiting, r.id, true), STRIKE_MS),
      setTimeout(() => removeRow(r.id), STRIKE_MS + EXIT_MS),
    ]);
    toggleReminderDone(r.id, true).then((result) => {
      if (result.error) {
        cancelTimers(r.id);
        removedIds.current.delete(r.id);
        setInSet(setCompleting, r.id, false);
        setInSet(setExiting, r.id, false);
        setItems((prev) =>
          prev.some((x) => x.id === r.id)
            ? prev
            : [...prev, r].sort((a, b) => new Date(a.due_at).getTime() - new Date(b.due_at).getTime())
        );
        setListError(`Couldn't mark done: ${result.error}`);
      }
    });
  }

  function onDelete(r: Reminder) {
    if (exiting.has(r.id)) return;
    setListError(null);
    setInSet(setExiting, r.id, true);
    timers.current.set(r.id, [setTimeout(() => removeRow(r.id), EXIT_MS)]);
    deleteReminder(r.id).then((result) => {
      if (result.error) {
        cancelTimers(r.id);
        removedIds.current.delete(r.id);
        setInSet(setExiting, r.id, false);
        setItems((prev) =>
          prev.some((x) => x.id === r.id)
            ? prev
            : [...prev, r].sort((a, b) => new Date(a.due_at).getTime() - new Date(b.due_at).getTime())
        );
        setListError(`Couldn't delete: ${result.error}`);
      }
    });
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
        {listError && (
          <p className="rounded-lg bg-danger-soft px-3 py-2 text-xs text-danger">{listError}</p>
        )}
        {items.length === 0 && (
          <p className="py-8 text-center text-sm text-muted">
            All clear — nothing due in the next 14 days.
          </p>
        )}
        {items.map((r) => {
          const overdue = new Date(r.due_at).getTime() < now;
          const meta = TYPE_META[r.type];
          const isCompleting = completing.has(r.id);
          const isExiting = exiting.has(r.id);
          return (
            <div
              key={r.id}
              className={cn(
                "flex items-center gap-3 rounded-lg border border-border p-3",
                overdue && !isCompleting && "border-danger/40 bg-danger-soft/40",
                pendingIds.current.has(r.id) && "reminder-enter",
                isExiting && "reminder-exit"
              )}
            >
              <button
                aria-label="Mark done"
                onClick={() => onMarkDone(r)}
                className={cn(
                  "flex size-5 shrink-0 items-center justify-center rounded-full border transition-colors cursor-pointer",
                  isCompleting
                    ? "border-success bg-success text-white"
                    : "border-border-strong text-transparent hover:border-success hover:bg-success hover:text-white"
                )}
              >
                <Check className={cn("size-3", isCompleting && "reminder-check-pop")} />
              </button>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  <span
                    className={cn(
                      "reminder-strike inline-block max-w-full truncate align-bottom",
                      isCompleting && "struck"
                    )}
                  >
                    {r.patient_id ? (
                      <Link href={`/patients/${r.patient_id}`} className="hover:text-primary">
                        {r.title}
                      </Link>
                    ) : (
                      r.title
                    )}
                  </span>
                </p>
                <p className="text-xs text-muted">
                  {new Date(r.due_at).toLocaleString("en-GB", {
                    day: "numeric",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                  {overdue && !isCompleting && (
                    <span className="ml-1.5 font-medium text-danger">Overdue</span>
                  )}
                  {r.note && <span className="ml-1.5">· {r.note}</span>}
                </p>
              </div>
              <Badge tone={meta.tone}>{meta.label}</Badge>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Delete"
                className="hover:text-danger"
                onClick={() => onDelete(r)}
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
              <DateTimePicker name="due_at" />
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
            <Button type="submit">Create</Button>
          </div>
        </form>
      </Dialog>
    </Card>
  );
}
