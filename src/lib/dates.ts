/**
 * Date helpers for reminder due times. Plain module — imported by server
 * actions, the cron sweep and client components alike, so no "use server"
 * and no client-only dependencies.
 *
 * The business timezone is Istanbul. Turkey abolished DST in 2016, so the
 * +03:00 offset is a constant and fixed-offset ISO strings are exact forever —
 * no tz database needed.
 */

const TR_OFFSET_MS = 3 * 60 * 60 * 1000;
const BUSINESS_HOUR = "09:00:00+03:00";

/** Matches a date-only value like "2026-08-21". */
export const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * "YYYY-MM-DD" (+ optional day offset) → an instant at 09:00 Istanbul on that
 * calendar day. Never goes through `new Date("YYYY-MM-DD")` — that parses as
 * UTC midnight and shifts the displayed day for anyone west of UTC (and put
 * every reminder at 03:00 local for the office).
 */
export function dueAtBusinessHour(date: string, offsetDays = 0): string {
  const [y, m, d] = date.split("-").map(Number);
  // Day arithmetic in UTC space is calendar-exact (no DST, every day 86400s).
  const shifted = new Date(Date.UTC(y, m - 1, d + offsetDays));
  return `${shifted.toISOString().slice(0, 10)}T${BUSINESS_HOUR}`;
}

/** "YYYY-MM-DD" → a Date at LOCAL midnight, for display/compare in the viewer's day. */
export function parseDateOnly(date: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** Today's calendar date in Istanbul, as "YYYY-MM-DD" — server-TZ independent. */
export function istanbulToday(nowMs = Date.now()): string {
  return new Date(nowMs + TR_OFFSET_MS).toISOString().slice(0, 10);
}

/**
 * Is a reminder overdue? Date-derived reminders (case schedule, payment due
 * dates) are stored at exactly 09:00 Istanbul and carry no meaningful time —
 * "operation day" isn't late at 09:01; it's late once the day has passed. So
 * a due_at at the business hour goes overdue only after end-of-day Istanbul.
 * Any other time-of-day was chosen deliberately (a hand-set reminder, a 14:37
 * snooze) and goes overdue past the instant itself. The only false positive is
 * a user hand-picking exactly 09:00 Istanbul — who then gets end-of-day grace,
 * which is benign.
 */
export function isReminderOverdue(dueAt: string, nowMs: number): boolean {
  const dueMs = Date.parse(dueAt);
  if (Number.isNaN(dueMs)) return false;
  const inIstanbul = new Date(dueMs + TR_OFFSET_MS);
  const isBusinessHour =
    inIstanbul.getUTCHours() === 9 &&
    inIstanbul.getUTCMinutes() === 0 &&
    inIstanbul.getUTCSeconds() === 0;
  if (!isBusinessHour) return nowMs > dueMs;
  const endOfDay = Date.parse(
    `${inIstanbul.toISOString().slice(0, 10)}T23:59:59.999+03:00`
  );
  return nowMs > endOfDay;
}
