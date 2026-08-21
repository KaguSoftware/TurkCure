"use client";

import * as React from "react";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge, PATIENT_STATUS_LABEL, PATIENT_STATUS_TONE } from "@/components/ui/badge";
import { Select } from "@/components/ui/input";
import { RemindersPanel } from "@/components/dashboard/reminders-panel";
import { HORIZON_OPTIONS } from "@/components/dashboard/horizon";
import { formatDate, formatMoney } from "@/lib/utils";
import { PATIENT_STATUSES, type Reminder } from "@/lib/types";

export interface ArrivalRow {
  id: string;
  arrival_date: string;
  patients: { id: string; full_name: string } | null;
  operation_types: { name: string } | null;
}

export interface PaymentDueRow {
  id: string;
  direction: string;
  counterparty_type: string;
  due_date: string;
  amount: number | string;
  currency: string;
  cases: { patient_id: string; patients: { full_name: string } | null } | null;
}

const DAYS_STORAGE_KEY = "tc:dashboard-days";
const PAYMENTS_SHOWN = 15;

/**
 * Everything below the top bar. The server fetches ONE fixed 90-day window;
 * the period select filters it locally, so changing the horizon re-renders
 * instantly instead of doing a server round trip per click. The choice is
 * remembered in localStorage (adopted in an effect — this component is SSR'd,
 * so reading storage during the first render would mismatch hydration).
 */
export function DashboardContent({
  firstName,
  statusCounts,
  reminders,
  completedReminders,
  laterCount90,
  windowOverflow,
  arrivals,
  paymentsDue,
  agents,
  currentUserId,
}: {
  firstName: string;
  statusCounts: Record<string, number>;
  /** Open (+ recently completed) reminders within 90 days. */
  reminders: Reminder[];
  completedReminders: Reminder[];
  /** Open reminders due beyond the 90-day fetch window. */
  laterCount90: number;
  /** Within-window rows the 60-row fetch cap dropped (0 when nothing was cut). */
  windowOverflow: number;
  arrivals: ArrivalRow[];
  paymentsDue: PaymentDueRow[];
  agents: { id: string; name: string }[];
  currentUserId: string;
}) {
  const [days, setDays] = React.useState<number>(14);
  React.useEffect(() => {
    const stored = Number(window.localStorage.getItem(DAYS_STORAGE_KEY));
    if ((HORIZON_OPTIONS as readonly number[]).includes(stored)) setDays(stored);
  }, []);
  function pickDays(next: number) {
    setDays(next);
    try {
      window.localStorage.setItem(DAYS_STORAGE_KEY, String(next));
    } catch {
      // storage unavailable — the select still works for this visit
    }
  }

  // Compare as instants, never as strings — PostgREST's "+00:00" suffix and
  // toISOString's ".000Z" are not lexicographically co-comparable.
  const horizonMs = React.useMemo(() => Date.now() + days * 24 * 60 * 60 * 1000, [days]);
  const horizonDate = new Date(horizonMs).toISOString().slice(0, 10);

  const shownReminders = React.useMemo(
    () => reminders.filter((r) => Date.parse(r.due_at) <= horizonMs),
    [reminders, horizonMs]
  );
  // Beyond the SELECTED window: the far tail (beyond 90d, counted server-side),
  // rows the 60-row fetch cap crowded out, plus loaded open reminders between
  // the selection and 90d.
  const laterCount =
    laterCount90 +
    windowOverflow +
    reminders.filter((r) => !r.done_at && Date.parse(r.due_at) > horizonMs).length;

  const shownArrivals = arrivals.filter((a) => a.arrival_date <= horizonDate);
  const shownPayments = paymentsDue
    .filter((p) => p.due_date <= horizonDate)
    .slice(0, PAYMENTS_SHOWN);

  return (
    <>
      <PageHeader
        title={`Welcome back, ${firstName}`}
        subtitle="Here is what needs your attention"
      >
        <Select
          aria-label="How far ahead to look"
          className="w-36"
          value={String(days)}
          onChange={(e) => pickDays(Number(e.target.value))}
        >
          {HORIZON_OPTIONS.map((d) => (
            <option key={d} value={String(d)}>
              Next {d} days
            </option>
          ))}
        </Select>
      </PageHeader>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {PATIENT_STATUSES.map((s) => (
          <Link key={s} href={`/patients?focus=${s}`}>
            <Card className="hover-lift">
              <CardContent className="pt-4">
                <p className="text-2xl font-bold tabular-nums">{statusCounts[s] ?? 0}</p>
                <Badge tone={PATIENT_STATUS_TONE[s]} className="mt-1">
                  {PATIENT_STATUS_LABEL[s]}
                </Badge>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <RemindersPanel
            reminders={shownReminders}
            completedReminders={completedReminders}
            agents={agents}
            currentUserId={currentUserId}
            horizonDays={days}
            laterCount={laterCount}
          />
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>Upcoming arrivals ({days} days)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {shownArrivals.length === 0 && (
                <p className="py-4 text-center text-sm text-muted">No arrivals scheduled.</p>
              )}
              {shownArrivals.map((c) => (
                <div key={c.id} className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <Link
                      href={`/patients/${c.patients?.id}`}
                      className="block truncate text-sm font-medium hover:text-primary"
                    >
                      {c.patients?.full_name}
                    </Link>
                    <p className="text-xs text-muted">{c.operation_types?.name ?? "Operation TBD"}</p>
                  </div>
                  <span className="shrink-0 text-xs font-medium text-primary">
                    {formatDate(c.arrival_date)}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Payments due & overdue</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {shownPayments.length === 0 && (
                <p className="py-4 text-center text-sm text-muted">Nothing due. 🎉</p>
              )}
              {shownPayments.map((p) => (
                <div key={p.id} className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <Link
                      href={`/patients/${p.cases?.patient_id}`}
                      className="block truncate text-sm font-medium hover:text-primary"
                    >
                      {p.cases?.patients?.full_name ?? "Case"}
                    </Link>
                    <p className="text-xs text-muted">
                      {p.direction === "in" ? "From patient" : `To ${p.counterparty_type}`} · due{" "}
                      {formatDate(p.due_date)}
                    </p>
                  </div>
                  <span
                    className={
                      "shrink-0 text-sm font-semibold " +
                      (p.direction === "in" ? "text-success" : "text-warning")
                    }
                  >
                    {p.direction === "in" ? "+" : "−"}
                    {formatMoney(Number(p.amount), p.currency)}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
