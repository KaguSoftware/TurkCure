-- Fix: user creation 500s since 0023 — make profile provisioning resilient.
--
-- ⚠️ Apply by hand / `npx supabase db push --linked`, after 0023–0025.
--
-- Symptom: EVERY auth.admin.createUser() call returns a bare 500 ("{}") —
-- including the app's invite flow and the platform createOrganization action.
-- Two compounding causes, both in 0023's handle_new_user():
--
--   1. It RAISEs when app_metadata carries no org_id. An exception in an
--      AFTER INSERT trigger on auth.users aborts GoTrue's transaction, which
--      surfaces as an opaque 500 for the whole signup — the "loud failure"
--      turned into "nobody can be created".
--   2. It assumes the custom app_metadata passed to admin.createUser is
--      visible on NEW at insert time. Depending on the GoTrue version, custom
--      app_metadata can land in a follow-up UPDATE — so even correct callers
--      hit the raise.
--
-- New shape: the INSERT trigger creates the profile only when the org claim
-- is already present, and otherwise does nothing; a companion AFTER UPDATE
-- trigger (guarded to metadata changes) creates the missing profile the
-- moment raw_app_meta_data gains org_id. A user that never receives an org
-- claim simply has no profile row — the app already treats that as
-- signed-out (requireProfile / the layout redirect), which is the safe
-- failure. This also makes the claims backfill self-healing: stamping
-- app_metadata on a profile-less user provisions their profile.

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
    -- No org claim yet: GoTrue may deliver custom app_metadata in a follow-up
    -- update (handled below). Never raise here — that bricks all signups.
    raise log 'handle_new_user: user % created without org_id; awaiting metadata', new.id;
    return new;
  end if;
  insert into public.profiles (id, name, role, org_id)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    coalesce((new.raw_app_meta_data->>'role')::user_role, 'agent'),
    v_org
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create or replace function handle_user_metadata_update()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_org uuid;
begin
  -- Only provision; never move an existing profile between orgs from here.
  if exists (select 1 from public.profiles where id = new.id) then
    return new;
  end if;
  v_org := nullif(coalesce(new.raw_app_meta_data->>'org_id', ''), '')::uuid;
  if v_org is null then
    return new;
  end if;
  insert into public.profiles (id, name, role, org_id)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    coalesce((new.raw_app_meta_data->>'role')::user_role, 'agent'),
    v_org
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_metadata_updated on auth.users;
create trigger on_auth_user_metadata_updated
  after update on auth.users
  for each row
  when (new.raw_app_meta_data is distinct from old.raw_app_meta_data)
  execute function handle_user_metadata_update();
