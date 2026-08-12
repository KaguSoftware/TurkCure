-- Additional costs: a per-case list of extras shown on the patient-facing PDF
-- beneath Payment Information, deliberately outside the quote.
--
-- Why a separate table and not quote_items:
--   * quote_items.price is summed into "Total package price" and drives the
--     remaining balance on the WOF (src/lib/pdf/case-doc.tsx).
--   * quote_items.price AND cost both feed finance_case_rows() (0019) as
--     revenue/cost, so a row landed there silently moves reported margin.
-- These rows must do neither: they are informational extras quoted alongside
-- the package and settled separately. A new table is the only way to keep both
-- invariants without adding a filter to every existing consumer.

create table if not exists case_additional_costs (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references cases(id) on delete cascade,
  title text not null default '',
  amount numeric(12,2) not null default 0,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists case_additional_costs_case_idx
  on case_additional_costs(case_id);

alter table case_additional_costs enable row level security;

-- quote_items is admin-only ("for cost safety", 0001) because of its cost
-- column. This table has no cost column and never reaches finance, so there is
-- nothing here an agent may not see: it follows the ordinary staff-table
-- convention from 0001 — authenticated read/insert/update, admin-only delete.
create policy "case_additional_costs read" on case_additional_costs
  for select to authenticated using (true);
create policy "case_additional_costs insert" on case_additional_costs
  for insert to authenticated with check (true);
create policy "case_additional_costs update" on case_additional_costs
  for update to authenticated using (true);
create policy "case_additional_costs delete" on case_additional_costs
  for delete to authenticated using (is_admin());
