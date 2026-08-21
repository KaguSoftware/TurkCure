-- 0027: make the overdue-payment reminder dedupe DB-enforced.
--
-- The cron sweep (lib/data/overdue.ts) dedupes by a `payment:<uuid>` marker in
-- reminders.note using read-then-insert. 0023's index on that predicate is
-- non-unique, so two overlapping runs (a Vercel retry is enough) both see the
-- marker missing and both insert — duplicate "payment overdue" reminders.
-- A unique partial index makes the marker a real constraint; the app code
-- remains read-diff-insert (cheap and usually right), this is the backstop.
--
-- ⚠️ Apply by hand (npx supabase db push --linked), like every migration.
-- If duplicates already exist the CREATE UNIQUE INDEX fails — the delete
-- below clears them first (keeps the oldest row of each marker).

delete from reminders r
using reminders keep
where r.type = 'payment'
  and keep.type = 'payment'
  and r.note = keep.note
  -- id tiebreak: duplicates inserted in one statement share created_at.
  and (r.created_at, r.id) > (keep.created_at, keep.id);

drop index if exists reminders_payment_note_idx;
create unique index reminders_payment_note_idx
  on reminders(note)
  where type = 'payment';
