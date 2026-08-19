"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  CalendarPlus,
  CheckCircle2,
  FileDown,
  FileText,
  Pencil,
  PlusCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge, Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { TabBar, TabPanel } from "@/components/ui/tabs";
import { toast } from "@/components/ui/toast";
import { useAction } from "@/lib/use-action";
import { syncCaseReminders } from "@/lib/actions/cases";
import { cn, formatDate, formatMoney, waLink } from "@/lib/utils";
import { MessageCircle } from "lucide-react";
import type {
  Case,
  CaseAdditionalCost,
  CaseInstruction,
  Patient,
  PatientFile,
  Payment,
  QuoteItem,
} from "@/lib/types";
import { PatientFormDialog } from "./patient-form";
import { CombinedPdfDialog } from "./combined-pdf-dialog";
import { CaseTab } from "./case-tab";
import { MoneyTab } from "./money/money-tab";
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

const TABS = ["Case", "Money", "Instructions", "Files"] as const;

// Old deep links keep working: the quote moved from "Case & Quote" into the
// Money tab (which also absorbed "Payments") in the 2026-08 money rebuild.
const LEGACY_TABS: Record<string, (typeof TABS)[number]> = {
  "Case & Quote": "Case",
  Payments: "Money",
};

export function PatientDetail({
  patient,
  cases,
  quoteItemsByCase,
  additionalCostsByCase,
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
  additionalCostsByCase: Record<string, CaseAdditionalCost[]>;
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
    : LEGACY_TABS[urlTab ?? ""] ?? "Case";
  const setParam = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set(key, value);
    router.replace(`${pathname}?${params}`, { scroll: false });
  };
  const setTab = (t: (typeof TABS)[number]) => setParam("tab", t);
  const [editOpen, setEditOpen] = React.useState(false);
  const [combinedOpen, setCombinedOpen] = React.useState(false);
  const [confirmSync, setConfirmSync] = React.useState(false);
  const syncing = useAction();
  // Which case is being viewed; "new" shows an empty create form for a repeat visit.
  const urlCase = searchParams.get("case");
  const selectedCaseId: string | "new" =
    urlCase === "new" || cases.some((c) => c.id === urlCase)
      ? (urlCase as string)
      : cases[0]?.id ?? "new";
  const setSelectedCaseId = (id: string | "new") => setParam("case", id);
  // After a delete the id in the URL points at a case that no longer exists;
  // drop the param entirely so the fallback picks the next remaining case.
  const clearSelectedCase = () => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("case");
    router.replace(params.size ? `${pathname}?${params}` : pathname, { scroll: false });
  };
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
  // Paid = incoming payments with a paid date, normalized to the case currency
  // at each row's stored rate (same basis as the reconciliation in the Payments
  // tab). Off-currency payments used to be dropped here and under-report.
  const paidTotal = activeCase
    ? casePayments
        .filter((p) => p.direction === "in" && p.paid_at)
        .reduce((s, p) => s + Number(p.amount_case ?? p.amount), 0)
    : 0;
  const outstanding = totalPrice - paidTotal;
  // Extras are excluded from the quoted/due figures on purpose (0020, and the
  // PDF's balance works the same way) — but the chip shouldn't hide that they
  // exist, so they get a muted suffix.
  const extrasTotal = activeCase
    ? (additionalCostsByCase[activeCase.id] ?? []).reduce((s, c) => s + Number(c.amount), 0)
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
                  {extrasTotal > 0 && (
                    <span className="text-xs font-normal text-muted-light">
                      + {formatMoney(extrasTotal, activeCase.currency)} extras
                    </span>
                  )}
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
            {/* Opens the editable copy. The plain download above keeps working
                and bypasses the editor entirely, so nothing changes for a case
                nobody edits. */}
            {activeCase && (
              <Link href={`/patients/${patient.id}/document/${activeCase.id}`}>
                <Button variant="secondary">
                  <FileText /> Edit document
                </Button>
              </Link>
            )}
            {/* Only worth offering once there's more than one case to combine. */}
            {cases.length > 1 && (
              <Button variant="secondary" onClick={() => setCombinedOpen(true)}>
                <FileDown /> Combined PDF
              </Button>
            )}
            {caseCompleted && (
              <Badge tone="green" className="gap-1 px-3 py-1.5">
                <CheckCircle2 className="size-3.5" /> Completed
              </Badge>
            )}
            {activeCase && (
              <Button onClick={() => setConfirmSync(true)}>
                <CalendarPlus /> Add dates to reminders
              </Button>
            )}
            <Button variant="secondary" onClick={() => setEditOpen(true)}>
              <Pencil /> Edit
            </Button>
          </div>
        </div>
        {/* Trimmed: a whitespace-only note rendered as an empty grey bar. */}
        {patient.notes?.trim() && (
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
        {tab === "Case" && (
          <CaseTab
            patient={patient}
            activeCase={activeCase}
            isAdmin={isAdmin}
            directories={directories}
            onCaseCreated={(id) => setSelectedCaseId(id)}
            onCaseDeleted={clearSelectedCase}
          />
        )}
        {tab === "Money" && (
          <MoneyTab
            patient={patient}
            activeCase={activeCase}
            quoteItems={activeCase ? quoteItemsByCase[activeCase.id] ?? [] : []}
            additionalCosts={activeCase ? additionalCostsByCase[activeCase.id] ?? [] : []}
            payments={casePayments}
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

      <CombinedPdfDialog
        open={combinedOpen}
        onClose={() => setCombinedOpen(false)}
        cases={cases}
      />

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
        open={confirmSync}
        onClose={() => setConfirmSync(false)}
        onConfirm={async () => {
          if (!activeCase) return;
          // The message depends on how many dates were actually set, so it's
          // raised from onSuccess rather than useAction's static `success`.
          const { ok } = await syncing.run(syncCaseReminders(patient.id, activeCase.id), {
            onSuccess: (r) =>
              toast.success(
                r?.count
                  ? `${r.count} reminder${r.count === 1 ? "" : "s"} added to the dashboard.`
                  : "No dates set on this case yet — nothing to add."
              ),
          });
          if (ok) setConfirmSync(false);
        }}
        pending={syncing.pending}
        title="Add dates to reminders"
        confirmLabel="Add to reminders"
        description={
          <>
            Creates a dashboard reminder for every date on this case — arrival, hospital check-in,
            operation, hospital check-out, departure, and the 1-week and 1-month aftercare
            check-ins. Re-runs cleanly: it replaces the previously generated ones and leaves your
            own reminders, and anything already ticked off, alone.
          </>
        }
      />
    </div>
  );
}
