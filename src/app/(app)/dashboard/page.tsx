import { createClient, requireProfile } from "@/lib/supabase/server";
import {
  DashboardContent,
  type ArrivalRow,
  type PaymentDueRow,
} from "@/components/dashboard/dashboard-content";
import type { Reminder } from "@/lib/types";
import { addDays } from "date-fns";

export const metadata = { title: "Dashboard" };

// One fixed fetch window; the period select filters it CLIENT-side so changing
// it re-renders instantly (no server round trip per click).
const FETCH_DAYS = 90;

export default async function DashboardPage() {
  const profile = await requireProfile();
  const supabase = await createClient();
  const now = new Date();
  const horizon = addDays(now, FETCH_DAYS).toISOString();

  const [
    { data: reminders, count: windowCount },
    { data: completedReminders },
    { count: laterCount },
    { data: statusCounts },
    { data: arrivals },
    { data: paymentsDue },
    { data: agents },
  ] =
    await Promise.all([
      // Open reminders plus ones checked off within the last 24h (they stay
      // visible, struck through, until a day has passed or they're deleted).
      // count: "exact" so rows the 60-row cap crowds out are surfaced in the
      // "+N more" line instead of silently missing.
      supabase
        .from("reminders")
        .select("*, patients(full_name)", { count: "exact" })
        .or(`done_at.is.null,done_at.gte.${addDays(now, -1).toISOString()}`)
        .lte("due_at", horizon)
        .order("due_at")
        .limit(60),
      // Older completions (1–7 days ago) live behind the "Show completed" toggle.
      supabase
        .from("reminders")
        .select("*, patients(full_name)")
        .not("done_at", "is", null)
        .gte("done_at", addDays(now, -7).toISOString())
        .order("done_at", { ascending: false })
        .limit(15),
      // Open reminders beyond even the 90-day fetch, so they're never invisible.
      supabase
        .from("reminders")
        .select("id", { count: "exact", head: true })
        .is("done_at", null)
        .gt("due_at", horizon),
      supabase.rpc("patient_status_counts"),
      supabase
        .from("cases")
        .select("id, arrival_date, surgery_date, patients(id, full_name), operation_types(name)")
        .gte("arrival_date", now.toISOString().slice(0, 10))
        .lte("arrival_date", horizon.slice(0, 10))
        .order("arrival_date")
        .limit(60),
      supabase
        .from("payments")
        .select("*, cases(patient_id, patients(full_name))")
        .neq("status", "paid")
        .not("due_date", "is", null)
        .lte("due_date", horizon.slice(0, 10))
        .order("due_date")
        .limit(60),
      supabase.from("profiles").select("id, name").eq("active", true),
    ]);

  const counts: Record<string, number> = {};
  for (const row of (statusCounts ?? []) as { status: string; count: number }[])
    counts[row.status] = Number(row.count);

  return (
    <DashboardContent
      firstName={profile.name.split(" ")[0]}
      statusCounts={counts}
      reminders={(reminders ?? []) as Reminder[]}
      completedReminders={(completedReminders ?? []) as Reminder[]}
      laterCount90={laterCount ?? 0}
      windowOverflow={Math.max(0, (windowCount ?? 0) - (reminders?.length ?? 0))}
      arrivals={(arrivals ?? []) as unknown as ArrivalRow[]}
      paymentsDue={(paymentsDue ?? []) as unknown as PaymentDueRow[]}
      agents={agents ?? []}
      currentUserId={profile.id}
    />
  );
}
