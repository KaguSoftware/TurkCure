-- Editable case documents: the patient-facing PDF as an editable draft.
--
-- Until now `/api/pdf/<caseId>` rendered straight from the case record, so any
-- per-patient wording change meant editing the underlying data — or not making
-- it. This table stores a Tiptap JSON document per case that staff can edit and
-- then download, while the generated route keeps working untouched for every
-- case nobody edits.
--
-- Two JSONB columns, and the split is the point:
--   * `content`     — the editable document (Tiptap JSON, schema enforced
--                     client-side by Tiptap's own content check, not by PG).
--   * `source_data` — a frozen snapshot of the CaseDocData/PatientDocData the
--                     document was seeded from. It is what "reset to template"
--                     rebuilds from, and what recovers a draft whose `content`
--                     no longer parses. Without it a corrupt draft is
--                     unrecoverable.
--
-- (Hand-applied — the owner runs this. Queues behind 0020.)

create table if not exists case_documents (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references cases(id) on delete cascade,
  content jsonb not null,
  source_data jsonb not null,
  status text not null default 'draft'
    constraint case_documents_status_check check (status in ('draft', 'finalized')),
  finalized_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One document per case: the editor is reached from the case, so a second row
-- would be unreachable rather than useful.
create unique index if not exists case_documents_case_idx on case_documents(case_id);

alter table case_documents enable row level security;

-- The ordinary staff-table convention from 0001 — authenticated
-- read/insert/update, admin-only delete. Same call as case_additional_costs in
-- 0020: there is no cost column here and nothing that reaches finance.
create policy "case_documents read" on case_documents for select to authenticated using (true);
create policy "case_documents insert" on case_documents for insert to authenticated with check (true);
create policy "case_documents update" on case_documents for update to authenticated using (true);
create policy "case_documents delete" on case_documents for delete to authenticated using (is_admin());

-- Finalizing locks the document. Enforced in the DB rather than the UI because
-- this file gets sent to patients and hospitals: once someone has been told
-- "this is the agreed document", a later edit must not be able to rewrite it
-- silently through any client. Un-finalizing is equally blocked; the way back
-- is an admin delete and a fresh draft.
create or replace function guard_case_document_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- The service role and superusers bypass the lock, so a migration or an
  -- admin script is never trapped by it.
  if coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb->>'role' = 'service_role'
     or current_user in ('postgres', 'supabase_admin') then
    return new;
  end if;

  if old.status = 'finalized' then
    if new.status is distinct from 'finalized'
       or new.content is distinct from old.content
       or new.source_data is distinct from old.source_data then
      raise exception 'This document is finalized and can no longer be edited.';
    end if;
  end if;

  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_case_documents_guard on case_documents;
create trigger trg_case_documents_guard
  before update on case_documents
  for each row execute function guard_case_document_update();
