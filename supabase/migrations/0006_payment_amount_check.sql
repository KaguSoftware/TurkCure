-- Guard against zero/negative payment amounts at the database level. The form
-- allowed amount 0 (Number(...) || 0) and the server did no validation.
alter table payments
  add constraint payments_amount_positive check (amount > 0);
