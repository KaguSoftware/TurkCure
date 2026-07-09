"use client";

import * as React from "react";
import Link from "next/link";
import { Kanban, List, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Table, THead, TBody, Tr, Th, Td, EmptyRow } from "@/components/ui/table";
import { StatusBadge, PATIENT_STATUS_LABEL, PATIENT_STATUS_TONE, Badge } from "@/components/ui/badge";
import { PatientFormDialog } from "./patient-form";
import { setPatientStatus } from "@/lib/actions/patients";
import { PATIENT_STATUSES, type Patient, type PatientStatus } from "@/lib/types";
import { cn, formatDate } from "@/lib/utils";

export function PatientsView({
  patients,
  countries,
  agents,
  currentUserId,
}: {
  patients: Patient[];
  countries: { id: string; name: string }[];
  agents: { id: string; name: string }[];
  currentUserId: string;
}) {
  const [mode, setMode] = React.useState<"board" | "table">("board");
  const [query, setQuery] = React.useState("");
  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Patient | null>(null);

  const filtered = query
    ? patients.filter((p) =>
        [p.full_name, p.email, p.phone, p.countries?.name]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(query.toLowerCase()))
      )
    : patients;

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

      {mode === "board" ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {PATIENT_STATUSES.map((status) => {
            const col = filtered.filter((p) => p.status === status);
            return (
              <div key={status} className="flex flex-col gap-2">
                <div className="flex items-center justify-between px-1">
                  <Badge tone={PATIENT_STATUS_TONE[status]}>{PATIENT_STATUS_LABEL[status]}</Badge>
                  <span className="text-xs font-medium text-muted-light">{col.length}</span>
                </div>
                <div className="flex min-h-24 flex-col gap-2 rounded-xl bg-surface-hover/50 p-2">
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
                        onChange={(e) => setPatientStatus(p.id, e.target.value as PatientStatus)}
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
      />
    </div>
  );
}
