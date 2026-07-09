"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeft, FileDown, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";
import { cn, formatDate, formatMoney } from "@/lib/utils";
import type {
  Case,
  CaseInstruction,
  Patient,
  PatientFile,
  Payment,
  QuoteItem,
} from "@/lib/types";
import { PatientFormDialog } from "./patient-form";
import { CaseTab } from "./case-tab";
import { PaymentsTab } from "./payments-tab";
import { InstructionsTab } from "./instructions-tab";
import { FilesTab } from "./files-tab";

export interface Directories {
  countries: { id: string; name: string }[];
  agents: { id: string; name: string }[];
  doctors: { id: string; name: string }[];
  hospitals: { id: string; name: string }[];
  hotels: { id: string; name: string }[];
  drivers: { id: string; name: string }[];
  operationTypes: { id: string; name: string }[];
  templates: { id: string; title: string }[];
}

const TABS = ["Case & Quote", "Payments", "Instructions", "Files"] as const;

export function PatientDetail({
  patient,
  cases,
  quoteItemsByCase,
  payments,
  instructions,
  files,
  isAdmin,
  currentUserId,
  directories,
}: {
  patient: Patient;
  cases: Case[];
  quoteItemsByCase: Record<string, QuoteItem[]>;
  payments: Payment[];
  instructions: CaseInstruction[];
  files: PatientFile[];
  isAdmin: boolean;
  currentUserId: string;
  directories: Directories;
}) {
  const [tab, setTab] = React.useState<(typeof TABS)[number]>("Case & Quote");
  const [editOpen, setEditOpen] = React.useState(false);
  const activeCase = cases[0] ?? null;
  const totalPrice = activeCase
    ? (quoteItemsByCase[activeCase.id] ?? []).reduce((s, i) => s + Number(i.price), 0)
    : 0;
  const caseCompleted = activeCase?.status === "completed";

  return (
    <div className="space-y-5">
      <div>
        <Link
          href="/patients"
          className="mb-3 inline-flex items-center gap-1 text-xs text-muted hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" /> All patients
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight">{patient.full_name}</h1>
              <StatusBadge status={patient.status} />
              {activeCase && totalPrice > 0 && (
                <span className="rounded-full bg-success-soft px-3 py-1 text-sm font-semibold text-success">
                  {formatMoney(totalPrice, activeCase.currency)}
                </span>
              )}
            </div>
            <p className="mt-1 text-sm text-muted">
              {[patient.countries?.name, patient.email, patient.phone, patient.source]
                .filter(Boolean)
                .join(" · ") || "No contact details yet"}
            </p>
            <p className="mt-0.5 text-xs text-muted-light">
              Agent: {patient.profiles?.name ?? "Unassigned"} · Added {formatDate(patient.created_at)}
            </p>
          </div>
          <div className="flex gap-2">
            {activeCase && (
              <a href={`/api/pdf/${activeCase.id}`} target="_blank" rel="noreferrer">
                <Button variant={caseCompleted ? "primary" : "secondary"}>
                  <FileDown /> {caseCompleted ? "Create Patient PDF" : "Patient PDF"}
                </Button>
              </a>
            )}
            <Button variant="secondary" onClick={() => setEditOpen(true)}>
              <Pencil /> Edit
            </Button>
          </div>
        </div>
        {patient.notes && (
          <p className="mt-3 max-w-2xl rounded-lg bg-surface-hover px-3 py-2 text-sm text-muted">
            {patient.notes}
          </p>
        )}
      </div>

      <div className="flex gap-1 border-b border-border">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "-mb-px border-b-2 px-4 py-2.5 text-sm font-medium transition-colors cursor-pointer",
              tab === t
                ? "border-primary text-primary"
                : "border-transparent text-muted hover:text-foreground"
            )}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "Case & Quote" && (
        <CaseTab
          patient={patient}
          cases={cases}
          quoteItemsByCase={quoteItemsByCase}
          isAdmin={isAdmin}
          directories={directories}
        />
      )}
      {tab === "Payments" && (
        <PaymentsTab
          patient={patient}
          cases={cases}
          payments={payments}
          isAdmin={isAdmin}
          directories={directories}
        />
      )}
      {tab === "Instructions" && (
        <InstructionsTab
          patient={patient}
          cases={cases}
          instructions={instructions}
          templates={directories.templates}
        />
      )}
      {tab === "Files" && (
        <FilesTab patient={patient} files={files} currentUserId={currentUserId} />
      )}

      <PatientFormDialog
        open={editOpen}
        onClose={() => setEditOpen(false)}
        patient={patient}
        countries={directories.countries}
        agents={directories.agents}
        currentUserId={currentUserId}
      />
    </div>
  );
}
