-- Account-owned app records. Apply once using Supabase SQL Editor or migrations.
-- Existing social, match, profile, and workout tables remain unchanged.
begin;
create table if not exists public.account_records (
  user_id uuid not null references auth.users(id) on delete cascade,
  namespace text not null check (namespace in ('recipes','food','nutrition_plan','lifts','workout_logs','workout_deletions','settings','hidden_chats','chat_reads','friend_reads')),
  record_id text not null check (length(record_id) between 1 and 200),
  payload jsonb,
  deleted boolean not null default false,
  revision bigint not null default 1 check (revision > 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, namespace, record_id),
  check (deleted or payload is not null),
  check (octet_length(payload::text) <= 262144)
);
alter table public.account_records enable row level security;
revoke all on public.account_records from anon, authenticated;
grant select, insert, update on public.account_records to authenticated;
drop policy if exists account_records_select on public.account_records;
create policy account_records_select on public.account_records for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists account_records_insert on public.account_records;
create policy account_records_insert on public.account_records for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists account_records_update on public.account_records;
create policy account_records_update on public.account_records for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- All changes in a save either succeed together or fail. Versions detect two
-- devices editing the same record; tombstones stop stale devices resurrecting it.
create or replace function public.account_save_records(p_namespace text, p_changes jsonb)
returns void language plpgsql security invoker set search_path = '' as $$
declare change jsonb; actual_revision bigint; owner_id uuid := auth.uid();
begin
  if owner_id is null then raise exception 'Sign in to save your data.' using errcode = '42501'; end if;
  if jsonb_typeof(p_changes) <> 'array' or jsonb_array_length(p_changes) > 5000 then raise exception 'Invalid changes.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(owner_id::text, 0));
  for change in select value from jsonb_array_elements(p_changes) loop
    select revision into actual_revision from public.account_records
      where user_id = owner_id and namespace = p_namespace and record_id = change->>'id';
    if coalesce(actual_revision, 0) <> (change->>'expectedRevision')::bigint then
      raise exception 'A newer version exists. Refresh and try again.' using errcode = '40001';
    end if;
    insert into public.account_records(user_id, namespace, record_id, payload, deleted)
      values(owner_id, p_namespace, change->>'id', change->'payload', coalesce((change->>'deleted')::boolean, false))
    on conflict (user_id, namespace, record_id) do update
      set payload = excluded.payload, deleted = excluded.deleted,
          revision = public.account_records.revision + 1, updated_at = now();
  end loop;
end;
$$;

-- One-time browser migration inserts missing IDs only. Existing records and
-- deletion tombstones always win over a stale browser's legacy data.
create or replace function public.account_import_records(p_namespace text, p_records jsonb)
returns void language plpgsql security invoker set search_path = '' as $$
declare record jsonb; owner_id uuid := auth.uid();
begin
  if owner_id is null then raise exception 'Sign in to import your data.' using errcode = '42501'; end if;
  if jsonb_typeof(p_records) <> 'array' or jsonb_array_length(p_records) > 5000 then raise exception 'Invalid records.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(owner_id::text, 0));
  for record in select value from jsonb_array_elements(p_records) loop
    insert into public.account_records(user_id, namespace, record_id, payload)
      values(owner_id, p_namespace, record->>'id', record->'payload')
      on conflict (user_id, namespace, record_id) do nothing;
  end loop;
end;
$$;
revoke all on function public.account_save_records(text,jsonb) from public, anon;
revoke all on function public.account_import_records(text,jsonb) from public, anon;
grant execute on function public.account_save_records(text,jsonb) to authenticated;
grant execute on function public.account_import_records(text,jsonb) to authenticated;
notify pgrst, 'reload schema';
commit;
