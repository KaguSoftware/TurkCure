-- Multi-currency payments with a frozen conversion rate.
--
-- A case is priced in one currency but patients sometimes pay in another. Until
-- now the payment form accepted any currency while every total silently DROPPED
-- the mismatched row: finance_case_rows() joined `coll.currency = c.currency`,
-- the patient header chip filtered on it, and the case PDF's deposit query had
-- an explicit `.eq("currency", …)`. Real cash existed in the DB and appeared in
-- no total.
--
-- Each payment now carries the rate used to express it in the CASE currency,
-- fixed at booking time, so historical rows never re-rate when the market moves.
-- (Hand-applied — the owner runs this.)
--
-- ⚠️ APPLYING THIS WILL MOVE NUMBERS. Payments that were previously excluded
-- from every total start counting. Case totals containing one will visibly
-- change the next time Finance loads. That is the fix working.

-- ========== Columns ==========
-- Added nullable on purpose: `not null default 1` would instantly assert 1:1 for
-- every pre-existing off-currency row. Backfill first, constrain after.
alter table payments
  add column if not exists fx_rate     numeric(18,8),
  add column if not exists amount_case numeric(12,2);

comment on column payments.fx_rate is
  'Multiplier from payments.currency to the case currency, fixed at booking time. 1 when they match. 8dp because TRY→EUR is ~0.026 and a 4dp rate misprices a large payment by tens of euros.';
comment on column payments.amount_case is
  'round(amount * fx_rate, 2) — the single normalized figure finance and reconciliation sum. Stored rather than derived: a generated column cannot reach cases.currency, and computing on read lets SQL, the optimistic client row and the PDF each round independently and disagree by cents.';

-- ========== Backfill 1: same-currency rows are exact ==========
update payments p
set fx_rate = 1, amount_case = p.amount
from cases c
where c.id = p.case_id and c.currency = p.currency and p.fx_rate is null;

-- ========== Backfill 2: legacy off-currency rows ==========
-- These counted as zero everywhere, so there is no historical rate to recover.
-- Seed from the same hand-maintained USD table src/lib/fx.ts shipped with (as of
-- 2026-07-09) and let the owner correct individual rows in the UI. Leaving them
-- at 1 would be strictly worse: it silently asserts TRY 1 = EUR 1.
with usd(code, to_usd) as (
  values ('USD'::currency_code, 1.00), ('EUR', 1.08), ('GBP', 1.27), ('TRY', 0.03)
)
update payments p
set fx_rate     = round(f.to_usd / t.to_usd, 8),
    amount_case = round(p.amount * (f.to_usd / t.to_usd), 2)
from cases c, usd f, usd t
where c.id = p.case_id
  and p.fx_rate is null
  and f.code = p.currency
  and t.code = c.currency;

-- Defensive: payments.case_id is NOT NULL with an FK so nothing should be left,
-- but the NOT NULL below must not be able to fail on a stray row.
update payments set fx_rate = 1, amount_case = amount where fx_rate is null;

-- ========== Constraints ==========
alter table payments
  alter column fx_rate set default 1,
  alter column fx_rate set not null,
  alter column amount_case set not null;

alter table payments
  drop constraint if exists payments_fx_rate_positive,
  drop constraint if exists payments_amount_case_positive,
  drop constraint if exists payments_amount_case_consistent;

alter table payments
  add constraint payments_fx_rate_positive check (fx_rate > 0),
  add constraint payments_amount_case_positive check (amount_case > 0),
  -- Ties the pair together so no writer can persist a normalized figure that
  -- disagrees with amount x rate — the "someone forgot to set it" failure mode
  -- becomes a hard DB error instead of silently wrong money. The 0.01 tolerance
  -- absorbs JS IEEE-754 vs Postgres exact-numeric rounding; strict equality
  -- would produce sporadic, unreproducible insert failures on real amounts.
  add constraint payments_amount_case_consistent
    check (abs(amount_case - amount * fx_rate) <= 0.01);

-- ========== Index ==========
-- 0011's composite carried `currency` as a trailing column purely so the old
-- finance join and the PDF deposit query could filter on it. Both now normalize
-- instead of filtering, so trade that column for an INCLUDE of the value being
-- summed and let the collected aggregate run index-only.
drop index if exists payments_case_dir_status_ccy_idx;
create index if not exists payments_case_dir_status_idx
  on payments(case_id, direction, status) include (amount_case);

-- ========== finance_case_rows() rewrite ==========
-- Replaces the 0011 version. ONLY the `coll` CTE and its join change: it now
-- sums the case-currency-normalized amount across ALL payment currencies rather
-- than joining on currency equality. Return shape is byte-identical, so no app
-- change is needed beyond correctness.
create or replace function finance_case_rows()
returns table (
  id uuid,
  patient_id uuid,
  patient_name text,
  operation text,
  currency currency_code,
  status case_status,
  month text,
  revenue numeric,
  cost numeric,
  collected numeric
)
language sql
stable
security definer
set search_path = public
as $$
  with rev as (
    select case_id, sum(price) as revenue, sum(cost) as cost
    from quote_items
    group by case_id
  ),
  coll as (
    select case_id, sum(amount_case) as collected
    from payments
    where direction = 'in' and status = 'paid'
    group by case_id
  )
  select
    c.id,
    p.id as patient_id,
    coalesce(p.full_name, '—') as patient_name,
    coalesce(ot.name, '—') as operation,
    c.currency,
    c.status,
    left(coalesce(c.surgery_date::text, c.created_at::text), 7) as month,
    coalesce(rev.revenue, 0) as revenue,
    coalesce(rev.cost, 0) as cost,
    coalesce(coll.collected, 0) as collected
  from cases c
  left join patients p on p.id = c.patient_id
  left join operation_types ot on ot.id = c.operation_type_id
  left join rev on rev.case_id = c.id
  left join coll on coll.case_id = c.id
  where c.status <> 'cancelled'
  order by c.created_at desc;
$$;

revoke execute on function finance_case_rows() from public, anon, authenticated;
