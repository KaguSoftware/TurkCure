-- Categories for patient files.
-- The Files tab was one flat list, so a passport scan and a medical report were
-- indistinguishable without reading filenames. Text + check (rather than a PG
-- enum) so the list can grow later without a non-transactional `alter type`.
-- Existing rows land in 'other' — they predate the distinction, and forcing them
-- into 'reports' would assert something we don't know.
-- (Hand-applied — the owner runs this.)

alter table patient_files
  add column if not exists category text not null default 'other';

alter table patient_files
  drop constraint if exists patient_files_category_check;

alter table patient_files
  add constraint patient_files_category_check
  check (category in ('reports', 'passport', 'other'));

-- The tab reads one patient's files and groups by category, newest first.
create index if not exists patient_files_patient_category_idx
  on patient_files(patient_id, category, created_at desc);
