-- Hospital-side protocol / file number for a case.
-- It was tracked outside the system, so it never reached the generated PDF and
-- couldn't be searched. Empty string (not null) matches the other free-text case
-- columns added in 0003.
-- (Hand-applied — the owner runs this.)

alter table cases add column if not exists protocol_number text not null default '';

-- The command palette matches on it with a leading-wildcard ILIKE
-- (src/lib/actions/search.ts), which a b-tree can't serve — same reason the
-- patient name search uses trigrams in 0011. Not a partial index: the planner
-- can't prove `ilike '%q%'` implies `<> ''`, so a WHERE clause here would just
-- make the index unusable.
create extension if not exists pg_trgm;

create index if not exists cases_protocol_number_trgm_idx
  on cases using gin (protocol_number gin_trgm_ops);
