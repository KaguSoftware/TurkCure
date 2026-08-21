import { createAdminClient } from "@/lib/supabase/server";
import { formatMoney } from "@/lib/utils";
import { dueAtBusinessHour, istanbulToday } from "@/lib/dates";

// Dedupe lookups go out as a URL `in=(…)` list, so they're chunked — one giant
// list would blow the request-line limit once several orgs have overdue tails.
const MARKER_CHUNK = 200;

// PostgREST silently caps an unbounded select at 1000 rows anyway — make the
// bound explicit and report when it's hit, so the tail isn't invisibly starved.
const OVERDUE_LIMIT = 1000;

/**
 * Create dashboard reminders for payments whose due date has passed without
 * being paid. Idempotent: each payment gets at most one reminder, tracked by a
 * `payment:<id>` marker in the reminder note (unique partial index on
 * type='payment' since 0027 — a retried or overlapping run conflicts instead
 * of duplicating). Runs from the daily cron (/api/cron/overdue-reminders), so
 * it uses the admin client — no cookies, no RLS. The sweep itself is
 * deliberately platform-global (every org's payments in one pass); isolation
 * lives in the org_id stamped onto each inserted reminder from its payment
 * row. THE LINE: past ~5k overdue rows, replace this read-diff-insert with a
 * single `insert … select … where not exists` statement in SQL.
 */
export async function syncOverduePaymentReminders(): Promise<{
  inserted: number;
  scanned: number;
  truncated: boolean;
  errors: string[];
}> {
  const supabase = createAdminClient();
  // The business day is Istanbul's, not the server's — "overdue" flips at
  // Istanbul midnight regardless of where the cron runs.
  const today = istanbulToday();
  const errors: string[] = [];

  // Oldest due dates first, so if the cap ever bites, the rows crowded out are
  // the newest — and they get their turn once older ones are paid or reminded.
  const { data: overdue, error: readErr } = await supabase
    .from("payments")
    .select("id, org_id, amount, currency, due_date, case_id, cases(patient_id, patients(full_name, assigned_agent_id))")
    .neq("status", "paid")
    .not("due_date", "is", null)
    .lt("due_date", today)
    .order("due_date", { ascending: true })
    .limit(OVERDUE_LIMIT);
  if (readErr) return { inserted: 0, scanned: 0, truncated: false, errors: [readErr.message] };

  if (!overdue || overdue.length === 0)
    return { inserted: 0, scanned: 0, truncated: false, errors };
  const truncated = overdue.length >= OVERDUE_LIMIT;
  if (truncated)
    console.warn(
      `overdue sweep hit the ${OVERDUE_LIMIT}-row cap — time for the SQL rewrite (see THE LINE above)`
    );

  // Which of these already have a reminder? A failed chunk poisons the diff
  // (its markers would look missing), so any chunk error aborts the sweep —
  // the unique marker index is the backstop if this ever regresses.
  const markers = overdue.map((p) => `payment:${p.id}`);
  const have = new Set<string>();
  const chunks: string[][] = [];
  for (let i = 0; i < markers.length; i += MARKER_CHUNK) {
    chunks.push(markers.slice(i, i + MARKER_CHUNK));
  }
  await Promise.all(
    chunks.map(async (chunk) => {
      const { data: existing, error } = await supabase
        .from("reminders")
        .select("note")
        .eq("type", "payment")
        .in("note", chunk);
      if (error) errors.push(`marker lookup failed: ${error.message}`);
      for (const r of existing ?? []) have.add(r.note);
    })
  );
  if (errors.length) return { inserted: 0, scanned: overdue.length, truncated, errors };

  const toInsert = overdue
    .filter((p) => !have.has(`payment:${p.id}`))
    .map((p) => {
      const c = p.cases as unknown as {
        patient_id: string;
        patients: { full_name: string; assigned_agent_id: string | null } | null;
      } | null;
      return {
        type: "payment" as const,
        org_id: p.org_id,
        case_id: p.case_id,
        patient_id: c?.patient_id ?? null,
        title: `${c?.patients?.full_name ?? "Patient"} — payment overdue (${formatMoney(
          Number(p.amount),
          p.currency
        )})`,
        note: `payment:${p.id}`,
        due_at: dueAtBusinessHour(p.due_date as string),
        assigned_to: c?.patients?.assigned_agent_id ?? null,
      };
    });

  if (toInsert.length > 0) {
    // ignoreDuplicates → ON CONFLICT DO NOTHING against 0027's unique marker
    // index — a concurrent/retried run's duplicate must skip that row, not
    // abort the whole batch and 500 the cron. If PostgREST can't infer the
    // partial index from the target (all rows here satisfy its predicate:
    // type='payment', note like 'payment:%'), the 23505 fallback below inserts
    // row-by-row, skipping only the true duplicates.
    const { error: insErr } = await supabase
      .from("reminders")
      .upsert(toInsert, { onConflict: "org_id,note", ignoreDuplicates: true });
    if (insErr) {
      if (insErr.code !== "23505" && insErr.code !== "42P10") {
        return { inserted: 0, scanned: overdue.length, truncated, errors: [insErr.message] };
      }
      let inserted = 0;
      for (const row of toInsert) {
        const { error } = await supabase.from("reminders").insert(row);
        if (!error) inserted += 1;
        else if (error.code !== "23505") errors.push(`insert failed: ${error.message}`);
      }
      return { inserted, scanned: overdue.length, truncated, errors };
    }
  }
  return { inserted: toInsert.length, scanned: overdue.length, truncated, errors };
}
