-- Multi-tenancy step 3 of 3: org-scoped storage.
--
-- ⚠️ Apply by hand, LAST — after 0023/0024, after the new app code is deployed,
-- and after scripts/migrate-storage-org-prefix.mjs has moved every existing
-- object under its org prefix (this file makes un-prefixed paths unreachable
-- for user clients; the service role is unaffected).
--
-- The old policies scoped on bucket_id alone — any authenticated user could
-- read ANY patient file or receipt. Object paths now lead with the org id
-- (`<org_id>/…`), and every policy pins folder 1 to the caller's org via the
-- JWT-claim helper from 0023 (storage policies run on every request; a
-- DB-join predicate here would be per-object work, and no covering row exists
-- yet for staged receipt uploads).
--
-- Also fixed while here:
-- * UPDATE policies now exist (upload with upsert issues UPDATE; previously it
--   had no policy at all and failed closed).
-- * DELETE relaxes from admin-only to admin-or-owner: four browser-side
--   removals (replaced/rolled-back receipts in payment-dialog.tsx, file delete
--   in files-tab.tsx, instruction-image delete in instructions-tab.tsx) have
--   been silently no-opping for agents and orphaning objects. `owner`/
--   `owner_id` is stamped by storage on authenticated uploads.

-- ========== patient-files + receipts (private buckets) ==========
drop policy if exists "staff read files" on storage.objects;
drop policy if exists "staff upload files" on storage.objects;
drop policy if exists "admin delete files" on storage.objects;
drop policy if exists "staff update files" on storage.objects;
drop policy if exists "staff delete files" on storage.objects;

create policy "staff read files" on storage.objects for select to authenticated
  using (
    bucket_id in ('patient-files','receipts')
    and (storage.foldername(name))[1] = (select auth_org_id()::text)
  );

create policy "staff upload files" on storage.objects for insert to authenticated
  with check (
    bucket_id in ('patient-files','receipts')
    and (storage.foldername(name))[1] = (select auth_org_id()::text)
  );

create policy "staff update files" on storage.objects for update to authenticated
  using (
    bucket_id in ('patient-files','receipts')
    and (storage.foldername(name))[1] = (select auth_org_id()::text)
  )
  with check (
    bucket_id in ('patient-files','receipts')
    and (storage.foldername(name))[1] = (select auth_org_id()::text)
  );

create policy "staff delete files" on storage.objects for delete to authenticated
  using (
    bucket_id in ('patient-files','receipts')
    and (storage.foldername(name))[1] = (select auth_org_id()::text)
    and (is_admin() or coalesce(owner_id, owner::text) = (select auth.uid()::text))
  );

-- ========== instruction-images (public bucket) ==========
-- Public READ stays (0008): the URLs are embedded inside body_md markdown and
-- the bucket was public by design — an org uuid in an unguessable public URL
-- is the accepted trade-off, unchanged. Writes become org-scoped.
drop policy if exists "staff upload instruction images" on storage.objects;
drop policy if exists "admin delete instruction images" on storage.objects;
drop policy if exists "staff update instruction images" on storage.objects;
drop policy if exists "staff delete instruction images" on storage.objects;

create policy "staff upload instruction images" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'instruction-images'
    and (storage.foldername(name))[1] = (select auth_org_id()::text)
  );

create policy "staff update instruction images" on storage.objects for update to authenticated
  using (
    bucket_id = 'instruction-images'
    and (storage.foldername(name))[1] = (select auth_org_id()::text)
  )
  with check (
    bucket_id = 'instruction-images'
    and (storage.foldername(name))[1] = (select auth_org_id()::text)
  );

create policy "staff delete instruction images" on storage.objects for delete to authenticated
  using (
    bucket_id = 'instruction-images'
    and (storage.foldername(name))[1] = (select auth_org_id()::text)
    and (is_admin() or coalesce(owner_id, owner::text) = (select auth.uid()::text))
  );

-- ========== org-assets (public bucket, NEW) ==========
-- Org logos. Same model as avatars (0010): public read via the bucket flag,
-- all writes through the service role in server actions (lib/actions/
-- org-branding.ts) — so no storage.objects policies are needed or wanted.
insert into storage.buckets (id, name, public) values ('org-assets', 'org-assets', true)
  on conflict (id) do nothing;
