-- GBP currency + hospital check-in/out on cases
alter type currency_code add value if not exists 'GBP';

alter table cases
  add column if not exists hospital_checkin date,
  add column if not exists hospital_checkout date;
