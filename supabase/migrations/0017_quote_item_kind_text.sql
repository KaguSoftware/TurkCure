-- Free-form quote item labels.
--
-- `quote_items.kind` was the PG enum `quote_item_kind` (surgery/hotel/transfer/
-- extra), so a line could never be called anything else — and `description`
-- carried a `required` attribute in the form. Live use wants both open: a custom
-- label, or no label at all.
--
-- Text rather than a widened enum, for the same reason `patient_files.category`
-- went text-plus-check in 0014: `alter type ... add value` cannot run inside a
-- transaction, so an enum that is meant to grow is the wrong shape. Unlike 0014
-- there is deliberately NO check constraint here — arbitrary text is the point.
-- (Hand-applied — the owner runs this.)

-- The agent-safe view selects `kind`, and Postgres refuses to alter the type of
-- a column a view depends on. Drop it, convert, recreate it identically.
drop view if exists quote_items_public;

alter table quote_items
  alter column kind drop default;

alter table quote_items
  alter column kind type text using kind::text;

-- Empty string, not 'extra': a blank label must be reachable, and defaulting to
-- a real category would silently mislabel any row inserted without one.
alter table quote_items
  alter column kind set default '';

-- Existing rows keep their old enum labels verbatim ('surgery', 'hotel', …) —
-- the cast above preserves them, and they stay the suggested values in the UI.
alter table quote_items
  alter column kind set not null;

create view quote_items_public with (security_invoker = true) as
  select id, case_id, kind, description, price, sort_order, created_at
  from quote_items;

-- The enum type is left in place. Nothing references it now, but dropping a type
-- is irreversible without a rebuild and buys nothing.
