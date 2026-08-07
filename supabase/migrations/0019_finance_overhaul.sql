-- Finance overhaul: actual payouts, dimensions, and a per-payment feed.
--
-- The finance page has only ever seen QUOTED cost (quote_items.cost) — real
-- outgoing payments to hospitals/doctors/hotels/drivers sat in `payments` and
-- appeared in no finance figure, so true margin was unknowable. It also had no
-- receivables/payables view, no time dimension, and no way to group by
-- operation/hospital/doctor. Two changes close all of that with data the app
-- already records:
--
--   1. finance_case_rows() gains `paid_out` (outgoing paid cash, normalized)
--      plus the dimension columns the breakdowns need. Existing columns are
--      byte-identical, appended-only — the sole caller is lib/data/finance.ts.
--   2. finance_payment_rows() — a new flat per-payment feed. The client derives
--      the cash-basis monthly chart, period-scoped totals, receivables aging and
--      payables grouping from this one list; dedicated aggregate RPCs per view
--      would triple the SQL surface for a dataset of hundreds of cases.
--
-- (Hand-applied — the owner runs this. Until it is applied, the new page code
-- degrades to empty cash/receivables figures rather than crashing.)

-- ========== finance_case_rows() rewrite ==========
-- Replaces the 0016 version. The `paid` CTE mirrors `coll` for direction='out';
-- both are served index-only by payments_case_dir_status_idx include(amount_case)
-- from 0016. Dimension joins are PK lookups. `source`/`country` come along
-- because they verifiably exist on patients (0001) and cost nothing here.
drop function if exists finance_case_rows();
create function finance_case_rows()
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
  collected numeric,
  paid_out numeric,
  hospital_id uuid,
  hospital_name text,
  doctor_id uuid,
  doctor_name text,
  source text,
  country text
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
  ),
  paid as (
    select case_id, sum(amount_case) as paid_out
    from payments
    where direction = 'out' and status = 'paid'
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
    coalesce(coll.collected, 0) as collected,
    coalesce(paid.paid_out, 0) as paid_out,
    c.hospital_id,
    coalesce(h.name, '—') as hospital_name,
    c.doctor_id,
    coalesce(d.name, '—') as doctor_name,
    coalesce(p.source, '') as source,
    co.name as country
  from cases c
  left join patients p on p.id = c.patient_id
  left join operation_types ot on ot.id = c.operation_type_id
  left join hospitals h on h.id = c.hospital_id
  left join doctors d on d.id = c.doctor_id
  left join countries co on co.id = p.country_id
  left join rev on rev.case_id = c.id
  left join coll on coll.case_id = c.id
  left join paid on paid.case_id = c.id
  where c.status <> 'cancelled'
  order by c.created_at desc;
$$;

revoke execute on function finance_case_rows() from public, anon, authenticated;

-- ========== finance_payment_rows() ==========
-- Every payment on a non-cancelled case, with names resolved. Paid rows feed the
-- cash chart and period totals; open rows feed receivables/payables. Unbounded
-- on purpose at this scale — THE LINE: if this ever exceeds ~5–10k rows
-- (payload past ~1 MB), move the monthly-cash aggregation and open-balance
-- totals server-side and return only open rows here.
--
-- counterparty_id has no FK (0001) and its target table depends on
-- counterparty_type, hence the per-type conditional joins; a dangling id
-- resolves to '—' rather than dropping the row — the money is still real.
create or replace function finance_payment_rows()
returns table (
  id uuid,
  case_id uuid,
  patient_id uuid,
  patient_name text,
  case_currency currency_code,
  direction payment_direction,
  counterparty_type counterparty_type,
  counterparty_name text,
  amount numeric,
  currency currency_code,
  amount_case numeric,
  status payment_status,
  due_date date,
  paid_at date
)
language sql
stable
security definer
set search_path = public
as $$
  select
    pay.id,
    pay.case_id,
    p.id as patient_id,
    coalesce(p.full_name, '—') as patient_name,
    c.currency as case_currency,
    pay.direction,
    pay.counterparty_type,
    case pay.counterparty_type
      when 'patient'  then coalesce(p.full_name, '—')
      when 'hospital' then coalesce(h.name, '—')
      when 'doctor'   then coalesce(d.name, '—')
      when 'hotel'    then coalesce(ht.name, '—')
      when 'driver'   then coalesce(dr.name, '—')
    end as counterparty_name,
    pay.amount,
    pay.currency,
    pay.amount_case,
    pay.status,
    pay.due_date,
    pay.paid_at
  from payments pay
  join cases c on c.id = pay.case_id
  left join patients p  on p.id  = c.patient_id
  left join hospitals h on h.id  = pay.counterparty_id and pay.counterparty_type = 'hospital'
  left join doctors d   on d.id  = pay.counterparty_id and pay.counterparty_type = 'doctor'
  left join hotels ht   on ht.id = pay.counterparty_id and pay.counterparty_type = 'hotel'
  left join drivers dr  on dr.id = pay.counterparty_id and pay.counterparty_type = 'driver'
  where c.status <> 'cancelled'
  order by coalesce(pay.paid_at, pay.due_date) desc nulls last, pay.created_at desc;
$$;

revoke execute on function finance_payment_rows() from public, anon, authenticated;
