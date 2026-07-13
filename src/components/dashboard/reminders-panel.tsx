"use client";

import * as React from "react";
import Link from "next/link";
import {
  AlarmClockPlus,
  Bell,
  Check,
  Pencil,
  Plus,
  RotateCcw,
  SlidersHorizontal,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Select, Field } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Badge, type Tone } from "@/components/ui/badge";
import { DatePicker, DateTimePicker } from "@/components/ui/date-picker";
import { toast } from "@/components/ui/toast";
import { upsertReminder, toggleReminderDone, deleteReminder } from "@/lib/actions/reminders";
import type { Reminder, ReminderType } from "@/lib/types";
import { cn } from "@/lib/utils";
import { usePresence } from "@/lib/use-presence";

const TYPE_META: Record<ReminderType, { label: string; tone: Tone }> = {
  follow_up: { label: "Follow-up", tone: "blue" },
  arrival: { label: "Arrival", tone: "teal" },
  operation: { label: "Operation", tone: "violet" },
  payment: { label: "Payment", tone: "amber" },
  aftercare: { label: "Aftercare", tone: "green" },
};

/** ISO UTC → local "YYYY-MM-DDTHH:mm" for the DateTimePicker. */
function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const STRIKE_MS = 750; // check pop + line draw before the row starts leaving
const EXIT_MS = 260; // matches reminder-out in globals.css

export function RemindersPanel({
  reminders,
  completedReminders = [],
  agents,
  currentUserId,
}: {
  reminders: Reminder[];
  completedReminders?: Reminder[];
  agents: { id: string; name: string }[];
  currentUserId: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Reminder | null>(null);
  const [showCompleted, setShowCompleted] = React.useState(false);
  const [snoozing, setSnoozing] = React.useState<ReadonlySet<string>>(new Set());
  const [reopening, setReopening] = React.useState<ReadonlySet<string>>(new Set());
  const [showFilters, setShowFilters] = React.useState(false);
  const [typeFilter, setTypeFilter] = React.useState("all");
  const [patientFilter, setPatientFilter] = React.useState("all");
  const [assigneeFilter, setAssigneeFilter] = React.useState("all");
  const [dueFrom, setDueFrom] = React.useState("");
  const [dueTo, setDueTo] = React.useState("");
  const filtersPanel = usePresence(showFilters, 160);
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
  // Rows whose exit animation is running. The server-sync effect must leave
  // these completely alone — otherwise a revalidation landing mid-animation
  // yanks the row out (cutting the animation) or, if a stale read still has it,
  // puts it right back, which reads as "animates, then pops back, click again".
  const animatingIds = React.useRef(new Set<string>());
  const timers = React.useRef(new Map<string, ReturnType<typeof setTimeout>[]>());

  React.useEffect(() => {
    // Drop ids from removedIds once the server has actually caught up (row is
    // gone AND we're no longer animating it), so the set can't grow unbounded.
    for (const id of removedIds.current)
      if (!reminders.some((r) => r.id === id) && !animatingIds.current.has(id))
        removedIds.current.delete(id);
    // Once the server list contains a pending id, the server has caught up.
    for (const id of pendingIds.current)
      if (reminders.some((r) => r.id === id)) pendingIds.current.delete(id);
    setItems((prev) => {
      const inFlight = prev.filter((p) => pendingIds.current.has(p.id));
      // Preserve any row currently animating exactly as it is on screen.
      const animating = prev.filter((p) => animatingIds.current.has(p.id));
      const animatingSet = new Set(animating.map((p) => p.id));
      const fromServer = reminders.filter(
        (r) => !removedIds.current.has(r.id) && !animatingSet.has(r.id)
      );
      return [...fromServer, ...animating, ...inFlight].sort(
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
    animatingIds.current.delete(id);
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

    if (editing) {
      // Edit path: simple await + in-place update (no optimistic insert needed).
      const result = await upsertReminder(values, editing.id);
      if (result.error) {
        setError(`Couldn't save: ${result.error}`);
        return;
      }
      const saved = result.reminder;
      if (saved) {
        setItems((prev) =>
          prev
            .map((r) => (r.id === saved.id ? { ...r, ...saved } : r))
            .sort((a, b) => new Date(a.due_at).getTime() - new Date(b.due_at).getTime())
        );
      }
      setOpen(false);
      setEditing(null);
      toast.success("Reminder updated.");
      return;
    }

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
      toast.error(`Couldn't save reminder: ${result.error}`);
    } else if (result.reminder) {
      const saved = result.reminder;
      setItems((prev) =>
        prev.some((r) => r.id === saved.id)
          ? prev.filter((r) => r.id !== tempId)
          : prev.map((r) => (r.id === tempId ? { ...optimistic, ...saved } : r))
      );
    }
  }

  // Optimistic done/undone overrides. A checked reminder stays in the list,
  // struck through, until 24h have passed (server stops returning it) or it's
  // deleted. Overrides win over stale server reads until the server catches up.
  const [doneOverrides, setDoneOverrides] = React.useState<Record<string, string | null>>({});

  React.useEffect(() => {
    setDoneOverrides((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const id of Object.keys(next)) {
        const server = reminders.find((r) => r.id === id);
        if (server && (server.done_at ?? null) === next[id]) {
          delete next[id];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [reminders]);

  function onToggleDone(r: Reminder) {
    if (exiting.has(r.id)) return;
    const marking = !r.done_at;
    setListError(null);
    if (marking) {
      // Check pop + strike-through animation; the row stays put.
      setInSet(setCompleting, r.id, true);
      cancelTimers(r.id);
      timers.current.set(r.id, [
        setTimeout(() => setInSet(setCompleting, r.id, false), STRIKE_MS),
      ]);
    }
    setDoneOverrides((prev) => ({ ...prev, [r.id]: marking ? new Date().toISOString() : null }));
    toggleReminderDone(r.id, marking).then((result) => {
      if (result.error) {
        cancelTimers(r.id);
        setInSet(setCompleting, r.id, false);
        setDoneOverrides((prev) => {
          const next = { ...prev };
          delete next[r.id];
          return next;
        });
        setListError(`Couldn't update: ${result.error}`);
        toast.error(`Couldn't update: ${result.error}`);
      }
    });
  }

  function onSnooze(r: Reminder) {
    if (snoozing.has(r.id) || completing.has(r.id) || exiting.has(r.id)) return;
    setListError(null);
    // Tomorrow relative to now if overdue, otherwise +1 day from the due time.
    const base = Math.max(Date.now(), new Date(r.due_at).getTime());
    const newDue = new Date(base + 24 * 60 * 60 * 1000).toISOString();
    const prevDue = r.due_at;
    setInSet(setSnoozing, r.id, true);
    setItems((prev) =>
      prev
        .map((x) => (x.id === r.id ? { ...x, due_at: newDue } : x))
        .sort((a, b) => new Date(a.due_at).getTime() - new Date(b.due_at).getTime())
    );
    upsertReminder({ due_at: newDue }, r.id).then((result) => {
      setInSet(setSnoozing, r.id, false);
      if (result.error) {
        setItems((prev) =>
          prev
            .map((x) => (x.id === r.id ? { ...x, due_at: prevDue } : x))
            .sort((a, b) => new Date(a.due_at).getTime() - new Date(b.due_at).getTime())
        );
        setListError(`Couldn't snooze: ${result.error}`);
        toast.error(`Couldn't snooze: ${result.error}`);
      } else {
        toast.success("Snoozed until tomorrow.");
      }
    });
  }

  function onReopen(r: Reminder) {
    if (reopening.has(r.id)) return;
    setInSet(setReopening, r.id, true);
    toggleReminderDone(r.id, false).then((result) => {
      setInSet(setReopening, r.id, false);
      if (result.error) {
        toast.error(`Couldn't reopen: ${result.error}`);
      } else {
        // Let it show in the active list again even if server sync lags.
        removedIds.current.delete(r.id);
        pendingIds.current.add(r.id);
        setItems((prev) =>
          prev.some((x) => x.id === r.id)
            ? prev
            : [...prev, { ...r, done_at: null }].sort(
                (a, b) => new Date(a.due_at).getTime() - new Date(b.due_at).getTime()
              )
        );
        toast.success("Reminder reopened.");
      }
    });
  }

  function onDelete(r: Reminder) {
    if (exiting.has(r.id)) return;
    setListError(null);
    animatingIds.current.add(r.id);
    removedIds.current.add(r.id);
    setInSet(setExiting, r.id, true);
    timers.current.set(r.id, [setTimeout(() => removeRow(r.id), EXIT_MS)]);
    deleteReminder(r.id).then((result) => {
      if (result.error) {
        cancelTimers(r.id);
        animatingIds.current.delete(r.id);
        removedIds.current.delete(r.id);
        setInSet(setExiting, r.id, false);
        setItems((prev) =>
          prev.some((x) => x.id === r.id)
            ? prev
            : [...prev, r].sort((a, b) => new Date(a.due_at).getTime() - new Date(b.due_at).getTime())
        );
        setListError(`Couldn't delete: ${result.error}`);
        toast.error(`Couldn't delete: ${result.error}`);
      }
    });
  }

  // A completed row disappears from this list the moment it's reopened.
  const visibleCompleted = completedReminders.filter(
    (c) => !items.some((r) => r.id === c.id)
  );

  const withDone = React.useMemo(
    () =>
      items.map((r) => (r.id in doneOverrides ? { ...r, done_at: doneOverrides[r.id] } : r)),
    [items, doneOverrides]
  );
  const patientOptions = React.useMemo(
    () =>
      [
        ...new Map(
          withDone
            .filter((r) => r.patient_id)
            .map((r) => [r.patient_id!, r.patients?.full_name ?? "Unknown patient"])
        ).entries(),
      ].sort((a, b) => a[1].localeCompare(b[1])),
    [withDone]
  );

  const shown = React.useMemo(
    () =>
      withDone
        .filter((r) => {
          if (typeFilter !== "all" && r.type !== typeFilter) return false;
          if (patientFilter !== "all" && r.patient_id !== patientFilter) return false;
          if (assigneeFilter !== "all" && r.assigned_to !== assigneeFilter) return false;
          const due = r.due_at.slice(0, 10);
          if (dueFrom && due < dueFrom) return false;
          if (dueTo && due > dueTo) return false;
          return true;
        })
        // Unchecked always on top, each group ordered by due date.
        .sort((a, b) => {
          if (!!a.done_at !== !!b.done_at) return a.done_at ? 1 : -1;
          return new Date(a.due_at).getTime() - new Date(b.due_at).getTime();
        }),
    [withDone, typeFilter, patientFilter, assigneeFilter, dueFrom, dueTo]
  );

  const filtersActive =
    typeFilter !== "all" ||
    patientFilter !== "all" ||
    assigneeFilter !== "all" ||
    !!dueFrom ||
    !!dueTo;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bell className="size-4 text-primary" /> Reminders
        </CardTitle>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant={showFilters || filtersActive ? "soft" : "secondary"}
            onClick={() => setShowFilters((s) => !s)}
          >
            <SlidersHorizontal /> Filters
          </Button>
          <Button
            size="sm"
            variant="soft"
            onClick={() => {
              setEditing(null);
              setError(null);
              setOpen(true);
            }}
          >
            <Plus /> New reminder
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {filtersPanel.mounted && (
          <div
            className={cn(
              "animate-expand flex flex-wrap items-center gap-2 rounded-lg border border-border bg-surface-hover/40 p-2.5",
              filtersPanel.closing && "animate-expand-out"
            )}
          >
            <Select
              className="w-36"
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
            >
              <option value="all">All types</option>
              {Object.entries(TYPE_META).map(([value, m]) => (
                <option key={value} value={value}>
                  {m.label}
                </option>
              ))}
            </Select>
            <Select
              className="w-44"
              value={patientFilter}
              onChange={(e) => setPatientFilter(e.target.value)}
            >
              <option value="all">All patients</option>
              {patientOptions.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </Select>
            <Select
              className="w-40"
              value={assigneeFilter}
              onChange={(e) => setAssigneeFilter(e.target.value)}
            >
              <option value="all">All assignees</option>
              {agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
            <DatePicker value={dueFrom} onChange={setDueFrom} placeholder="Due from" className="w-36" />
            <DatePicker value={dueTo} onChange={setDueTo} placeholder="Due to" className="w-36" />
            {filtersActive && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setTypeFilter("all");
                  setPatientFilter("all");
                  setAssigneeFilter("all");
                  setDueFrom("");
                  setDueTo("");
                }}
              >
                Clear
              </Button>
            )}
          </div>
        )}
        {listError && (
          <p className="rounded-lg bg-danger-soft px-3 py-2 text-xs text-danger">{listError}</p>
        )}
        {shown.length === 0 && (
          <p className="py-8 text-center text-sm text-muted">
            {filtersActive
              ? "No reminders match these filters."
              : "All clear — nothing due in the next 14 days."}
          </p>
        )}
        {shown.map((r) => {
          const isDone = !!r.done_at;
          const overdue = !isDone && new Date(r.due_at).getTime() < now;
          const meta = TYPE_META[r.type];
          const isCompleting = completing.has(r.id);
          const isExiting = exiting.has(r.id);
          return (
            <div key={r.id} className={cn(isExiting && "reminder-exit")}>
            <div
              className={cn(
                "flex items-center gap-3 rounded-lg border border-border p-3",
                overdue && "border-danger/40 bg-danger-soft/40",
                isDone && !isCompleting && "opacity-70",
                pendingIds.current.has(r.id) && "reminder-enter"
              )}
            >
              <button
                aria-label={isDone ? "Mark not done" : "Mark done"}
                onClick={() => onToggleDone(r)}
                className={cn(
                  "flex size-5 shrink-0 items-center justify-center rounded-full border transition-colors cursor-pointer",
                  isDone || isCompleting
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
                      (isDone || isCompleting) && "struck"
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
                  {overdue && (
                    <span className="ml-1.5 font-medium text-danger">Overdue</span>
                  )}
                  {r.note && <span className="ml-1.5">· {r.note}</span>}
                </p>
              </div>
              <Badge tone={meta.tone}>{meta.label}</Badge>
              <div className="flex shrink-0 gap-0.5">
                {!isDone && (
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Snooze 1 day"
                    disabled={snoozing.has(r.id)}
                    onClick={() => onSnooze(r)}
                  >
                    <AlarmClockPlus />
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Edit"
                  onClick={() => {
                    setEditing(r);
                    setError(null);
                    setOpen(true);
                  }}
                >
                  <Pencil />
                </Button>
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
            </div>
            </div>
          );
        })}

        {completedReminders.length > 0 && (
          <div className="pt-2">
            <button
              onClick={() => setShowCompleted((v) => !v)}
              className="text-xs font-medium text-muted hover:text-foreground cursor-pointer"
            >
              {showCompleted ? "Hide" : "Show"} completed ({visibleCompleted.length})
            </button>
            {showCompleted && (
              <div className="mt-2 space-y-2">
                {visibleCompleted.length === 0 && (
                  <p className="py-2 text-center text-xs text-muted">Nothing completed recently.</p>
                )}
                {visibleCompleted.map((r) => {
                  const meta = TYPE_META[r.type];
                  return (
                    <div
                      key={r.id}
                      className="flex items-center gap-3 rounded-lg border border-border p-3 opacity-70"
                    >
                      <span className="flex size-5 shrink-0 items-center justify-center rounded-full border border-success bg-success text-white">
                        <Check className="size-3" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium line-through">
                          {r.patient_id ? (
                            <Link href={`/patients/${r.patient_id}`} className="hover:text-primary">
                              {r.title}
                            </Link>
                          ) : (
                            r.title
                          )}
                        </p>
                        <p className="text-xs text-muted">
                          Done{" "}
                          {r.done_at &&
                            new Date(r.done_at).toLocaleString("en-GB", {
                              day: "numeric",
                              month: "short",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                        </p>
                      </div>
                      <Badge tone={meta.tone}>{meta.label}</Badge>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Reopen"
                        disabled={reopening.has(r.id)}
                        onClick={() => onReopen(r)}
                      >
                        <RotateCcw />
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </CardContent>

      <Dialog
        open={open}
        onClose={() => {
          setOpen(false);
          setEditing(null);
        }}
        title={editing ? "Edit reminder" : "New reminder"}
      >
        <form key={editing?.id ?? "new"} onSubmit={onSubmit} className="space-y-4">
          <Field label="Title">
            <Input
              name="title"
              required
              placeholder="Call Ahmed about quote"
              defaultValue={editing?.title ?? ""}
            />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Type">
              <Select name="type" defaultValue={editing?.type ?? "follow_up"}>
                {Object.entries(TYPE_META).map(([value, m]) => (
                  <option key={value} value={value}>
                    {m.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Assign to">
              <Select name="assigned_to" defaultValue={editing?.assigned_to ?? currentUserId}>
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
              defaultValue={editing ? toLocalInput(editing.due_at) : undefined}
            />
          </Field>
          <Field label="Note">
            <Input name="note" defaultValue={editing?.note ?? ""} />
          </Field>
          {error && <p className="rounded-lg bg-danger-soft px-3 py-2 text-xs text-danger">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setOpen(false);
                setEditing(null);
              }}
            >
              Cancel
            </Button>
            <Button type="submit">{editing ? "Save" : "Create"}</Button>
          </div>
        </form>
      </Dialog>
    </Card>
  );
}
