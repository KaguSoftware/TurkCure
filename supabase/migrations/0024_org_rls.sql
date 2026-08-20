-- Multi-tenancy step 2 of 3: org-scoped RLS + org-parameterized finance RPCs.
--
-- ⚠️ Apply by hand, AFTER 0023 and scripts/backfill-org-claims.mjs. In a
-- single-org database this is behavior-equivalent for the running app except
-- the finance page, which shows zeros until the new code deploys (the zero-arg
-- RPCs are dropped here; the old caller degrades to [] rather than crashing).
-- Deploy promptly after applying.
--
-- Policy shape:
-- * Every predicate is org_id = (select auth_org_id()) — the initPlan form, so
--   the helper runs once per statement, not per row (claim fast path: zero DB).
-- * Every write policy carries WITH CHECK on the org, so a forgotten or forged
--   org_id from any cookie/browser client fails loudly instead of leaking.
--   (Service-role writes bypass RLS; they are covered by 0023's defaults,
--   derive triggers, and composite FKs, plus explicit .eq("org_id") in code.)
-- * is_admin() stays a live DB lookup (role is NOT a JWT claim): demotion and
--   deactivation must bite on the next request, not at token expiry.
-- * quote_items switches from an admin-only-everything policy to org-scoped
--   SELECT for all staff + COLUMN-level privileges that exclude `cost`. This
--   fixes a real bug: quote_items_public is security_invoker, so agents got
--   ZERO quote rows (empty package section in agent-generated case PDFs).
--   Cost confidentiality moves from app-side stripping to the database.

-- ========== 1. Drop every pre-tenancy policy ==========
do $$
declare t text;
begin
  foreach t in array array[
    'countries','hospitals','doctors','hotels','drivers',
    'operation_types','instruction_templates','patients','cases',
    'reminders','patient_files','case_instructions',
    'case_additional_costs','case_documents','payments'
  ]
  loop
    execute format('drop policy if exists "%s read" on %I', t, t);
    execute format('drop policy if exists "%s insert" on %I', t, t);
    execute format('drop policy if exists "%s update" on %I', t, t);
    execute format('drop policy if exists "%s delete" on %I', t, t);
  end loop;
end $$;

drop policy if exists "profiles read" on profiles;
drop policy if exists "profiles admin write" on profiles;
drop policy if exists "quote_items admin all" on quote_items;

-- ========== 2. Staff tables: org read/insert/update, admin delete ==========
do $$
declare t text;
begin
  foreach t in array array[
    'countries','hospitals','doctors','hotels','drivers',
    'operation_types','instruction_templates','patients','cases',
    'patient_files','case_instructions','case_documents'
  ]
  loop
    execute format('create policy "%s read" on %I for select to authenticated using (org_id = (select auth_org_id()))', t, t);
    execute format('create policy "%s insert" on %I for insert to authenticated with check (org_id = (select auth_org_id()))', t, t);
    execute format('create policy "%s update" on %I for update to authenticated using (org_id = (select auth_org_id())) with check (org_id = (select auth_org_id()))', t, t);
    execute format('create policy "%s delete" on %I for delete to authenticated using (org_id = (select auth_org_id()) and is_admin())', t, t);
  end loop;
end $$;

-- ========== 3. Tables with non-standard delete rules ==========
-- payments: delete stays admin-only.
create policy "payments read" on payments for select to authenticated
  using (org_id = (select auth_org_id()));
create policy "payments insert" on payments for insert to authenticated
  with check (org_id = (select auth_org_id()));
create policy "payments update" on payments for update to authenticated
  using (org_id = (select auth_org_id())) with check (org_id = (select auth_org_id()));
create policy "payments delete" on payments for delete to authenticated
  using (org_id = (select auth_org_id()) and is_admin());

-- reminders: preserves 0004's owner-or-admin delete.
create policy "reminders read" on reminders for select to authenticated
  using (org_id = (select auth_org_id()));
create policy "reminders insert" on reminders for insert to authenticated
  with check (org_id = (select auth_org_id()));
create policy "reminders update" on reminders for update to authenticated
  using (org_id = (select auth_org_id())) with check (org_id = (select auth_org_id()));
create policy "reminders delete" on reminders for delete to authenticated
  using (org_id = (select auth_org_id()) and (is_admin() or assigned_to = auth.uid()));

-- case_additional_costs: preserves 0022's any-staff delete (drafting data).
create policy "case_additional_costs read" on case_additional_costs for select to authenticated
  using (org_id = (select auth_org_id()));
create policy "case_additional_costs insert" on case_additional_costs for insert to authenticated
  with check (org_id = (select auth_org_id()));
create policy "case_additional_costs update" on case_additional_costs for update to authenticated
  using (org_id = (select auth_org_id())) with check (org_id = (select auth_org_id()));
create policy "case_additional_costs delete" on case_additional_costs for delete to authenticated
  using (org_id = (select auth_org_id()));

-- profiles: read your own org's team only; org admins update within the org and
-- can never re-home a row into another org (WITH CHECK pins org_id). Still no
-- insert policy (rows come from handle_new_user) and no delete policy (removal
-- cascades from auth.users via the service-role admin API).
create policy "profiles read" on profiles for select to authenticated
  using (org_id = (select auth_org_id()));
create policy "profiles admin write" on profiles for update to authenticated
  using (org_id = (select auth_org_id()) and is_admin())
  with check (org_id = (select auth_org_id()));

-- ========== 4. quote_items: org SELECT for staff + column-level cost lock ==========
create policy "quote_items read" on quote_items for select to authenticated
  using (org_id = (select auth_org_id()));
create policy "quote_items insert" on quote_items for insert to authenticated
  with check (org_id = (select auth_org_id()) and is_admin());
create policy "quote_items update" on quote_items for update to authenticated
  using (org_id = (select auth_org_id()) and is_admin())
  with check (org_id = (select auth_org_id()) and is_admin());
create policy "quote_items delete" on quote_items for delete to authenticated
  using (org_id = (select auth_org_id()) and is_admin());

-- `cost` is internal margin data: no cookie-client path may read it. Admin cost
-- reads/writes go through the service-role actions in lib/actions/cases.ts,
-- which are unaffected. quote_items_public (security_invoker) selects only the
-- granted columns, so it now returns rows for agents again.
-- ⚠️ Future quote_items columns must be added to this grant list to be
-- readable outside the service role.
revoke select on quote_items from authenticated;
grant select (id, case_id, org_id, kind, description, price, sort_order, created_at)
  on quote_items to authenticated;

-- ========== 5. Finance RPCs: explicit org parameter ==========
-- SECURITY DEFINER + execute revoked from user roles: RLS cannot scope these,
-- so the org filter is a parameter passed by the (service-role) caller in
-- lib/data/finance.ts. Dropped-then-created because the signature changes.
drop function if exists finance_case_rows();
drop function if exists finance_case_rows(uuid);
create function finance_case_rows(p_org uuid)
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
    where org_id = p_org
    group by case_id
  ),
  coll as (
    select case_id, sum(amount_case) as collected
    from payments
    where org_id = p_org and direction = 'in' and status = 'paid'
    group by case_id
  ),
  paid as (
    select case_id, sum(amount_case) as paid_out
    from payments
    where org_id = p_org and direction = 'out' and status = 'paid'
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
  left join patients p on p.id = c.patient_id and p.org_id = p_org
  left join operation_types ot on ot.id = c.operation_type_id and ot.org_id = p_org
  left join hospitals h on h.id = c.hospital_id and h.org_id = p_org
  left join doctors d on d.id = c.doctor_id and d.org_id = p_org
  left join countries co on co.id = p.country_id and co.org_id = p_org
  left join rev on rev.case_id = c.id
  left join coll on coll.case_id = c.id
  left join paid on paid.case_id = c.id
  where c.org_id = p_org and c.status <> 'cancelled'
  order by c.created_at desc;
$$;

revoke execute on function finance_case_rows(uuid) from public, anon, authenticated;

drop function if exists finance_payment_rows();
drop function if exists finance_payment_rows(uuid);
create function finance_payment_rows(p_org uuid)
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
  join cases c on c.id = pay.case_id and c.org_id = p_org
  left join patients p  on p.id  = c.patient_id and p.org_id = p_org
  left join hospitals h on h.id  = pay.counterparty_id and pay.counterparty_type = 'hospital' and h.org_id = p_org
  left join doctors d   on d.id  = pay.counterparty_id and pay.counterparty_type = 'doctor' and d.org_id = p_org
  left join hotels ht   on ht.id = pay.counterparty_id and pay.counterparty_type = 'hotel' and ht.org_id = p_org
  left join drivers dr  on dr.id = pay.counterparty_id and pay.counterparty_type = 'driver' and dr.org_id = p_org
  where pay.org_id = p_org and c.status <> 'cancelled'
  order by coalesce(pay.paid_at, pay.due_date) desc nulls last, pay.created_at desc;
$$;

revoke execute on function finance_payment_rows(uuid) from public, anon, authenticated;
