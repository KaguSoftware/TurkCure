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
import { Select, PopoverLayer, isInsidePopover } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Badge } from "@/components/ui/badge";
import { DatePicker } from "@/components/ui/date-picker";
import { toast } from "@/components/ui/toast";
import { clearDraft as clearFormDraft } from "@/lib/form-drafts";
import { upsertReminder, toggleReminderDone, deleteReminder } from "@/lib/actions/reminders";
import { ReminderForm, TYPE_META } from "@/components/reminders/reminder-form";
import type { Reminder, ReminderType } from "@/lib/types";
import { cn } from "@/lib/utils";
import { usePresence } from "@/lib/use-presence";

const STRIKE_MS = 750; // check pop + line draw before the row starts leaving
const EXIT_MS = 260; // matches reminder-out in globals.css

export function RemindersPanel({
  reminders,
  completedReminders = [],
  agents,
  currentUserId,
  horizonDays = 14,
  laterCount = 0,
}: {
  reminders: Reminder[];
  completedReminders?: Reminder[];
  agents: { id: string; name: string }[];
  currentUserId: string;
  /** The dashboard's ?days= window; only used for copy. */
  horizonDays?: number;
  /** Open reminders due beyond the window — shown so they're never invisible. */
  laterCount?: number;
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
  // Reminder staged for delete-confirmation (null = no dialog open).
  const [confirmDelete, setConfirmDelete] = React.useState<Reminder | null>(null);
  const [deletePending, setDeletePending] = React.useState(false);
  // Who's shown by default: your own (and unassigned) reminders. "Everyone"
  // is one click away — with two agents, the other person's list is noise
  // most of the time but must never be hard to reach.
  const [scope, setScope] = React.useState<"mine" | "all">("mine");
  // Re-evaluated every minute so a long-open dashboard tab keeps its
  // "Overdue" flags honest (it used to be frozen at mount).
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);
  const agentName = React.useMemo(() => new Map(agents.map((a) => [a.id, a.name])), [agents]);

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
      clearFormDraft(`reminder:${editing.id}`);
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
      toast.error(`Couldn't save reminder: ${result.error}`);
    } else if (result.reminder) {
      clearFormDraft("reminder:new");
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
        toast.error(`Couldn't update: ${result.error}`);
      }
    });
  }

  function onSnooze(r: Reminder, newDue: string, label: string) {
    if (snoozing.has(r.id) || completing.has(r.id) || exiting.has(r.id)) return;
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
        toast.error(`Couldn't snooze: ${result.error}`);
      } else {
        toast.success(`Snoozed — ${label}.`);
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

  // Runs the actual delete once confirmed: start the exit animation, then fire
  // the server call with optimistic rollback on failure.
  function runDelete(r: Reminder) {
    if (exiting.has(r.id)) return;
    setDeletePending(true);
    animatingIds.current.add(r.id);
    removedIds.current.add(r.id);
    setInSet(setExiting, r.id, true);
    timers.current.set(r.id, [setTimeout(() => removeRow(r.id), EXIT_MS)]);
    deleteReminder(r.id).then((result) => {
      setDeletePending(false);
      setConfirmDelete(null);
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
          // "Mine" keeps unassigned reminders visible — they belong to no one,
          // so hiding them by default would make them belong to nobody at all.
          if (scope === "mine" && r.assigned_to && r.assigned_to !== currentUserId) return false;
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
    [withDone, scope, currentUserId, typeFilter, patientFilter, assigneeFilter, dueFrom, dueTo]
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
          <div className="flex rounded-lg border border-border bg-surface p-0.5 shadow-card">
            {(["mine", "all"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setScope(s)}
                className={cn(
                  "pressable rounded-md px-2.5 py-1 text-xs font-medium cursor-pointer",
                  scope === s ? "bg-primary-soft text-primary" : "text-muted"
                )}
              >
                {s === "mine" ? "Mine" : "Everyone"}
              </button>
            ))}
          </div>
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
              className="w-full sm:w-36"
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
              className="w-full sm:w-44"
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
              className="w-full sm:w-40"
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
            <DatePicker value={dueFrom} onChange={setDueFrom} placeholder="Due from" className="w-full sm:w-36" />
            <DatePicker value={dueTo} onChange={setDueTo} placeholder="Due to" className="w-full sm:w-36" />
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
        {shown.length === 0 && (
          <p className="py-8 text-center text-sm text-muted">
            {filtersActive
              ? "No reminders match these filters."
              : scope === "mine" && withDone.length > 0
                ? "Nothing assigned to you — switch to Everyone to see the rest."
                : `All clear — nothing due in the next ${horizonDays} days.`}
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
                "flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-border p-3 sm:flex-nowrap",
                overdue && "border-danger/40 bg-danger-soft/40",
                isDone && !isCompleting && "opacity-70",
                pendingIds.current.has(r.id) && "reminder-enter"
              )}
            >
              <button
                aria-label={isDone ? "Mark not done" : "Mark done"}
                onClick={() => onToggleDone(r)}
                // The visual circle stays 20px; an invisible ::before extends the
                // hit area to ~44px without changing the layout.
                className={cn(
                  "relative flex size-5 shrink-0 items-center justify-center rounded-full border transition-colors cursor-pointer",
                  "before:absolute before:-inset-3 before:content-['']",
                  isDone || isCompleting
                    ? "border-success bg-success text-white"
                    : "border-border-strong text-transparent hover:border-success hover:bg-success hover:text-white"
                )}
              >
                <Check className={cn("size-3", isCompleting && "reminder-check-pop")} />
              </button>
              {/* Claiming everything except the toggle ends the line here, so
                  the badge and actions wrap underneath on a phone. On one line
                  they squeezed the patient's name down to "Cherr…". */}
              <div className="min-w-0 flex-1 basis-[calc(100%-2.5rem)] sm:basis-auto">
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
                <p className="truncate text-xs text-muted">
                  <span className="whitespace-nowrap">
                    {new Date(r.due_at).toLocaleString("en-GB", {
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                  {overdue && (
                    <span className="ml-1.5 font-medium text-danger">Overdue</span>
                  )}
                  {/* The cron's dedupe marker (`payment:<uuid>`) lives in the
                      note column; it's plumbing, not something to display. */}
                  {r.note && !/^payment:[0-9a-f-]{36}$/i.test(r.note) && (
                    <span className="ml-1.5">· {r.note}</span>
                  )}
                  {/* Who owns it: always flag unassigned; name the owner when
                      looking at everyone's list. */}
                  {!r.assigned_to ? (
                    <span className="ml-1.5 text-muted-light">· Unassigned</span>
                  ) : scope === "all" ? (
                    <span className="ml-1.5">· {agentName.get(r.assigned_to) ?? "Unknown"}</span>
                  ) : null}
                </p>
              </div>
              <Badge tone={meta.tone} className="shrink-0">
                {meta.label}
              </Badge>
              <div className="ml-auto flex shrink-0 gap-0.5 sm:ml-0">
                {!isDone && (
                  <SnoozeMenu
                    disabled={snoozing.has(r.id)}
                    onPick={(iso, label) => onSnooze(r, iso, label)}
                  />
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
                  onClick={() => setConfirmDelete(r)}
                >
                  <Trash2 />
                </Button>
              </div>
            </div>
            </div>
          );
        })}

        {/* Reminders beyond the window used to be silently invisible until they
            entered it; now at least their existence is stated. */}
        {laterCount > 0 && (
          <p className="pt-1 text-center text-xs text-muted-light">
            +{laterCount} more due beyond {horizonDays} days
          </p>
        )}

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
        {/* Dialog unmounts its children when closed, so the form — and its
            draft state — mounts fresh on every open. */}
        <ReminderForm
          editing={editing}
          agents={agents}
          currentUserId={currentUserId}
          error={error}
          onSubmit={onSubmit}
          onCancel={() => {
            setOpen(false);
            setEditing(null);
          }}
        />
      </Dialog>

      <ConfirmDialog
        open={confirmDelete !== null}
        onClose={() => setConfirmDelete(null)}
        onConfirm={() => confirmDelete && runDelete(confirmDelete)}
        pending={deletePending}
        title="Delete reminder"
        description={
          <>
            Delete{" "}
            <span className="font-medium text-foreground">
              {confirmDelete?.title || "this reminder"}
            </span>
            ? This cannot be undone.
          </>
        }
      />
    </Card>
  );
}

/**
 * Snooze options in a small popover — the old single button always pushed
 * +1 day, which was wrong as often as it was right. Times are local.
 */
function SnoozeMenu({
  disabled,
  onPick,
}: {
  disabled?: boolean;
  onPick: (dueAtIso: string, label: string) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const rootRef = React.useRef<HTMLDivElement>(null);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const { mounted, closing } = usePresence(open, 150);

  React.useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!isInsidePopover(e.target, rootRef.current)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function options(): { label: string; date: Date }[] {
    const inOneHour = new Date(Date.now() + 60 * 60 * 1000);
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(9, 0, 0, 0);
    const nextWeek = new Date();
    nextWeek.setDate(nextWeek.getDate() + 7);
    nextWeek.setHours(9, 0, 0, 0);
    return [
      { label: "in 1 hour", date: inOneHour },
      { label: "tomorrow 9:00", date: tomorrow },
      { label: "next week", date: nextWeek },
    ];
  }

  return (
    <div ref={rootRef} className="relative">
      <Button
        ref={triggerRef}
        variant="ghost"
        size="icon"
        aria-label="Snooze"
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
      >
        <AlarmClockPlus />
      </Button>
      {mounted && (
        <PopoverLayer
          anchorRef={triggerRef}
          className={cn(
            "animate-dropdown min-w-max rounded-lg border border-border bg-surface p-1 shadow-pop",
            closing && "animate-dropdown-out"
          )}
        >
          <div role="menu">
            {options().map((o) => (
              <button
                key={o.label}
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  onPick(o.date.toISOString(), o.label);
                }}
                className="flex w-full items-center rounded-md px-2.5 py-1.5 text-left text-sm transition-colors cursor-pointer hover:bg-surface-hover"
              >
                Snooze {o.label}
              </button>
            ))}
          </div>
        </PopoverLayer>
      )}
    </div>
  );
}

