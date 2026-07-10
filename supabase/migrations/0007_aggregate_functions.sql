-- Server-side aggregates so the dashboard and finance pages stop pulling
-- whole tables to reduce in JS.

-- Patient counts per status (dashboard tiles).
create or replace function patient_status_counts()
returns table (status patient_status, count bigint)
language sql
stable
security invoker
as $$
  select status, count(*) from patients group by status;
$$;

-- Per-case finance rows: revenue/cost from quote items, collected = incoming
-- paid payments in the case currency (same basis as per-case reconciliation).
-- security definer because quote_items.cost is admin-only under RLS; execute
-- is therefore revoked from client roles — only the service role (finance
-- page, which already gates on admin) may call it.
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
  select
    c.id,
    p.id as patient_id,
    coalesce(p.full_name, '—') as patient_name,
    coalesce(ot.name, '—') as operation,
    c.currency,
    c.status,
    left(coalesce(c.surgery_date::text, c.created_at::text), 7) as month,
    coalesce((select sum(q.price) from quote_items q where q.case_id = c.id), 0) as revenue,
    coalesce((select sum(q.cost) from quote_items q where q.case_id = c.id), 0) as cost,
    coalesce((
      select sum(pay.amount) from payments pay
      where pay.case_id = c.id
        and pay.direction = 'in'
        and pay.status = 'paid'
        and pay.currency = c.currency
    ), 0) as collected
  from cases c
  left join patients p on p.id = c.patient_id
  left join operation_types ot on ot.id = c.operation_type_id
  where c.status <> 'cancelled'
  order by c.created_at desc;
$$;

revoke execute on function finance_case_rows() from public, anon, authenticated;
