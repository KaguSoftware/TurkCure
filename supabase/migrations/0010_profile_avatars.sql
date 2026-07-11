-- Profile pictures: public avatars bucket + url column on profiles.
alter table profiles add column avatar_url text;

insert into storage.buckets (id, name, public) values ('avatars', 'avatars', true);

-- Uploads/deletes go through the service role in server actions, so no
-- authenticated write policies are needed; public read comes from the bucket flag.
