-- Performance pass: indexes on hot filter/sort columns, trigram search index,
-- and a rewrite of finance_case_rows() to drop per-row correlated subqueries.

-- ========== Hot-path indexes ==========

-- Dashboard "payments due" + overdue-reminder cron both filter/order on due_date.
create index if not exists payments_due_date_idx on payments(due_date);

-- Dashboard "upcoming arrivals" range-filters + orders on arrival_date.
create index if not exists cases_arrival_date_idx on cases(arrival_date);

-- Patients list + export default order by created_at.
create index if not exists patients_created_at_idx on patients(created_at);

-- finance_case_rows() collected sum + PDF payments query filter on this combo.
create index if not exists payments_case_dir_status_ccy_idx
  on payments(case_id, direction, status, currency);

-- CSV-import dedupe looks patients up by email / phone.
create index if not exists patients_email_idx on patients(email);
create index if not exists patients_phone_idx on patients(phone);

-- ========== Trigram search index ==========
-- Global search + patients list use leading-wildcard ILIKE, which cannot use a
-- b-tree index. pg_trgm GIN makes these index-usable.
create extension if not exists pg_trgm;

create index if not exists patients_trgm_idx on patients using gin (
  full_name gin_trgm_ops,
  email gin_trgm_ops,
  phone gin_trgm_ops
);

-- ========== finance_case_rows() rewrite ==========
-- Replaces the 0007 version, which ran three correlated subqueries per case.
-- Same return shape and semantics; aggregation is now done once via GROUP BY
-- CTEs and joined in.
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
    select case_id, currency, sum(amount) as collected
    from payments
    where direction = 'in' and status = 'paid'
    group by case_id, currency
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
  left join coll on coll.case_id = c.id and coll.currency = c.currency
  where c.status <> 'cancelled'
  order by c.created_at desc;
$$;

revoke execute on function finance_case_rows() from public, anon, authenticated;
