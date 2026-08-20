"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Bell, Check, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { toast } from "@/components/ui/toast";
import { ReminderForm, TYPE_META } from "@/components/reminders/reminder-form";
import { upsertReminder, toggleReminderDone, deleteReminder } from "@/lib/actions/reminders";
import { clearDraft as clearFormDraft } from "@/lib/form-drafts";
import { cn } from "@/lib/utils";
import type { Reminder } from "@/lib/types";

/**
 * The patient's own open reminders, on the patient page — before this they
 * were dashboard-only, and there was no way to create a reminder from the
 * patient you were looking at. Deliberately lean next to the dashboard panel:
 * open items only, no filters; the dashboard remains the working queue.
 */
export function PatientReminders({
  patientId,
  reminders,
  agents,
  currentUserId,
}: {
  patientId: string;
  reminders: Reminder[];
  agents: { id: string; name: string }[];
  currentUserId: string;
}) {
  const router = useRouter();
  const [items, setItems] = React.useState(reminders);
  const [prevServer, setPrevServer] = React.useState(reminders);
  if (prevServer !== reminders) {
    setPrevServer(reminders);
    setItems(reminders);
  }
  const [open, setOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Reminder | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = React.useState<Reminder | null>(null);
  const [deletePending, setDeletePending] = React.useState(false);
  const [busy, setBusy] = React.useState<ReadonlySet<string>>(new Set());

  function setBusyId(id: string, on: boolean) {
    setBusy((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
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
      patient_id: patientId,
    };
    const result = await upsertReminder(values, editing?.id);
    if (result.error) {
      setError(`Couldn't save: ${result.error}`);
      return;
    }
    clearFormDraft(`reminder:${editing?.id ?? "new"}`);
    const saved = result.reminder;
    if (saved) {
      setItems((prev) => {
        const next = prev.some((r) => r.id === saved.id)
          ? prev.map((r) => (r.id === saved.id ? { ...r, ...saved } : r))
          : [...prev, saved];
        return next.sort((a, b) => new Date(a.due_at).getTime() - new Date(b.due_at).getTime());
      });
    }
    setOpen(false);
    setEditing(null);
    toast.success(editing ? "Reminder updated." : "Reminder created.");
    React.startTransition(() => router.refresh());
  }

  function onDone(r: Reminder) {
    if (busy.has(r.id)) return;
    setBusyId(r.id, true);
    setItems((prev) => prev.filter((x) => x.id !== r.id));
    toggleReminderDone(r.id, true).then((result) => {
      setBusyId(r.id, false);
      if (result.error) {
        setItems((prev) =>
          [...prev, r].sort((a, b) => new Date(a.due_at).getTime() - new Date(b.due_at).getTime())
        );
        toast.error(`Couldn't update: ${result.error}`);
      } else {
        toast.success("Done.");
        React.startTransition(() => router.refresh());
      }
    });
  }

  async function onDelete(r: Reminder) {
    setDeletePending(true);
    const result = await deleteReminder(r.id);
    setDeletePending(false);
    setConfirmDelete(null);
    if (result.error) {
      toast.error(`Couldn't delete: ${result.error}`);
      return;
    }
    setItems((prev) => prev.filter((x) => x.id !== r.id));
    toast.success("Reminder deleted.");
    React.startTransition(() => router.refresh());
  }

  const now = Date.now();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bell className="size-4 text-primary" /> Reminders
          {items.length > 0 && (
            <span className="text-xs font-normal text-muted-light">{items.length} open</span>
          )}
        </CardTitle>
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
      </CardHeader>
      <CardContent className="space-y-2">
        {items.length === 0 && (
          <p className="py-4 text-center text-sm text-muted">
            No open reminders for this patient.
          </p>
        )}
        {items.map((r) => {
          const overdue = new Date(r.due_at).getTime() < now;
          const meta = TYPE_META[r.type];
          return (
            <div
              key={r.id}
              className={cn(
                "flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-border p-3 sm:flex-nowrap",
                overdue && "border-danger/40 bg-danger-soft/40"
              )}
            >
              <button
                aria-label="Mark done"
                disabled={busy.has(r.id)}
                onClick={() => onDone(r)}
                className={cn(
                  "relative flex size-5 shrink-0 items-center justify-center rounded-full border transition-colors cursor-pointer",
                  "before:absolute before:-inset-3 before:content-['']",
                  "border-border-strong text-transparent hover:border-success hover:bg-success hover:text-white"
                )}
              >
                <Check className="size-3" />
              </button>
              <div className="min-w-0 flex-1 basis-[calc(100%-2.5rem)] sm:basis-auto">
                <p className="truncate text-sm font-medium">{r.title}</p>
                <p className="truncate text-xs text-muted">
                  <span className="whitespace-nowrap">
                    {new Date(r.due_at).toLocaleString("en-GB", {
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                  {overdue && <span className="ml-1.5 font-medium text-danger">Overdue</span>}
                </p>
              </div>
              <Badge tone={meta.tone} className="shrink-0">
                {meta.label}
              </Badge>
              <div className="ml-auto flex shrink-0 gap-0.5 sm:ml-0">
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
          );
        })}
      </CardContent>

      <Dialog
        open={open}
        onClose={() => {
          setOpen(false);
          setEditing(null);
        }}
        title={editing ? "Edit reminder" : "New reminder"}
      >
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
        onConfirm={() => confirmDelete && onDelete(confirmDelete)}
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
