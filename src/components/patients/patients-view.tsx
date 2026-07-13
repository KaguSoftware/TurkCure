"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  Kanban,
  List,
  Loader2,
  Maximize2,
  MessageCircle,
  Minimize2,
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
  getPatientsByStatus,
} from "@/lib/actions/patients";
import { toast } from "@/components/ui/toast";
import { useOptimisticList } from "@/lib/use-optimistic-list";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { usePresence } from "@/lib/use-presence";
import { useFocusTrap } from "@/lib/use-focus-trap";
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
  // Patient ids with an in-flight status change, so the card select shows it's saving.
  const [statusPending, setStatusPending] = React.useState<ReadonlySet<string>>(new Set());
  // View mode is a UI preference, not content — keep it as local state so the
  // toggle is instant (no URL change, no server round-trip).
  const [mode, setMode] = React.useState<"board" | "table">("board");
  // "Maximize" a board column is local state (no URL) that plays a screen-takeover
  // animation growing from the clicked column, then fetches that status's full set.
  const [maximized, setMaximized] = React.useState<PatientStatus | null>(null);
  const [origin, setOrigin] = React.useState("50% 50%");
  const [takeoverData, setTakeoverData] = React.useState<Patient[] | null>(null);
  const [takeoverLoading, setTakeoverLoading] = React.useState(false);
  const takeover = usePresence(maximized !== null, 320);
  const takeoverRef = React.useRef<HTMLDivElement>(null);
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
      setStatusPending((s) => new Set(s).add(p.id));
      const result = await setPatientStatus(p.id, status);
      setStatusPending((s) => {
        const next = new Set(s);
        next.delete(p.id);
        return next;
      });
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

  // Open the maximize takeover for a status, growing from `originStr` (the clicked
  // column's centre; defaults to screen centre when opened from the dashboard).
  const openMaximized = React.useCallback((status: PatientStatus, originStr?: string) => {
    setOrigin(originStr ?? "50% 50%");
    setMaximized(status);
  }, []);

  // Fetch the full (up-to-50) set for the focused status once the takeover opens.
  React.useEffect(() => {
    if (!maximized) return;
    let cancelled = false;
    setTakeoverLoading(true);
    getPatientsByStatus(maximized).then((res) => {
      if (cancelled) return;
      setTakeoverLoading(false);
      if (res.error) toast.error(`Couldn't load ${PATIENT_STATUS_LABEL[maximized]}: ${res.error}`);
      else if (res.patients) setTakeoverData(res.patients);
    });
    return () => {
      cancelled = true;
    };
  }, [maximized]);

  // Esc-to-close + body scroll lock while the takeover is open.
  React.useEffect(() => {
    if (!maximized) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMaximized(null);
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [maximized]);

  // Reset the fetched set after the exit animation so the next open re-seeds/fetches.
  React.useEffect(() => {
    if (!takeover.mounted) setTakeoverData(null);
  }, [takeover.mounted]);

  useFocusTrap(takeoverRef, maximized !== null && takeover.mounted);

  // Dashboard status cards deep-link via a throwaway ?focus=<status>: open the
  // takeover from centre on landing, then strip the param so the URL is clean.
  const focusHandled = React.useRef(false);
  React.useEffect(() => {
    if (focusHandled.current) return;
    const focus = searchParams.get("focus");
    if (focus && PATIENT_STATUSES.includes(focus as PatientStatus)) {
      focusHandled.current = true;
      openMaximized(focus as PatientStatus);
      setParams({ focus: null }, false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cards shown in the takeover: fetched set (accurate) or the board seed until it
  // lands, with optimistic status overrides applied and non-matching cards dropped.
  const takeoverCards = React.useMemo(() => {
    if (!maximized) return [];
    const seed = takeoverData ?? byStatus.get(maximized) ?? [];
    return seed
      .map((p) => (statusOverrides[p.id] ? { ...p, status: statusOverrides[p.id] } : p))
      .filter((p) => p.status === maximized);
  }, [maximized, takeoverData, byStatus, statusOverrides]);

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
            aria-label="Search patients"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9"
          />
          {query !== urlQuery && (
            <Loader2 className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-light" />
          )}
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
              <div key={status} data-col className="flex flex-col gap-2">
                {/* Header is a div (not a button) so the collapse and maximize
                    controls can be sibling buttons — no nested interactives. */}
                <div className="flex w-full items-center justify-between gap-1 px-1">
                  <button
                    className="flex flex-1 cursor-pointer items-center gap-1"
                    aria-expanded={!collapsed}
                    onClick={() => setColToggles((t) => ({ ...t, [status]: !collapsed }))}
                  >
                    {collapsed ? (
                      <ChevronRight className="size-3.5 text-muted-light" />
                    ) : (
                      <ChevronDown className="size-3.5 text-muted-light" />
                    )}
                    <Badge tone={PATIENT_STATUS_TONE[status]}>{PATIENT_STATUS_LABEL[status]}</Badge>
                    <span className="ml-auto text-xs font-medium text-muted-light">
                      {col.length}
                    </span>
                  </button>
                  <button
                    className="pressable shrink-0 rounded p-0.5 text-muted-light hover:text-primary cursor-pointer"
                    aria-label={`Maximize ${PATIENT_STATUS_LABEL[status]} column`}
                    onClick={(e) => {
                      const el = (e.currentTarget as HTMLElement).closest("[data-col]");
                      const r = el?.getBoundingClientRect();
                      openMaximized(
                        status,
                        r ? `${r.left + r.width / 2}px ${r.top + r.height / 2}px` : undefined
                      );
                    }}
                  >
                    <Maximize2 className="size-3.5" />
                  </button>
                </div>
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
                      <div className="relative mt-2">
                        <Select
                          className="h-7 text-xs shadow-none"
                          value={p.status}
                          disabled={statusPending.has(p.id)}
                          onChange={(e) => onStatusChange(p, e.target.value as PatientStatus)}
                        >
                          {PATIENT_STATUSES.map((s) => (
                            <option key={s} value={s}>
                              {PATIENT_STATUS_LABEL[s]}
                            </option>
                          ))}
                        </Select>
                        {statusPending.has(p.id) && (
                          <Loader2 className="pointer-events-none absolute right-7 top-1/2 size-3.5 -translate-y-1/2 animate-spin text-muted" />
                        )}
                      </div>
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

      {takeover.mounted &&
        maximized &&
        createPortal(
          <div className="fixed inset-0 z-50">
            <div
              className={cn(
                "animate-overlay absolute inset-0 bg-black/40 backdrop-blur-[2px]",
                takeover.closing && "animate-overlay-out"
              )}
              onClick={() => setMaximized(null)}
            />
            <div
              ref={takeoverRef}
              role="dialog"
              aria-modal="true"
              aria-label={`${PATIENT_STATUS_LABEL[maximized]} patients`}
              style={{ transformOrigin: origin }}
              className={cn(
                "absolute inset-3 flex flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-pop sm:inset-8",
                takeover.closing ? "animate-takeover-out" : "animate-takeover"
              )}
            >
              <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-3.5">
                <div className="flex items-center gap-2">
                  <Badge tone={PATIENT_STATUS_TONE[maximized]}>
                    {PATIENT_STATUS_LABEL[maximized]}
                  </Badge>
                  <span className="text-sm text-muted">
                    {takeoverLoading ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <>
                        {takeoverCards.length} patient{takeoverCards.length === 1 ? "" : "s"}
                      </>
                    )}
                  </span>
                </div>
                <Button variant="secondary" size="sm" onClick={() => setMaximized(null)}>
                  <Minimize2 /> Close
                </Button>
              </div>
              <div className="flex-1 overflow-y-auto p-4">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {takeoverCards.map((p) => (
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
                      <div className="relative mt-2">
                        <Select
                          className="h-7 text-xs shadow-none"
                          value={p.status}
                          disabled={statusPending.has(p.id)}
                          onChange={(e) => onStatusChange(p, e.target.value as PatientStatus)}
                        >
                          {PATIENT_STATUSES.map((s) => (
                            <option key={s} value={s}>
                              {PATIENT_STATUS_LABEL[s]}
                            </option>
                          ))}
                        </Select>
                        {statusPending.has(p.id) && (
                          <Loader2 className="pointer-events-none absolute right-7 top-1/2 size-3.5 -translate-y-1/2 animate-spin text-muted" />
                        )}
                      </div>
                    </div>
                  ))}
                  {!takeoverLoading && takeoverCards.length === 0 && (
                    <p className="col-span-full py-16 text-center text-sm text-muted-light">
                      No patients in this status.
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
