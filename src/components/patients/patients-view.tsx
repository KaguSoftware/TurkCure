"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight, Kanban, List, Plus, Search, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Table, THead, TBody, Tr, Th, Td, EmptyRow } from "@/components/ui/table";
import { StatusBadge, PATIENT_STATUS_LABEL, PATIENT_STATUS_TONE, Badge } from "@/components/ui/badge";
import { PatientFormDialog } from "./patient-form";
import { setPatientStatus } from "@/lib/actions/patients";
import { toast } from "@/components/ui/toast";
import { useRouter } from "next/navigation";
import { PATIENT_STATUSES, type Patient, type PatientStatus } from "@/lib/types";
import { cn, formatDate } from "@/lib/utils";

export function PatientsView({
  patients,
  countries,
  agents,
  currentUserId,
  caseDirectories,
  isAdmin = false,
}: {
  patients: Patient[];
  countries: { id: string; name: string }[];
  agents: { id: string; name: string }[];
  currentUserId: string;
  caseDirectories: import("./patient-form").CaseDirectories;
  isAdmin?: boolean;
}) {
  const router = useRouter();
  // Optimistic status overrides so the board moves cards instantly.
  const [statusOverrides, setStatusOverrides] = React.useState<Record<string, PatientStatus>>({});
  const [mode, setMode] = React.useState<"board" | "table">("board");
  const [query, setQuery] = React.useState("");
  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Patient | null>(null);
  const [showFilters, setShowFilters] = React.useState(false);
  const [statusFilter, setStatusFilter] = React.useState("all");
  const [agentFilter, setAgentFilter] = React.useState("all");
  const [countryFilter, setCountryFilter] = React.useState("all");
  // Manual column collapse state; empty columns auto-collapse unless toggled open
  const [colToggles, setColToggles] = React.useState<Record<string, boolean>>({});

  const effective = patients.map((p) =>
    statusOverrides[p.id] ? { ...p, status: statusOverrides[p.id] } : p
  );

  async function onStatusChange(p: Patient, status: PatientStatus) {
    const prev = p.status;
    setStatusOverrides((o) => ({ ...o, [p.id]: status }));
    const result = await setPatientStatus(p.id, status);
    if (result.error) {
      setStatusOverrides((o) => ({ ...o, [p.id]: prev }));
      toast.error(`Could not update status: ${result.error}`);
    } else {
      toast.success(`${p.full_name} moved to ${PATIENT_STATUS_LABEL[status]}.`);
      router.refresh();
    }
  }

  const filtered = effective.filter((p) => {
    if (statusFilter !== "all" && p.status !== statusFilter) return false;
    if (agentFilter !== "all" && p.assigned_agent_id !== agentFilter) return false;
    if (countryFilter !== "all" && p.country_id !== countryFilter) return false;
    if (!query) return true;
    return [p.full_name, p.email, p.phone, p.countries?.name]
      .filter(Boolean)
      .some((v) => String(v).toLowerCase().includes(query.toLowerCase()));
  });

  const filtersActive =
    statusFilter !== "all" || agentFilter !== "all" || countryFilter !== "all";

  function openNew() {
    setEditing(null);
    setFormOpen(true);
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
        <div className="flex items-center gap-2">
          <Button
            variant={showFilters || filtersActive ? "soft" : "secondary"}
            size="sm"
            onClick={() => setShowFilters((s) => !s)}
          >
            <SlidersHorizontal /> Filters
          </Button>
          <div className="flex rounded-lg border border-border bg-surface p-0.5 shadow-card">
            <button
              onClick={() => setMode("board")}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium cursor-pointer",
                mode === "board" ? "bg-primary-soft text-primary" : "text-muted"
              )}
            >
              <Kanban className="size-3.5" /> Board
            </button>
            <button
              onClick={() => setMode("table")}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium cursor-pointer",
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

      {showFilters && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-surface p-3 shadow-card">
          <Select
            className="w-40"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
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
            onChange={(e) => setAgentFilter(e.target.value)}
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
            onChange={(e) => setCountryFilter(e.target.value)}
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
              onClick={() => {
                setStatusFilter("all");
                setAgentFilter("all");
                setCountryFilter("all");
              }}
            >
              Clear
            </Button>
          )}
        </div>
      )}

      {mode === "board" ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {PATIENT_STATUSES.map((status) => {
            const col = filtered.filter((p) => p.status === status);
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
                      className="rounded-lg border border-border bg-surface p-3 shadow-card transition-shadow hover:shadow-pop"
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
            {filtered.length === 0 && <EmptyRow colSpan={7} message="No patients found." />}
            {filtered.map((p) => (
              <Tr key={p.id}>
                <Td className="font-medium">
                  <Link href={`/patients/${p.id}`} className="hover:text-primary">
                    {p.full_name}
                  </Link>
                </Td>
                <Td>
                  <StatusBadge status={p.status} />
                </Td>
                <Td className="text-muted">{p.countries?.name ?? "—"}</Td>
                <Td className="text-muted">{p.email || p.phone || "—"}</Td>
                <Td className="text-muted">{p.source || "—"}</Td>
                <Td className="text-muted">{p.profiles?.name ?? "—"}</Td>
                <Td className="text-muted">{formatDate(p.created_at)}</Td>
              </Tr>
            ))}
          </TBody>
        </Table>
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
      />
    </div>
  );
}
