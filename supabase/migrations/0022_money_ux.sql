-- Money-UX rebuild support. Two fixes, no shape changes — the PDF and
-- finance_case_rows() contracts pin quote_items / payments / case_additional_costs.

-- 1) Fix a silent no-op: agents' additional-cost deletes matched 0 rows under
--    the 0020 admin-only delete policy while the action (cookie client +
--    requireProfile) reported success — the optimistic UI removed the row and it
--    reappeared on refresh. Decision: extras are quote-drafting data, exactly
--    like quote_items (already agent-deletable via the service-role action), so
--    the policy aligns with reality. Deletes of the financial record proper
--    (payments, cases) stay admin-only.
drop policy "case_additional_costs delete" on case_additional_costs;
create policy "case_additional_costs delete" on case_additional_costs
  for delete to authenticated using (true);

-- 2) Normalize dead 'partial' rows. Status has long been derived server-side
--    (paid_at ⇒ paid, else pending) and 'partial' is never written; partial
--    payments are modelled as multiple rows. The enum value itself stays —
--    removing one requires rebuilding the type for no gain.
update payments set status = 'paid'    where status = 'partial' and paid_at is not null;
update payments set status = 'pending' where status = 'partial' and paid_at is null;
