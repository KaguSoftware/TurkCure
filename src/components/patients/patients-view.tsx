"use client";

import * as React from "react";
import Link from "next/link";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  Kanban,
  List,
  Loader2,
  MessageCircle,
  Plus,
  Search,
  SlidersHorizontal,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Table, THead, TBody, Tr, Th, Td, EmptyRow } from "@/components/ui/table";
import { StatusBadge, PATIENT_STATUS_LABEL, PATIENT_STATUS_TONE, Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { PatientFormDialog } from "./patient-form";
import {
  setPatientStatus,
  bulkUpdatePatients,
  bulkDeletePatients,
  exportPatients,
} from "@/lib/actions/patients";
import { toast } from "@/components/ui/toast";
import { useOptimisticList } from "@/lib/use-optimistic-list";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { usePresence } from "@/lib/use-presence";
import { PATIENT_STATUSES, type Patient, type PatientStatus } from "@/lib/types";
import { cn, formatDate, waLink } from "@/lib/utils";

export function PatientsView({
  patients,
  total,
  page,
  pageSize,
  countries,
  agents,
  currentUserId,
  caseDirectories,
  isAdmin = false,
}: {
  patients: Patient[];
  total: number;
  page: number;
  pageSize: number;
  countries: { id: string; name: string }[];
  agents: { id: string; name: string }[];
  currentUserId: string;
  caseDirectories: import("./patient-form").CaseDirectories;
  isAdmin?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // Local copy of the server list so creates/edits show instantly.
  const { items: livePatients, setItems: setLivePatients } = useOptimisticList<Patient>(patients);

  const statusFilter = searchParams.get("status") ?? "all";
  const agentFilter = searchParams.get("agent") ?? "all";
  const countryFilter = searchParams.get("country") ?? "all";
  const urlQuery = searchParams.get("q") ?? "";

  // Optimistic status overrides so the board moves cards instantly.
  const [statusOverrides, setStatusOverrides] = React.useState<Record<string, PatientStatus>>({});
  const [mode, setMode] = React.useState<"board" | "table">("board");
  const [query, setQuery] = React.useState(urlQuery);
  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Patient | null>(null);
  const [showFilters, setShowFilters] = React.useState(false);
  // Manual column collapse state; empty columns auto-collapse unless toggled open
  const [colToggles, setColToggles] = React.useState<Record<string, boolean>>({});

  // Bulk selection (table mode)
  const [selected, setSelected] = React.useState<ReadonlySet<string>>(new Set());
  const [confirmBulkDelete, setConfirmBulkDelete] = React.useState(false);
  const [bulkPending, setBulkPending] = React.useState(false);
  const [exportPending, setExportPending] = React.useState(false);
  const filtersPanel = usePresence(showFilters, 160);
  const bulkBar = usePresence(selected.size > 0, 160);

  function setParams(updates: Record<string, string | null>, resetPage = true) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(updates)) {
      if (v === null || v === "" || v === "all") params.delete(k);
      else params.set(k, v);
    }
    if (resetPage) params.delete("page");
    router.replace(`${pathname}${params.size ? `?${params}` : ""}`, { scroll: false });
  }

  // Debounced server-side search via the URL.
  React.useEffect(() => {
    if (query === urlQuery) return;
    const t = setTimeout(() => setParams({ q: query || null }), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  // Clear stale selection when the visible set changes (page/filter change).
  React.useEffect(() => {
    setSelected((prev) => {
      const next = new Set([...prev].filter((id) => livePatients.some((p) => p.id === id)));
      return next.size === prev.size ? prev : next;
    });
  }, [livePatients]);

  const effective = React.useMemo(
    () =>
      livePatients.map((p) =>
        statusOverrides[p.id] ? { ...p, status: statusOverrides[p.id] } : p
      ),
    [livePatients, statusOverrides]
  );

  // Group once per render instead of filtering the whole list per board column.
  const byStatus = React.useMemo(() => {
    const map = new Map<PatientStatus, Patient[]>();
    for (const p of effective) {
      const arr = map.get(p.status);
      if (arr) arr.push(p);
      else map.set(p.status, [p]);
    }
    return map;
  }, [effective]);

  const onStatusChange = React.useCallback(
    async (p: Patient, status: PatientStatus) => {
      const prev = p.status;
      setStatusOverrides((o) => ({ ...o, [p.id]: status }));
      const result = await setPatientStatus(p.id, status);
      if (result.error) {
        setStatusOverrides((o) => ({ ...o, [p.id]: prev }));
        toast.error(`Could not update status: ${result.error}`);
      } else {
        toast.success(`${p.full_name} moved to ${PATIENT_STATUS_LABEL[status]}.`);
        React.startTransition(() => router.refresh());
      }
    },
    [router]
  );

  const filtersActive =
    statusFilter !== "all" || agentFilter !== "all" || countryFilter !== "all";

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const rangeStart = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(page * pageSize, total);

  function openNew() {
    setEditing(null);
    setFormOpen(true);
  }

  const toggleSelect = React.useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const allSelected = effective.length > 0 && effective.every((p) => selected.has(p.id));

  const onBulkUpdate = React.useCallback(
    async (values: { status?: PatientStatus; assigned_agent_id?: string }) => {
      setBulkPending(true);
      const result = await bulkUpdatePatients([...selected], values);
      setBulkPending(false);
      if (result.error) toast.error(`Bulk update failed: ${result.error}`);
      else {
        toast.success(`Updated ${result.updated} patient${result.updated === 1 ? "" : "s"}.`);
        setSelected(new Set());
        React.startTransition(() => router.refresh());
      }
    },
    [selected, router]
  );

  async function onBulkDelete() {
    setBulkPending(true);
    const result = await bulkDeletePatients([...selected]);
    setBulkPending(false);
    setConfirmBulkDelete(false);
    if (result.error) toast.error(`Delete failed: ${result.error}`);
    else {
      toast.success(`Deleted ${result.deleted} patient${result.deleted === 1 ? "" : "s"}.`);
      setSelected(new Set());
      React.startTransition(() => router.refresh());
    }
  }

  async function onExport() {
    setExportPending(true);
    const result = await exportPatients({
      q: urlQuery || undefined,
      status: statusFilter === "all" ? undefined : statusFilter,
      agent: agentFilter === "all" ? undefined : agentFilter,
      country: countryFilter === "all" ? undefined : countryFilter,
    });
    setExportPending(false);
    if (result.error || !result.csv) {
      toast.error(`Export failed: ${result.error ?? "unknown error"}`);
      return;
    }
    const blob = new Blob([`﻿${result.csv}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `patients-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Patients exported.");
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative w-full max-w-xs">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-light" />
          <Input
            placeholder="Search patients…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button
            variant={showFilters || filtersActive ? "soft" : "secondary"}
            size="sm"
            onClick={() => setShowFilters((s) => !s)}
          >
            <SlidersHorizontal /> Filters
          </Button>
          <Button variant="secondary" size="sm" onClick={onExport} pending={exportPending}>
            <Download /> Export
          </Button>
          <div className="flex rounded-lg border border-border bg-surface p-0.5 shadow-card">
            <button
              onClick={() => setMode("board")}
              className={cn(
                "pressable flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium cursor-pointer",
                mode === "board" ? "bg-primary-soft text-primary" : "text-muted"
              )}
            >
              <Kanban className="size-3.5" /> Board
            </button>
            <button
              onClick={() => setMode("table")}
              className={cn(
                "pressable flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium cursor-pointer",
                mode === "table" ? "bg-primary-soft text-primary" : "text-muted"
              )}
            >
              <List className="size-3.5" /> Table
            </button>
          </div>
          <Button onClick={openNew}>
            <Plus /> New Patient
          </Button>
        </div>
      </div>

      {filtersPanel.mounted && (
        <div
          className={cn(
            "animate-expand flex flex-wrap items-center gap-3 rounded-xl border border-border bg-surface p-3 shadow-card",
            filtersPanel.closing && "animate-expand-out"
          )}
        >
          <Select
            className="w-40"
            value={statusFilter}
            onChange={(e) => setParams({ status: e.target.value })}
          >
            <option value="all">All statuses</option>
            {PATIENT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {PATIENT_STATUS_LABEL[s]}
              </option>
            ))}
          </Select>
          <Select
            className="w-44"
            value={agentFilter}
            onChange={(e) => setParams({ agent: e.target.value })}
          >
            <option value="all">All agents</option>
            {agents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
          <Select
            className="w-44"
            value={countryFilter}
            onChange={(e) => setParams({ country: e.target.value })}
          >
            <option value="all">All countries</option>
            {countries.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
          {filtersActive && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setParams({ status: null, agent: null, country: null })}
            >
              Clear
            </Button>
          )}
        </div>
      )}

      {bulkBar.mounted && (
        <div
          className={cn(
            "animate-expand flex flex-wrap items-center gap-3 rounded-xl border border-primary/30 bg-primary-soft/40 p-3 shadow-card",
            bulkBar.closing && "animate-expand-out"
          )}
        >
          <span className="text-sm font-medium">
            {selected.size} selected
          </span>
          {bulkPending && <Loader2 className="size-4 animate-spin text-muted" />}
          <Select
            className="w-44"
            value=""
            disabled={bulkPending}
            onChange={(e) => {
              if (e.target.value) onBulkUpdate({ status: e.target.value as PatientStatus });
            }}
          >
            <option value="">Set status…</option>
            {PATIENT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {PATIENT_STATUS_LABEL[s]}
              </option>
            ))}
          </Select>
          <Select
            className="w-44"
            value=""
            disabled={bulkPending}
            onChange={(e) => {
              if (e.target.value) onBulkUpdate({ assigned_agent_id: e.target.value });
            }}
          >
            <option value="">Assign to…</option>
            {agents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
          {isAdmin && (
            <Button
              variant="ghost"
              size="sm"
              className="text-danger hover:bg-danger-soft"
              disabled={bulkPending}
              onClick={() => setConfirmBulkDelete(true)}
            >
              <Trash2 /> Delete
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
            <X /> Clear
          </Button>
        </div>
      )}

      {mode === "board" ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {PATIENT_STATUSES.map((status) => {
            const col = byStatus.get(status) ?? [];
            const collapsed = colToggles[status] ?? col.length === 0;
            return (
              <div key={status} className="flex flex-col gap-2">
                <button
                  className="flex w-full cursor-pointer items-center justify-between px-1"
                  onClick={() => setColToggles((t) => ({ ...t, [status]: !collapsed }))}
                >
                  <span className="flex items-center gap-1">
                    {collapsed ? (
                      <ChevronRight className="size-3.5 text-muted-light" />
                    ) : (
                      <ChevronDown className="size-3.5 text-muted-light" />
                    )}
                    <Badge tone={PATIENT_STATUS_TONE[status]}>{PATIENT_STATUS_LABEL[status]}</Badge>
                  </span>
                  <span className="text-xs font-medium text-muted-light">{col.length}</span>
                </button>
                <div
                  className={cn(
                    "flex min-h-24 flex-col gap-2 rounded-xl bg-surface-hover/50 p-2",
                    collapsed && "hidden"
                  )}
                >
                  {col.map((p) => (
                    <div
                      key={p.id}
                      className="hover-lift rounded-lg border border-border bg-surface p-3 shadow-card"
                    >
                      <Link
                        href={`/patients/${p.id}`}
                        className="block text-sm font-medium hover:text-primary"
                      >
                        {p.full_name}
                      </Link>
                      <p className="mt-0.5 truncate text-xs text-muted">
                        {p.countries?.name ?? "—"} · {p.profiles?.name ?? "Unassigned"}
                      </p>
                      <Select
                        className="mt-2 h-7 text-xs shadow-none"
                        value={p.status}
                        onChange={(e) => onStatusChange(p, e.target.value as PatientStatus)}
                      >
                        {PATIENT_STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {PATIENT_STATUS_LABEL[s]}
                          </option>
                        ))}
                      </Select>
                    </div>
                  ))}
                  {col.length === 0 && (
                    <p className="py-4 text-center text-xs text-muted-light">Empty</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <Table>
          <THead>
            <tr>
              <Th className="w-8">
                <input
                  type="checkbox"
                  aria-label="Select all on page"
                  checked={allSelected}
                  onChange={() =>
                    setSelected(allSelected ? new Set() : new Set(effective.map((p) => p.id)))
                  }
                  className="size-3.5 cursor-pointer accent-[var(--color-primary)]"
                />
              </Th>
              <Th>Name</Th>
              <Th>Status</Th>
              <Th>Country</Th>
              <Th>Contact</Th>
              <Th>Source</Th>
              <Th>Agent</Th>
              <Th>Created</Th>
            </tr>
          </THead>
          <TBody>
            {effective.length === 0 && <EmptyRow colSpan={8} message="No patients found." />}
            {effective.map((p) => (
              <Tr key={p.id}>
                <Td>
                  <input
                    type="checkbox"
                    aria-label={`Select ${p.full_name}`}
                    checked={selected.has(p.id)}
                    onChange={() => toggleSelect(p.id)}
                    className="size-3.5 cursor-pointer accent-[var(--color-primary)]"
                  />
                </Td>
                <Td className="font-medium">
                  <Link href={`/patients/${p.id}`} className="hover:text-primary">
                    {p.full_name}
                  </Link>
                </Td>
                <Td>
                  <StatusBadge status={p.status} />
                </Td>
                <Td className="text-muted">{p.countries?.name ?? "—"}</Td>
                <Td className="text-muted">
                  <span className="inline-flex items-center gap-1.5">
                    {p.email || p.phone || "—"}
                    {waLink(p.phone) && (
                      <a
                        href={waLink(p.phone)!}
                        target="_blank"
                        rel="noreferrer"
                        aria-label="Message on WhatsApp"
                        className="text-success hover:opacity-70"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <MessageCircle className="size-3.5" />
                      </a>
                    )}
                  </span>
                </Td>
                <Td className="text-muted">{p.source || "—"}</Td>
                <Td className="text-muted">{p.profiles?.name ?? "—"}</Td>
                <Td className="text-muted">{formatDate(p.created_at)}</Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      )}

      {total > pageSize && (
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-muted">
            Showing {rangeStart}–{rangeEnd} of {total}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              disabled={page <= 1}
              onClick={() => setParams({ page: String(page - 1) }, false)}
            >
              <ChevronLeft /> Previous
            </Button>
            <span className="text-xs font-medium text-muted">
              Page {page} of {totalPages}
            </span>
            <Button
              variant="secondary"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setParams({ page: String(page + 1) }, false)}
            >
              Next <ChevronRight />
            </Button>
          </div>
        </div>
      )}

      <PatientFormDialog
        open={formOpen}
        onClose={() => setFormOpen(false)}
        patient={editing}
        countries={countries}
        agents={agents}
        currentUserId={currentUserId}
        caseDirectories={caseDirectories}
        isAdmin={isAdmin}
        optimistic={{
          insert: (row) => setLivePatients((prev) => [row, ...prev]),
          replace: (id, row) => setLivePatients((prev) => prev.map((p) => (p.id === id ? row : p))),
          remove: (id) => setLivePatients((prev) => prev.filter((p) => p.id !== id)),
        }}
      />

      <ConfirmDialog
        open={confirmBulkDelete}
        onClose={() => setConfirmBulkDelete(false)}
        onConfirm={onBulkDelete}
        pending={bulkPending}
        title={`Delete ${selected.size} patient${selected.size === 1 ? "" : "s"}`}
        description={
          <>
            This permanently deletes the selected patients along with their cases, payments and
            files. This cannot be undone.
          </>
        }
      />
    </div>
  );
}
