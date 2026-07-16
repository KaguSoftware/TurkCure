"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { ArrowLeft, CheckCircle2, FileDown, Pencil, PlusCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge, Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { TabBar, TabPanel } from "@/components/ui/tabs";
import { useAction } from "@/lib/use-action";
import { completeCase } from "@/lib/actions/cases";
import { cn, formatDate, formatMoney, waLink } from "@/lib/utils";
import { MessageCircle } from "lucide-react";
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
  // Tab and selected case live in the URL (?tab=, ?case=) so links, refresh, and
  // the back button all land on the same view.
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const urlTab = searchParams.get("tab");
  const tab: (typeof TABS)[number] = (TABS as readonly string[]).includes(urlTab ?? "")
    ? (urlTab as (typeof TABS)[number])
    : "Case & Quote";
  const setParam = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set(key, value);
    router.replace(`${pathname}?${params}`, { scroll: false });
  };
  const setTab = (t: (typeof TABS)[number]) => setParam("tab", t);
  const [editOpen, setEditOpen] = React.useState(false);
  const [confirmDone, setConfirmDone] = React.useState(false);
  const complete = useAction();
  // Which case is being viewed; "new" shows an empty create form for a repeat visit.
  const urlCase = searchParams.get("case");
  const selectedCaseId: string | "new" =
    urlCase === "new" || cases.some((c) => c.id === urlCase)
      ? (urlCase as string)
      : cases[0]?.id ?? "new";
  const setSelectedCaseId = (id: string | "new") => setParam("case", id);
  const activeCase =
    selectedCaseId === "new" ? null : cases.find((c) => c.id === selectedCaseId) ?? cases[0] ?? null;
  // Payments/instructions shown belong to the case being viewed.
  const casePayments = activeCase ? payments.filter((p) => p.case_id === activeCase.id) : [];
  const caseInstructions = activeCase
    ? instructions.filter((i) => i.case_id === activeCase.id)
    : [];
  const totalPrice = activeCase
    ? (quoteItemsByCase[activeCase.id] ?? []).reduce((s, i) => s + Number(i.price), 0)
    : 0;
  // Paid = incoming payments with a paid date, in the case currency (same basis
  // as the reconciliation in the Payments tab).
  const paidTotal = activeCase
    ? casePayments
        .filter(
          (p) =>
            p.direction === "in" && p.paid_at && p.currency === activeCase.currency
        )
        .reduce((s, p) => s + Number(p.amount), 0)
    : 0;
  const outstanding = totalPrice - paidTotal;
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
                <span className="inline-flex items-center gap-2 rounded-full bg-surface-hover px-3 py-1 text-sm font-semibold">
                  <span>{formatMoney(totalPrice, activeCase.currency)}</span>
                  <span className="text-xs font-normal text-muted-light">quoted</span>
                  <span
                    className={
                      "text-xs font-medium " +
                      (outstanding <= 0 ? "text-success" : "text-warning")
                    }
                  >
                    {outstanding <= 0
                      ? "Paid in full"
                      : `${formatMoney(outstanding, activeCase.currency)} due`}
                  </span>
                </span>
              )}
            </div>
            <p className="mt-1 flex flex-wrap items-center gap-x-1.5 text-sm text-muted">
              <span>
                {[patient.countries?.name, patient.email, patient.phone, patient.source]
                  .filter(Boolean)
                  .join(" · ") || "No contact details yet"}
              </span>
              {waLink(patient.phone) && (
                <a
                  href={waLink(patient.phone)!}
                  target="_blank"
                  rel="noreferrer"
                  aria-label="Message on WhatsApp"
                  className="inline-flex items-center gap-1 rounded-full bg-success-soft px-2 py-0.5 text-xs font-medium text-success hover:opacity-80"
                >
                  <MessageCircle className="size-3.5" /> WhatsApp
                </a>
              )}
            </p>
            <p className="mt-0.5 text-xs text-muted-light">
              Agent: {patient.profiles?.name ?? "Unassigned"} · Added {formatDate(patient.created_at)}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {activeCase && (
              <a href={`/api/pdf/${activeCase.id}`} download>
                <Button variant="secondary">
                  <FileDown /> Download PDF
                </Button>
              </a>
            )}
            {activeCase &&
              (caseCompleted ? (
                <Badge tone="green" className="gap-1 px-3 py-1.5">
                  <CheckCircle2 className="size-3.5" /> Completed
                </Badge>
              ) : (
                <Button onClick={() => setConfirmDone(true)}>
                  <CheckCircle2 /> Done
                </Button>
              ))}
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

      {cases.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium uppercase tracking-wider text-muted-light">
            Cases
          </span>
          {cases.map((c) => {
            const label = c.operation_types?.name ?? "Case";
            const when = c.arrival_date ? formatDate(c.arrival_date) : null;
            const active = activeCase?.id === c.id;
            return (
              <button
                key={c.id}
                onClick={() => setSelectedCaseId(c.id)}
                className={cn(
                  "pressable flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium cursor-pointer",
                  active
                    ? "border-primary bg-primary-soft text-primary"
                    : "border-border text-muted hover:border-border-strong hover:text-foreground"
                )}
              >
                {label}
                {when && <span className={active ? "opacity-70" : "text-muted-light"}>{when}</span>}
                {c.status === "completed" && <CheckCircle2 className="size-3.5 text-success" />}
              </button>
            );
          })}
          <button
            onClick={() => setSelectedCaseId("new")}
            className={cn(
              "pressable flex items-center gap-1 rounded-full border border-dashed px-3 py-1.5 text-xs font-medium cursor-pointer",
              selectedCaseId === "new"
                ? "border-primary bg-primary-soft text-primary"
                : "border-border-strong text-muted hover:text-foreground"
            )}
          >
            <PlusCircle className="size-3.5" /> New case
          </button>
        </div>
      )}

      <TabBar idBase="patient" tabs={TABS} value={tab} onChange={setTab} />

      <TabPanel idBase="patient" index={TABS.indexOf(tab)}>
        {tab === "Case & Quote" && (
          <CaseTab
            patient={patient}
            activeCase={activeCase}
            quoteItemsByCase={quoteItemsByCase}
            isAdmin={isAdmin}
            directories={directories}
            onCaseCreated={(id) => setSelectedCaseId(id)}
          />
        )}
        {tab === "Payments" && (
          <PaymentsTab
            patient={patient}
            cases={activeCase ? [activeCase] : []}
            payments={casePayments}
            quotedTotal={totalPrice}
            isAdmin={isAdmin}
            directories={directories}
          />
        )}
        {tab === "Instructions" && (
          <InstructionsTab
            patient={patient}
            cases={activeCase ? [activeCase] : []}
            instructions={caseInstructions}
            templates={directories.templates}
          />
        )}
        {tab === "Files" && (
          <FilesTab patient={patient} files={files} currentUserId={currentUserId} />
        )}
      </TabPanel>

      <PatientFormDialog
        open={editOpen}
        onClose={() => setEditOpen(false)}
        patient={patient}
        countries={directories.countries}
        agents={directories.agents}
        currentUserId={currentUserId}
        isAdmin={isAdmin}
      />

      <ConfirmDialog
        open={confirmDone}
        onClose={() => setConfirmDone(false)}
        onConfirm={async () => {
          if (!activeCase) return;
          const { ok } = await complete.run(completeCase(patient.id, activeCase.id), {
            success: "Case marked as completed.",
          });
          if (ok) setConfirmDone(false);
        }}
        pending={complete.pending}
        title="Mark case as completed"
        confirmLabel="Mark as done"
        description={
          <>
            This sets the case status to <strong>Completed</strong> and refreshes the arrival,
            operation and aftercare reminders on the dashboard. Downloading the PDF does not require
            this.
          </>
        }
      />
    </div>
  );
}
