-- Public bucket for images embedded inline in instruction markdown.
-- Public read is required: the URLs are stored inside body_md and must stay
-- valid in the app preview and in generated PDFs indefinitely.
insert into storage.buckets (id, name, public) values
  ('instruction-images', 'instruction-images', true);

create policy "public read instruction images" on storage.objects for select
  using (bucket_id = 'instruction-images');
create policy "staff upload instruction images" on storage.objects for insert to authenticated
  with check (bucket_id = 'instruction-images');
create policy "admin delete instruction images" on storage.objects for delete to authenticated
  using (bucket_id = 'instruction-images' and is_admin());
