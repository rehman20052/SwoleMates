-- Profile photos live in Storage. The account only keeps the short file path,
-- so the login token stays small.

insert into storage.buckets (id, name, public)
values ('profile-photos', 'profile-photos', true)
on conflict (id) do update
set public = true;

drop policy if exists "profile photo bucket is visible" on storage.buckets;
create policy "profile photo bucket is visible"
on storage.buckets for select
to public
using (id = 'profile-photos');

drop policy if exists "profile photos are public" on storage.objects;
drop policy if exists "users insert their own profile photos" on storage.objects;
drop policy if exists "users update their own profile photos" on storage.objects;
drop policy if exists "users delete their own profile photos" on storage.objects;

create policy "profile photos are public"
on storage.objects for select
to public
using (bucket_id = 'profile-photos');

create policy "users insert their own profile photos"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'profile-photos'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

create policy "users update their own profile photos"
on storage.objects for update
to authenticated
using (
  bucket_id = 'profile-photos'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
)
with check (
  bucket_id = 'profile-photos'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

create policy "users delete their own profile photos"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'profile-photos'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);
