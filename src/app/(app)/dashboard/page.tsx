import Link from "next/link";
import { createClient, requireProfile } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge, PATIENT_STATUS_LABEL, PATIENT_STATUS_TONE } from "@/components/ui/badge";
import { RemindersPanel } from "@/components/dashboard/reminders-panel";
import { formatDate, formatMoney } from "@/lib/utils";
import { PATIENT_STATUSES, type Reminder } from "@/lib/types";
import { syncOverduePaymentReminders } from "@/lib/data/overdue";
import { addDays } from "date-fns";

export const metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const profile = await requireProfile();
  const supabase = await createClient();
  const now = new Date();
  const horizon = addDays(now, 14).toISOString();

  // Surface any newly-overdue payments as reminders before we read the list.
  await syncOverduePaymentReminders();

  const [
    { data: reminders },
    { data: completedReminders },
    { data: statusCounts },
    { data: arrivals },
    { data: paymentsDue },
    { data: agents },
  ] =
    await Promise.all([
      // Open reminders plus ones checked off within the last 24h (they stay
      // visible, struck through, until a day has passed or they're deleted).
      supabase
        .from("reminders")
        .select("*, patients(full_name)")
        .or(`done_at.is.null,done_at.gte.${addDays(now, -1).toISOString()}`)
        .lte("due_at", horizon)
        .order("due_at")
        .limit(30),
      // Older completions (1–7 days ago) live behind the "Show completed" toggle.
      supabase
        .from("reminders")
        .select("*, patients(full_name)")
        .not("done_at", "is", null)
        .gte("done_at", addDays(now, -7).toISOString())
        .order("done_at", { ascending: false })
        .limit(15),
      supabase.from("patients").select("status"),
      supabase
        .from("cases")
        .select("id, arrival_date, surgery_date, patients(id, full_name), operation_types(name)")
        .gte("arrival_date", now.toISOString().slice(0, 10))
        .lte("arrival_date", horizon.slice(0, 10))
        .order("arrival_date"),
      supabase
        .from("payments")
        .select("*, cases(patient_id, patients(full_name))")
        .neq("status", "paid")
        .not("due_date", "is", null)
        .lte("due_date", horizon.slice(0, 10))
        .order("due_date")
        .limit(15),
      supabase.from("profiles").select("id, name").eq("active", true),
    ]);

  const counts: Record<string, number> = {};
  for (const p of statusCounts ?? []) counts[p.status] = (counts[p.status] ?? 0) + 1;

  return (
    <>
      <PageHeader
        title={`Welcome back, ${profile.name.split(" ")[0]}`}
        subtitle="Here is what needs your attention"
      />

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {PATIENT_STATUSES.map((s) => (
          <Link key={s} href="/patients">
            <Card className="transition-shadow hover:shadow-pop">
              <CardContent className="pt-4">
                <p className="text-2xl font-bold tabular-nums">{counts[s] ?? 0}</p>
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
            reminders={(reminders ?? []) as Reminder[]}
            completedReminders={(completedReminders ?? []) as Reminder[]}
            agents={agents ?? []}
            currentUserId={profile.id}
          />
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>Upcoming arrivals (14 days)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {(arrivals ?? []).length === 0 && (
                <p className="py-4 text-center text-sm text-muted">No arrivals scheduled.</p>
              )}
              {(arrivals ?? []).map((c) => {
                const patient = c.patients as unknown as { id: string; full_name: string } | null;
                const op = c.operation_types as unknown as { name: string } | null;
                return (
                  <div key={c.id} className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <Link
                        href={`/patients/${patient?.id}`}
                        className="block truncate text-sm font-medium hover:text-primary"
                      >
                        {patient?.full_name}
                      </Link>
                      <p className="text-xs text-muted">{op?.name ?? "Operation TBD"}</p>
                    </div>
                    <span className="shrink-0 text-xs font-medium text-primary">
                      {formatDate(c.arrival_date)}
                    </span>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Payments due & overdue</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {(paymentsDue ?? []).length === 0 && (
                <p className="py-4 text-center text-sm text-muted">Nothing due. 🎉</p>
              )}
              {(paymentsDue ?? []).map((p) => {
                const caseInfo = p.cases as unknown as {
                  patient_id: string;
                  patients: { full_name: string } | null;
                } | null;
                return (
                  <div key={p.id} className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <Link
                        href={`/patients/${caseInfo?.patient_id}`}
                        className="block truncate text-sm font-medium hover:text-primary"
                      >
                        {caseInfo?.patients?.full_name ?? "Case"}
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
                );
              })}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
