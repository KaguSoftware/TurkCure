"use client";

import * as React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatMoney, cn } from "@/lib/utils";

/** Per-case row from finance_case_rows(), camelCased and display-ready. */
export interface CaseFinance {
  id: string;
  patientId: string;
  patientName: string;
  operation: string;
  currency: string;
  status: string;
  month: string; // YYYY-MM (surgery month, falling back to creation month)
  revenue: number;
  cost: number;
  /**
   * Cash actually collected, expressed in the case currency: every incoming
   * paid payment normalized at the rate frozen on its row (0016), whatever
   * currency it was taken in.
   */
  collected: number;
  /** Same normalization for outgoing paid payments — the actual cost. */
  paidOut: number;
  hospitalId: string | null;
  hospitalName: string;
  doctorId: string | null;
  doctorName: string;
  source: string;
  country: string | null;
}

/** Per-payment row from finance_payment_rows(). */
export interface PaymentFinance {
  id: string;
  caseId: string;
  patientId: string;
  patientName: string;
  /** The currency amountCase is expressed in. */
  caseCurrency: string;
  direction: "in" | "out";
  counterpartyType: string;
  counterpartyName: string;
  amount: number;
  currency: string;
  amountCase: number;
  status: string;
  dueDate: string | null; // YYYY-MM-DD
  paidAt: string | null; // YYYY-MM-DD
}

// ---------------------------------------------------------------------------
// Periods. All options are whole calendar months, so a range is an inclusive
// [start, end] pair of YYYY-MM strings and every scoping comparison is a string
// prefix — no Date arithmetic on the hot path, no timezone landmines.
// ---------------------------------------------------------------------------

export type Period = "month" | "last-month" | "quarter" | "year" | "12m" | "all";

export const PERIOD_OPTIONS: { value: Period; label: string }[] = [
  { value: "month", label: "This month" },
  { value: "last-month", label: "Last month" },
  { value: "quarter", label: "This quarter" },
  { value: "year", label: "This year" },
  { value: "12m", label: "Last 12 months" },
  { value: "all", label: "All time" },
];

export interface MonthRange {
  start: string; // YYYY-MM inclusive
  end: string; // YYYY-MM inclusive
}

function ym(year: number, monthIndex0: number): string {
  // monthIndex0 may be negative or >11; Date normalizes it.
  const d = new Date(Date.UTC(year, monthIndex0, 1));
  return d.toISOString().slice(0, 7);
}

/** The selected period as a month range, or null for "all time". */
export function periodRange(period: Period, now = new Date()): MonthRange | null {
  const y = now.getFullYear();
  const m = now.getMonth();
  switch (period) {
    case "month":
      return { start: ym(y, m), end: ym(y, m) };
    case "last-month":
      return { start: ym(y, m - 1), end: ym(y, m - 1) };
    case "quarter": {
      const q0 = Math.floor(m / 3) * 3;
      return { start: ym(y, q0), end: ym(y, m) };
    }
    case "year":
      return { start: ym(y, 0), end: ym(y, m) };
    case "12m":
      return { start: ym(y, m - 11), end: ym(y, m) };
    case "all":
      return null;
  }
}

/**
 * The comparison window for "vs previous": the immediately preceding range of
 * the same kind — full previous quarter/year for the to-date periods, which is
 * the standard (if slightly apples-to-oranges mid-period) comparison.
 */
export function previousRange(period: Period, now = new Date()): MonthRange | null {
  const y = now.getFullYear();
  const m = now.getMonth();
  switch (period) {
    case "month":
      return { start: ym(y, m - 1), end: ym(y, m - 1) };
    case "last-month":
      return { start: ym(y, m - 2), end: ym(y, m - 2) };
    case "quarter": {
      const q0 = Math.floor(m / 3) * 3;
      return { start: ym(y, q0 - 3), end: ym(y, q0 - 1) };
    }
    case "year":
      return { start: ym(y - 1, 0), end: ym(y - 1, 11) };
    case "12m":
      return { start: ym(y, m - 23), end: ym(y, m - 12) };
    case "all":
      return null;
  }
}

/** Whether a YYYY-MM (or longer YYYY-MM-DD, sliced) falls in the range. */
export function inRange(date: string | null, range: MonthRange | null): boolean {
  if (range === null) return true;
  if (!date) return false;
  const month = date.slice(0, 7);
  return month >= range.start && month <= range.end;
}

/** Percent change, or null when there is no prior base to compare against. */
export function deltaPct(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

/** "2026-08" → "Aug 26" for chart axes. */
export function monthLabel(month: string): string {
  return new Date(month + "-01").toLocaleDateString("en-GB", {
    month: "short",
    year: "2-digit",
  });
}

// ---------------------------------------------------------------------------
// Shared presentation pieces
// ---------------------------------------------------------------------------

export function Stat({
  label,
  value,
  displayCurrency,
  accent,
  sub,
  delta,
}: {
  label: string;
  value: number;
  displayCurrency: string;
  accent?: string;
  sub?: string;
  /** Rendered as "▲ 12% vs last month"; pct null renders an em-dash. */
  delta?: { pct: number | null; label: string };
}) {
  return (
    <Card className="hover-lift">
      <CardContent className="pt-4">
        <p className="text-xs font-medium uppercase tracking-wide text-muted">{label}</p>
        <p className={cn("mt-1 text-2xl font-bold tabular-nums", accent)}>
          {formatMoney(value, displayCurrency)}
        </p>
        {sub && <p className="mt-0.5 text-xs text-muted-light">{sub}</p>}
        {delta &&
          (delta.pct === null ? (
            <p className="mt-0.5 text-xs text-muted-light">— {delta.label}</p>
          ) : (
            <p
              className={cn(
                "mt-0.5 text-xs font-medium tabular-nums",
                delta.pct >= 0 ? "text-success" : "text-danger"
              )}
            >
              {delta.pct >= 0 ? "▲" : "▼"} {Math.abs(delta.pct).toFixed(0)}% {delta.label}
            </p>
          ))}
      </CardContent>
    </Card>
  );
}

export const TABLE_PAGE_SIZE = 50;

/** The Previous/Next footer every finance table shares. Renders nothing for one page. */
export function Pager({
  page,
  setPage,
  total,
}: {
  page: number;
  setPage: (updater: (p: number) => number) => void;
  total: number;
}) {
  const pageCount = Math.max(1, Math.ceil(total / TABLE_PAGE_SIZE));
  if (pageCount <= 1) return null;
  return (
    <div className="flex items-center justify-between border-t border-border px-4 py-3 text-sm text-muted">
      <span>
        Showing {page * TABLE_PAGE_SIZE + 1}–{Math.min((page + 1) * TABLE_PAGE_SIZE, total)} of{" "}
        {total}
      </span>
      <div className="flex items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setPage((p) => Math.max(0, p - 1))}
          disabled={page === 0}
        >
          Previous
        </Button>
        <span className="tabular-nums">
          {page + 1} / {pageCount}
        </span>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
          disabled={page >= pageCount - 1}
        >
          Next
        </Button>
      </div>
    </div>
  );
}
