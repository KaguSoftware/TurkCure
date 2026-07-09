-- Fields needed for the WOF (Treatment & Reservation Confirmation) PDF
alter table patients add column if not exists passport_number text not null default '';

alter table cases
  add column if not exists airport text not null default '',
  add column if not exists airport_pickup text not null default '';

-- Images attached to case instructions (storage paths in the patient-files bucket)
alter table case_instructions add column if not exists image_paths text[] not null default '{}';
