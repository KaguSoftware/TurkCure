-- 0029: move generated reminder due times off UTC midnight.
--
-- Every date-derived reminder (case schedule + overdue payments) used to be
-- built via `new Date("YYYY-MM-DD")` — UTC midnight. That rendered as 03:00
-- Istanbul (and as the PREVIOUS DAY for any viewer west of UTC), and flagged
-- reminders "Overdue" from 3am of the event day. The app now writes due_at at
-- 09:00 Europe/Istanbul (fixed +03:00 — Turkey has no DST since 2016); this
-- moves the existing rows to match.
--
-- Conservative predicate: only OPEN rows of the generated/payment types whose
-- time-of-day is exactly 00:00:00Z (what the old code produced on Vercel's
-- UTC runtime). Done rows are history and left alone; rows generated from a
-- non-UTC dev machine won't match and are left alone too.
--
-- ⚠️ Apply by hand (npx supabase db push --linked). The code works either way
-- — this is a display/overdue-semantics fix for pre-existing rows.

update reminders
set due_at = due_at + interval '6 hours'
where type in ('arrival', 'operation', 'aftercare', 'hospital', 'departure', 'payment')
  and done_at is null
  and due_at = date_trunc('day', due_at at time zone 'UTC') at time zone 'UTC';
