-- TurkCure internal system — initial schema
-- Run this in the Supabase SQL editor (or `supabase db push`).

-- ========== Enums ==========
create type user_role as enum ('admin', 'agent');
create type patient_status as enum ('lead', 'interested', 'booked', 'treated', 'aftercare', 'lost');
create type currency_code as enum ('EUR', 'USD', 'TRY');
create type quote_item_kind as enum ('surgery', 'hotel', 'transfer', 'extra');
create type payment_direction as enum ('in', 'out');
create type counterparty_type as enum ('patient', 'hotel', 'doctor', 'hospital', 'driver');
create type payment_status as enum ('pending', 'partial', 'paid');
create type reminder_type as enum ('follow_up', 'arrival', 'operation', 'payment', 'aftercare');
create type case_status as enum ('planning', 'confirmed', 'in_progress', 'completed', 'cancelled');

-- ========== Profiles ==========
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null default '',
  role user_role not null default 'agent',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Auto-create profile on signup (role/name can come from invite metadata)
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    coalesce((new.raw_user_meta_data->>'role')::user_role, 'agent')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

create or replace function is_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from profiles where id = auth.uid() and role = 'admin' and active
  );
$$;

-- ========== Directories ==========
create table countries (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  code text not null default ''
);

create table hospitals (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  city text not null default '',
  contact text not null default '',
  notes text not null default '',
  created_at timestamptz not null default now()
);

create table doctors (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  specialty text not null default '',
  hospital_id uuid references hospitals(id) on delete set null,
  contact text not null default '',
  notes text not null default '',
  created_at timestamptz not null default now()
);

create table hotels (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  city text not null default '',
  stars int,
  contact text not null default '',
  notes text not null default '',
  created_at timestamptz not null default now()
);

create table drivers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text not null default '',
  vehicle text not null default '',
  notes text not null default '',
  created_at timestamptz not null default now()
);

create table operation_types (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  category text not null default '',
  default_nights int not null default 0
);

create table instruction_templates (
  id uuid primary key default gen_random_uuid(),
  operation_type_id uuid references operation_types(id) on delete set null,
  title text not null,
  body_md text not null default '',
  language text not null default 'en',
  created_at timestamptz not null default now()
);

-- ========== Patients ==========
create table patients (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  email text not null default '',
  phone text not null default '',
  date_of_birth date,
  gender text not null default '',
  country_id uuid references countries(id) on delete set null,
  source text not null default '',
  status patient_status not null default 'lead',
  assigned_agent_id uuid references profiles(id) on delete set null,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index patients_status_idx on patients(status);
create index patients_agent_idx on patients(assigned_agent_id);

-- ========== Cases ==========
create table cases (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients(id) on delete cascade,
  operation_type_id uuid references operation_types(id) on delete set null,
  doctor_id uuid references doctors(id) on delete set null,
  hospital_id uuid references hospitals(id) on delete set null,
  hotel_id uuid references hotels(id) on delete set null,
  driver_id uuid references drivers(id) on delete set null,
  arrival_date date,
  surgery_date date,
  departure_date date,
  currency currency_code not null default 'EUR',
  status case_status not null default 'planning',
  notes text not null default '',
  created_at timestamptz not null default now()
);
create index cases_patient_idx on cases(patient_id);

create table quote_items (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references cases(id) on delete cascade,
  kind quote_item_kind not null default 'extra',
  description text not null,
  cost numeric(12,2) not null default 0,  -- internal, admin-only
  price numeric(12,2) not null default 0, -- patient-facing
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
create index quote_items_case_idx on quote_items(case_id);

-- Agent-safe view (no cost column)
create view quote_items_public with (security_invoker = true) as
  select id, case_id, kind, description, price, sort_order, created_at
  from quote_items;

-- ========== Payments ==========
create table payments (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references cases(id) on delete cascade,
  direction payment_direction not null,
  counterparty_type counterparty_type not null,
  counterparty_id uuid, -- id in the matching directory table (null for patient = case's patient)
  amount numeric(12,2) not null,
  currency currency_code not null default 'EUR',
  method text not null default '',
  iban text not null default '',
  due_date date,
  paid_at date,
  status payment_status not null default 'pending',
  receipt_path text not null default '',
  notes text not null default '',
  created_at timestamptz not null default now()
);
create index payments_case_idx on payments(case_id);
create index payments_status_idx on payments(status);

-- ========== Reminders ==========
create table reminders (
  id uuid primary key default gen_random_uuid(),
  type reminder_type not null default 'follow_up',
  patient_id uuid references patients(id) on delete cascade,
  case_id uuid references cases(id) on delete cascade,
  title text not null,
  note text not null default '',
  due_at timestamptz not null,
  assigned_to uuid references profiles(id) on delete set null,
  done_at timestamptz,
  created_at timestamptz not null default now()
);
create index reminders_due_idx on reminders(due_at) where done_at is null;

-- ========== Files ==========
create table patient_files (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients(id) on delete cascade,
  storage_path text not null,
  label text not null default '',
  uploaded_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

-- ========== Case instructions (template snapshot) ==========
create table case_instructions (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references cases(id) on delete cascade,
  template_id uuid references instruction_templates(id) on delete set null,
  title text not null,
  body_md text not null default '',
  created_at timestamptz not null default now()
);

-- ========== RLS ==========
alter table profiles enable row level security;
alter table countries enable row level security;
alter table hospitals enable row level security;
alter table doctors enable row level security;
alter table hotels enable row level security;
alter table drivers enable row level security;
alter table operation_types enable row level security;
alter table instruction_templates enable row level security;
alter table patients enable row level security;
alter table cases enable row level security;
alter table quote_items enable row level security;
alter table payments enable row level security;
alter table reminders enable row level security;
alter table patient_files enable row level security;
alter table case_instructions enable row level security;

-- Profiles: everyone authenticated can read; only admins mutate
create policy "profiles read" on profiles for select to authenticated using (true);
create policy "profiles admin write" on profiles for update to authenticated using (is_admin());

-- Shared helper macro pattern: authenticated read/write for staff tables
do $$
declare t text;
begin
  foreach t in array array[
    'countries','hospitals','doctors','hotels','drivers',
    'operation_types','instruction_templates','patients','cases',
    'reminders','patient_files','case_instructions'
  ]
  loop
    execute format('create policy "%s read" on %I for select to authenticated using (true)', t, t);
    execute format('create policy "%s insert" on %I for insert to authenticated with check (true)', t, t);
    execute format('create policy "%s update" on %I for update to authenticated using (true)', t, t);
    execute format('create policy "%s delete" on %I for delete to authenticated using (is_admin())', t, t);
  end loop;
end $$;

-- Quote items: read for all staff via view; direct table access admin-only for cost safety.
-- Agents can still insert/update items through server actions (service role) which strip cost handling.
create policy "quote_items admin all" on quote_items for all to authenticated
  using (is_admin()) with check (is_admin());

-- Payments: admins full access; agents can read/insert but not delete
create policy "payments read" on payments for select to authenticated using (true);
create policy "payments insert" on payments for insert to authenticated with check (true);
create policy "payments update" on payments for update to authenticated using (true);
create policy "payments delete" on payments for delete to authenticated using (is_admin());

-- ========== Storage buckets ==========
insert into storage.buckets (id, name, public) values
  ('patient-files', 'patient-files', false),
  ('receipts', 'receipts', false);

create policy "staff read files" on storage.objects for select to authenticated
  using (bucket_id in ('patient-files','receipts'));
create policy "staff upload files" on storage.objects for insert to authenticated
  with check (bucket_id in ('patient-files','receipts'));
create policy "admin delete files" on storage.objects for delete to authenticated
  using (bucket_id in ('patient-files','receipts') and is_admin());

-- ========== Seed data ==========
insert into countries (name, code) values
  ('Germany','DE'),('United Kingdom','GB'),('Netherlands','NL'),('France','FR'),
  ('United States','US'),('Turkey','TR'),('Austria','AT'),('Switzerland','CH'),
  ('Belgium','BE'),('Sweden','SE'),('Norway','NO'),('Denmark','DK'),
  ('Italy','IT'),('Spain','ES'),('United Arab Emirates','AE'),('Saudi Arabia','SA'),
  ('Qatar','QA'),('Kuwait','KW'),('Ireland','IE'),('Canada','CA'),('Australia','AU');

insert into operation_types (name, category, default_nights) values
  ('Hair Transplant (FUE)','Hair', 3),
  ('Hair Transplant (DHI)','Hair', 3),
  ('Beard Transplant','Hair', 2),
  ('Rhinoplasty','Face', 7),
  ('Facelift','Face', 7),
  ('Eyelid Surgery (Blepharoplasty)','Face', 5),
  ('Breast Augmentation','Body', 6),
  ('Breast Lift','Body', 6),
  ('Breast Reduction','Body', 6),
  ('Liposuction','Body', 5),
  ('Tummy Tuck (Abdominoplasty)','Body', 7),
  ('Brazilian Butt Lift (BBL)','Body', 6),
  ('Gastric Sleeve','Bariatric', 4),
  ('Gastric Balloon','Bariatric', 2),
  ('Dental Implants','Dental', 5),
  ('Dental Veneers','Dental', 5),
  ('Smile Makeover','Dental', 7);

insert into instruction_templates (operation_type_id, title, body_md) values
  ((select id from operation_types where name = 'Hair Transplant (FUE)'),
   'Hair Transplant — Aftercare Instructions',
   E'## Before your operation\n- Stop smoking and alcohol at least 48 hours before surgery.\n- Do not take aspirin or blood thinners for 7 days prior (consult your doctor).\n- Wash your hair the morning of the procedure; do not apply any products.\n\n## After your operation\n- Sleep with your head elevated at 45° for the first 3 nights.\n- Do not touch, scratch or wash the transplanted area for 48 hours.\n- First wash will be performed at the clinic — follow the demonstrated technique for 10 days.\n- Avoid direct sunlight, swimming, sauna and heavy exercise for 4 weeks.\n- Slight redness and scab formation is normal and resolves within 7–10 days.\n\n## When to contact us\nContact your TurkCure coordinator immediately if you experience severe pain, fever, or unusual swelling.'),
  ((select id from operation_types where name = 'Rhinoplasty'),
   'Rhinoplasty — Aftercare Instructions',
   E'## Before your operation\n- Fast (no food or drink) for 8 hours before surgery.\n- Stop smoking at least 2 weeks before surgery for optimal healing.\n\n## After your operation\n- Keep the splint dry; it will be removed at your follow-up appointment (day 7).\n- Sleep on your back with your head elevated for 2 weeks.\n- Do not blow your nose for 3 weeks; sneeze with your mouth open.\n- Avoid glasses resting on the nose for 6 weeks.\n- Swelling and bruising around the eyes is normal and subsides in 10–14 days.\n\n## When to contact us\nContact your TurkCure coordinator immediately if you experience heavy bleeding, fever, or breathing difficulty.'),
  ((select id from operation_types where name = 'Dental Implants'),
   'Dental Implants — Aftercare Instructions',
   E'## Before your treatment\n- Eat a normal meal before your appointment.\n- Continue regular medications unless instructed otherwise.\n\n## After your treatment\n- Bite gently on the gauze for 30–45 minutes to control bleeding.\n- Apply ice packs to the cheek in 15-minute intervals for the first day.\n- Eat soft, cool foods for 48 hours; avoid hot drinks the first day.\n- Do not smoke for at least 72 hours — smoking is the leading cause of implant failure.\n- Rinse gently with warm salt water from day 2, three times daily.\n\n## When to contact us\nContact your TurkCure coordinator if bleeding persists beyond 24 hours or pain worsens after day 3.');
