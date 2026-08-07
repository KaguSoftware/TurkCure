-- Reminder types for the rest of the case schedule.
--
-- Case reminders only ever covered arrival, operation and aftercare, so the
-- hospital check-in/check-out and departure dates sat on the case form and
-- reached nothing actionable. "Add dates to reminders" now pushes every date on
-- the case, which needs somewhere for the extra three to live.
--
-- `ALTER TYPE ... ADD VALUE` has been transaction-safe since PG12 (this project
-- is on 17.6) *provided the new value is not used in the same transaction* —
-- nothing below uses them, the app writes them after this commits. That is why
-- these can share a file, unlike the note in 0005.

alter type reminder_type add value if not exists 'hospital';
alter type reminder_type add value if not exists 'departure';
