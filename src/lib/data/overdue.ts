import { createClient } from "@/lib/supabase/server";
import { formatMoney } from "@/lib/utils";

/**
 * Create dashboard reminders for payments whose due date has passed without
 * being paid. Idempotent: each payment gets at most one reminder, tracked by a
 * `payment:<id>` marker in the reminder note. Runs on dashboard load (the app is
 * local-only, so there is no cron). Cheap — payments are indexed on status.
 */
export async function syncOverduePaymentReminders(): Promise<void> {
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);

  const { data: overdue } = await supabase
    .from("payments")
    .select("id, amount, currency, due_date, case_id, cases(patient_id, patients(full_name, assigned_agent_id))")
    .neq("status", "paid")
    .not("due_date", "is", null)
    .lt("due_date", today);

  if (!overdue || overdue.length === 0) return;

  // Which of these already have a reminder?
  const markers = overdue.map((p) => `payment:${p.id}`);
  const { data: existing } = await supabase
    .from("reminders")
    .select("note")
    .eq("type", "payment")
    .in("note", markers);
  const have = new Set((existing ?? []).map((r) => r.note));

  const toInsert = overdue
    .filter((p) => !have.has(`payment:${p.id}`))
    .map((p) => {
      const c = p.cases as unknown as {
        patient_id: string;
        patients: { full_name: string; assigned_agent_id: string | null } | null;
      } | null;
      return {
        type: "payment" as const,
        case_id: p.case_id,
        patient_id: c?.patient_id ?? null,
        title: `${c?.patients?.full_name ?? "Patient"} — payment overdue (${formatMoney(
          Number(p.amount),
          p.currency
        )})`,
        note: `payment:${p.id}`,
        due_at: new Date(p.due_date as string).toISOString(),
        assigned_to: c?.patients?.assigned_agent_id ?? null,
      };
    });

  if (toInsert.length > 0) await supabase.from("reminders").insert(toInsert);
}
