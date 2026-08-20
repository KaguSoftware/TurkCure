-- Multi-tenancy step 1 of 3: organizations, org_id everywhere, integrity rails.
--
-- ⚠️ Apply by hand (SQL editor), BEFORE 0024/0025 and before deploying the
-- org-aware app code. Rollout order (see also scripts/backfill-org-claims.mjs):
--   0023 → backfill-org-claims.mjs → 0024 → deploy code →
--   migrate-storage-org-prefix.mjs → 0025.
--
-- Design notes, in the order they matter:
--
-- * This file adds tenancy WITHOUT touching any existing RLS policy — after
--   0023 alone the currently-deployed app keeps working end to end. Isolation
--   arrives in 0024. The one known window-break: the old inviteUser sets no
--   app_metadata, so the rewritten handle_new_user() rejects invites (loudly)
--   until the new code deploys. Accepted — invites are rare.
--
-- * Org identity is read through auth_org_id(): the server-set JWT claim
--   app_metadata.org_id when present (zero DB work — preserves the
--   auth-is-cheap doctrine and is the only predicate storage policies can
--   afford), with a COALESCE fallback to the caller's profiles row. The
--   fallback is load-bearing twice over: it covers every session token minted
--   before the claims backfill, and it lets the function serve as the org_id
--   COLUMN DEFAULT so cookie/browser-client inserts from the old code
--   self-stamp correctly the moment this file is applied. app_metadata is
--   writable only through the service-role admin API — user-forgeable
--   user_metadata is never consulted.
--
-- * Child-table correctness is layered three deep, because the admin client
--   bypasses RLS and one forgotten stamp must not become a silent cross-tenant
--   row: (1) the column default stamps user-context inserts; (2) a BEFORE
--   INSERT trigger derives org_id from the parent row for service-role inserts
--   that don't provide it (this is what keeps the already-deployed admin-client
--   quote_items writes correct between applying this file and deploying);
--   (3) composite FKs (fk_col, org_id) → parent(id, org_id) make a child whose
--   org disagrees with its parent's UNREPRESENTABLE, no matter which client
--   wrote it. Set-null FKs use the PG15 column-list form so a parent delete
--   nulls only the reference and never the org.
--
-- * is_super is a boolean on profiles, deliberately NOT a user_role value:
--   user_role feeds is_admin() and ~15 policies, and the platform owner must
--   not implicitly become an org-data admin everywhere. Super powers exist only
--   behind service-role server actions (requireSuperAdmin()); RLS never
--   mentions them.

-- ========== 1. Organizations ==========
create table if not exists organizations (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  slug       text not null unique,
  plan       text not null default 'free',   -- placeholder until billing exists
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  -- Branding. Explicit columns (not jsonb): the write action validates each
  -- field, and "defaults-are-literal" comparisons (see src/lib/pdf/theme.ts)
  -- need honest per-column defaults.
  logo_url         text,
  company_name     text not null default '',  -- printed on PDFs; may differ from name
  whatsapp         text not null default '',
  website          text not null default '',  -- display form ("Example.com")
  url              text not null default '',  -- link form ("https://example.com")
  location         text not null default '',
  address          text not null default '',  -- PDF footer postal address
  tagline          text not null default 'Health Tourism',
  brand_primary    text not null default '#1d59d6'
    constraint organizations_brand_primary_hex check (brand_primary ~ '^#[0-9a-fA-F]{6}$'),
  pdf_cover_bg     text not null default '#0b1f3f'
    constraint organizations_pdf_cover_bg_hex check (pdf_cover_bg ~ '^#[0-9a-fA-F]{6}$'),
  pdf_cover_accent text not null default '#c9a24b'
    constraint organizations_pdf_cover_accent_hex check (pdf_cover_accent ~ '^#[0-9a-fA-F]{6}$')
);

alter table organizations enable row level security;

-- The existing company becomes the first org; everything below backfills to it.
insert into organizations (name, slug) values ('TurkCure', 'turkcure')
  on conflict (slug) do nothing;

-- Its branding = the values hardcoded in the app today (src/lib/pdf/company.ts),
-- so the generated PDFs are byte-identical before and after the cutover.
update organizations set
  company_name = 'Turkcure Health Tourism',
  whatsapp     = '+90 552 112 99 52',
  website      = 'Turkcure.com',
  url          = 'https://turkcure.com',
  location     = 'Skyland, Istanbul',
  address      = 'Huzur, Azerbaycan Cd. B Blok No:48, 34475 Sarıyer/İstanbul',
  tagline      = 'Health Tourism · Istanbul'
where slug = 'turkcure' and company_name = '';

-- ========== 2. org_id on every tenant table (backfill, then NOT NULL) ==========
-- No column default yet — auth_org_id() is created in step 3 (a SQL-language
-- function body is validated at creation, so profiles.org_id must exist first).
do $$
declare
  v_org uuid;
  t text;
begin
  select id into v_org from organizations where slug = 'turkcure';
  foreach t in array array[
    'profiles','countries','hospitals','doctors','hotels','drivers',
    'operation_types','instruction_templates','patients','cases','quote_items',
    'payments','reminders','patient_files','case_instructions',
    'case_additional_costs','case_documents'
  ]
  loop
    execute format('alter table %I add column if not exists org_id uuid references organizations(id)', t);
    execute format('update %I set org_id = $1 where org_id is null', t) using v_org;
    execute format('alter table %I alter column org_id set not null', t);
  end loop;
end $$;

-- ========== 3. auth_org_id() ==========
create or replace function auth_org_id()
returns uuid
language sql stable
security definer set search_path = public
as $$
  select coalesce(
    nullif(coalesce(auth.jwt()->'app_metadata'->>'org_id', ''), '')::uuid,
    (select org_id from profiles where id = auth.uid())
  );
$$;

grant execute on function auth_org_id() to authenticated;

-- Members can read their own org row (branding etc.); all writes are
-- service-role only — there deliberately are no insert/update/delete policies.
drop policy if exists "organizations member read" on organizations;
create policy "organizations member read" on organizations
  for select to authenticated using (id = (select auth_org_id()));

-- ========== 4. Column defaults (self-stamp for user-context inserts) ==========
-- profiles is excluded: its rows come only from handle_new_user(), which
-- stamps org_id explicitly (auth.uid() is not the new user during signup).
do $$
declare t text;
begin
  foreach t in array array[
    'countries','hospitals','doctors','hotels','drivers',
    'operation_types','instruction_templates','patients','cases','quote_items',
    'payments','reminders','patient_files','case_instructions',
    'case_additional_costs','case_documents'
  ]
  loop
    execute format('alter table %I alter column org_id set default auth_org_id()', t);
  end loop;
end $$;

-- ========== 5. unique (id, org_id) on FK-referenced parents ==========
do $$
declare t text;
begin
  foreach t in array array[
    'patients','cases','profiles','hospitals','doctors','hotels','drivers',
    'countries','operation_types','instruction_templates'
  ]
  loop
    if not exists (select 1 from pg_constraint where conname = t || '_id_org_uq') then
      execute format('alter table %I add constraint %I unique (id, org_id)', t, t || '_id_org_uq');
    end if;
  end loop;
end $$;

-- ========== 6. Composite-FK rework ==========
-- Same delete behavior as before; org_id joins the key so parent and child can
-- never disagree. MATCH SIMPLE means a null fk_col still opts out of the check,
-- exactly like the single-column FKs did.
do $$
declare r record;
begin
  for r in
    select * from (values
      -- (table, old constraint, new constraint, fk column, parent, on delete)
      ('cases','cases_patient_id_fkey','cases_patient_org_fkey','patient_id','patients','cascade'),
      ('cases','cases_operation_type_id_fkey','cases_operation_type_org_fkey','operation_type_id','operation_types','setnull'),
      ('cases','cases_doctor_id_fkey','cases_doctor_org_fkey','doctor_id','doctors','setnull'),
      ('cases','cases_hospital_id_fkey','cases_hospital_org_fkey','hospital_id','hospitals','setnull'),
      ('cases','cases_hotel_id_fkey','cases_hotel_org_fkey','hotel_id','hotels','setnull'),
      ('cases','cases_driver_id_fkey','cases_driver_org_fkey','driver_id','drivers','setnull'),
      ('doctors','doctors_hospital_id_fkey','doctors_hospital_org_fkey','hospital_id','hospitals','setnull'),
      ('instruction_templates','instruction_templates_operation_type_id_fkey','instruction_templates_operation_type_org_fkey','operation_type_id','operation_types','setnull'),
      ('patients','patients_country_id_fkey','patients_country_org_fkey','country_id','countries','setnull'),
      ('patients','patients_assigned_agent_id_fkey','patients_assigned_agent_org_fkey','assigned_agent_id','profiles','setnull'),
      ('quote_items','quote_items_case_id_fkey','quote_items_case_org_fkey','case_id','cases','cascade'),
      ('payments','payments_case_id_fkey','payments_case_org_fkey','case_id','cases','cascade'),
      ('reminders','reminders_patient_id_fkey','reminders_patient_org_fkey','patient_id','patients','cascade'),
      ('reminders','reminders_case_id_fkey','reminders_case_org_fkey','case_id','cases','cascade'),
      ('reminders','reminders_assigned_to_fkey','reminders_assigned_to_org_fkey','assigned_to','profiles','setnull'),
      ('patient_files','patient_files_patient_id_fkey','patient_files_patient_org_fkey','patient_id','patients','cascade'),
      ('patient_files','patient_files_uploaded_by_fkey','patient_files_uploaded_by_org_fkey','uploaded_by','profiles','setnull'),
      ('case_instructions','case_instructions_case_id_fkey','case_instructions_case_org_fkey','case_id','cases','cascade'),
      ('case_instructions','case_instructions_template_id_fkey','case_instructions_template_org_fkey','template_id','instruction_templates','setnull'),
      ('case_additional_costs','case_additional_costs_case_id_fkey','case_additional_costs_case_org_fkey','case_id','cases','cascade'),
      ('case_documents','case_documents_case_id_fkey','case_documents_case_org_fkey','case_id','cases','cascade')
    ) as v(tbl, old_name, new_name, fk_col, parent, action)
  loop
    execute format('alter table %I drop constraint if exists %I', r.tbl, r.old_name);
    if not exists (select 1 from pg_constraint where conname = r.new_name) then
      if r.action = 'cascade' then
        execute format(
          'alter table %I add constraint %I foreign key (%I, org_id) references %I (id, org_id) on delete cascade',
          r.tbl, r.new_name, r.fk_col, r.parent);
      else
        execute format(
          'alter table %I add constraint %I foreign key (%I, org_id) references %I (id, org_id) on delete set null (%I)',
          r.tbl, r.new_name, r.fk_col, r.parent, r.fk_col);
      end if;
    end if;
  end loop;
end $$;

-- ========== 7. Derive trigger for service-role child inserts ==========
-- Column defaults run before triggers: a cookie-client insert arrives here with
-- org_id already stamped and returns immediately; a service-role insert (no JWT
-- → auth_org_id() = null) derives from its parent row. The composite FKs above
-- verify the result either way.
create or replace function set_org_from_parent()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  i int := 0;
  fk_val uuid;
  parent_org uuid;
begin
  if new.org_id is not null then
    return new;
  end if;
  while i < tg_nargs loop
    fk_val := (to_jsonb(new) ->> tg_argv[i + 1])::uuid;
    if fk_val is not null then
      execute format('select org_id from %I where id = $1', tg_argv[i]) into parent_org using fk_val;
      if parent_org is not null then
        new.org_id := parent_org;
        return new;
      end if;
    end if;
    i := i + 2;
  end loop;
  new.org_id := auth_org_id();
  return new;
end;
$$;

do $$
declare r record;
begin
  for r in
    select * from (values
      ('cases',                 'trg_cases_org',                 'patients,patient_id'),
      ('quote_items',           'trg_quote_items_org',           'cases,case_id'),
      ('payments',              'trg_payments_org',              'cases,case_id'),
      ('case_instructions',     'trg_case_instructions_org',     'cases,case_id'),
      ('case_additional_costs', 'trg_case_additional_costs_org', 'cases,case_id'),
      ('case_documents',        'trg_case_documents_org',        'cases,case_id'),
      ('patient_files',         'trg_patient_files_org',         'patients,patient_id'),
      ('reminders',             'trg_reminders_org',             'cases,case_id,patients,patient_id')
    ) as v(tbl, trg, args)
  loop
    execute format('drop trigger if exists %I on %I', r.trg, r.tbl);
    execute format(
      'create trigger %I before insert on %I for each row execute function set_org_from_parent(%s)',
      r.trg, r.tbl,
      (select string_agg(quote_literal(a), ', ') from unnest(string_to_array(r.args, ',')) a));
  end loop;
end $$;

-- ========== 8. Per-org uniqueness (was global) ==========
alter table countries drop constraint if exists countries_name_key;
alter table operation_types drop constraint if exists operation_types_name_key;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'countries_org_name_uq') then
    alter table countries add constraint countries_org_name_uq unique (org_id, name);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'operation_types_org_name_uq') then
    alter table operation_types add constraint operation_types_org_name_uq unique (org_id, name);
  end if;
end $$;

-- ========== 9. Indexes ==========
-- Hot per-org composites replace the old single-column versions; small
-- directory/child tables get a plain org_id btree (also serves the 0024 RLS
-- predicate). payments(due_date) stays GLOBAL — the cron sweeps every org.
drop index if exists patients_status_idx;
create index if not exists patients_org_status_idx on patients(org_id, status);
drop index if exists patients_created_at_idx;
create index if not exists patients_org_created_idx on patients(org_id, created_at desc);
drop index if exists cases_arrival_date_idx;
create index if not exists cases_org_arrival_idx on cases(org_id, arrival_date);
drop index if exists reminders_due_idx;
create index if not exists reminders_org_due_idx on reminders(org_id, due_at) where done_at is null;
-- Cron idempotency-marker lookups (payment:<uuid> in note) stay indexed.
create index if not exists reminders_payment_note_idx on reminders(note) where type = 'payment';

do $$
declare t text;
begin
  foreach t in array array[
    'profiles','hospitals','doctors','hotels','drivers','instruction_templates',
    'quote_items','payments','patient_files','case_instructions',
    'case_additional_costs','case_documents'
  ]
  loop
    execute format('create index if not exists %I on %I (org_id)', t || '_org_idx', t);
  end loop;
end $$;

-- ========== 10. handle_new_user(): org + role from app_metadata only ==========
-- raw_app_meta_data is writable solely via the service-role admin API, so the
-- role can no longer be forged through signup metadata (raw_user_meta_data is
-- user-writable and now supplies only the display name). A user created without
-- an org is a platform bug — reject it loudly.
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_org uuid;
begin
  v_org := nullif(coalesce(new.raw_app_meta_data->>'org_id', ''), '')::uuid;
  if v_org is null then
    raise exception 'no org_id in app_metadata for user % — create users via the app''s invite / organization flows', new.id;
  end if;
  insert into public.profiles (id, name, role, org_id)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    coalesce((new.raw_app_meta_data->>'role')::user_role, 'agent'),
    v_org
  );
  return new;
end;
$$;

-- ========== 11. Platform super-admin ==========
alter table profiles add column if not exists is_super boolean not null default false;

-- If this email has no auth user yet, this is a no-op: create the account
-- first, then re-run this one statement. Verify with
--   select count(*) from profiles where is_super;  -- expect 1
update profiles set is_super = true
where id in (select id from auth.users where lower(email) = 'parsaa.mansourii@gmail.com');

-- ========== 12. Per-org default data ==========
-- Replaces 0001's global seeds for every NEW org (existing TurkCure rows were
-- backfilled above and are untouched). Service-role only — called from the
-- createOrganization server action. Template copy is genericized ("your care
-- coordinator"); per-org branding beyond that lives in the organizations row.
create or replace function seed_org_defaults(p_org uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  insert into countries (org_id, name, code) values
    (p_org,'Germany','DE'),(p_org,'United Kingdom','GB'),(p_org,'Netherlands','NL'),
    (p_org,'France','FR'),(p_org,'United States','US'),(p_org,'Turkey','TR'),
    (p_org,'Austria','AT'),(p_org,'Switzerland','CH'),(p_org,'Belgium','BE'),
    (p_org,'Sweden','SE'),(p_org,'Norway','NO'),(p_org,'Denmark','DK'),
    (p_org,'Italy','IT'),(p_org,'Spain','ES'),(p_org,'United Arab Emirates','AE'),
    (p_org,'Saudi Arabia','SA'),(p_org,'Qatar','QA'),(p_org,'Kuwait','KW'),
    (p_org,'Ireland','IE'),(p_org,'Canada','CA'),(p_org,'Australia','AU')
  on conflict (org_id, name) do nothing;

  insert into operation_types (org_id, name, category, default_nights) values
    (p_org,'Hair Transplant (FUE)','Hair', 3),
    (p_org,'Hair Transplant (DHI)','Hair', 3),
    (p_org,'Beard Transplant','Hair', 2),
    (p_org,'Rhinoplasty','Face', 7),
    (p_org,'Facelift','Face', 7),
    (p_org,'Eyelid Surgery (Blepharoplasty)','Face', 5),
    (p_org,'Breast Augmentation','Body', 6),
    (p_org,'Breast Lift','Body', 6),
    (p_org,'Breast Reduction','Body', 6),
    (p_org,'Liposuction','Body', 5),
    (p_org,'Tummy Tuck (Abdominoplasty)','Body', 7),
    (p_org,'Brazilian Butt Lift (BBL)','Body', 6),
    (p_org,'Gastric Sleeve','Bariatric', 4),
    (p_org,'Gastric Balloon','Bariatric', 2),
    (p_org,'Dental Implants','Dental', 5),
    (p_org,'Dental Veneers','Dental', 5),
    (p_org,'Smile Makeover','Dental', 7)
  on conflict (org_id, name) do nothing;

  insert into instruction_templates (org_id, operation_type_id, title, body_md)
  select p_org, ot.id, t.title, t.body_md
  from (values
    ('Hair Transplant (FUE)',
     'Hair Transplant — Aftercare Instructions',
     E'## Before your operation\n- Stop smoking and alcohol at least 48 hours before surgery.\n- Do not take aspirin or blood thinners for 7 days prior (consult your doctor).\n- Wash your hair the morning of the procedure; do not apply any products.\n\n## After your operation\n- Sleep with your head elevated at 45° for the first 3 nights.\n- Do not touch, scratch or wash the transplanted area for 48 hours.\n- First wash will be performed at the clinic — follow the demonstrated technique for 10 days.\n- Avoid direct sunlight, swimming, sauna and heavy exercise for 4 weeks.\n- Slight redness and scab formation is normal and resolves within 7–10 days.\n\n## When to contact us\nContact your care coordinator immediately if you experience severe pain, fever, or unusual swelling.'),
    ('Rhinoplasty',
     'Rhinoplasty — Aftercare Instructions',
     E'## Before your operation\n- Fast (no food or drink) for 8 hours before surgery.\n- Stop smoking at least 2 weeks before surgery for optimal healing.\n\n## After your operation\n- Keep the splint dry; it will be removed at your follow-up appointment (day 7).\n- Sleep on your back with your head elevated for 2 weeks.\n- Do not blow your nose for 3 weeks; sneeze with your mouth open.\n- Avoid glasses resting on the nose for 6 weeks.\n- Swelling and bruising around the eyes is normal and subsides in 10–14 days.\n\n## When to contact us\nContact your care coordinator immediately if you experience heavy bleeding, fever, or breathing difficulty.'),
    ('Dental Implants',
     'Dental Implants — Aftercare Instructions',
     E'## Before your treatment\n- Eat a normal meal before your appointment.\n- Continue regular medications unless instructed otherwise.\n\n## After your treatment\n- Bite gently on the gauze for 30–45 minutes to control bleeding.\n- Apply ice packs to the cheek in 15-minute intervals for the first day.\n- Eat soft, cool foods for 48 hours; avoid hot drinks the first day.\n- Do not smoke for at least 72 hours — smoking is the leading cause of implant failure.\n- Rinse gently with warm salt water from day 2, three times daily.\n\n## When to contact us\nContact your care coordinator if bleeding persists beyond 24 hours or pain worsens after day 3.')
  ) as t(op_name, title, body_md)
  left join operation_types ot on ot.org_id = p_org and ot.name = t.op_name
  where not exists (
    select 1 from instruction_templates it
    where it.org_id = p_org and it.title = t.title
  );
end;
$$;

revoke execute on function seed_org_defaults(uuid) from public, anon, authenticated;
