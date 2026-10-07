begin;
create sequence if not exists public.account_change_sequence;
alter table public.account_records add column if not exists change_sequence bigint not null default nextval('public.account_change_sequence');
create index if not exists account_delta_idx on public.account_records(user_id,namespace,change_sequence);
create table if not exists public.account_save_receipts (
  user_id uuid not null references auth.users(id) on delete cascade,
  operation_id text not null check(length(operation_id) between 1 and 200),
  namespace text not null, changes jsonb not null, created_at timestamptz not null default now(),
  primary key(user_id,operation_id)
);
alter table public.account_save_receipts enable row level security;
revoke all on public.account_save_receipts from public,anon,authenticated;
create or replace function public.assign_account_sequence() returns trigger language plpgsql set search_path = '' as $$
begin
  -- Serialize per owner before allocating a sequence so delta cursors cannot skip late commits.
  perform pg_advisory_xact_lock(hashtextextended(new.user_id::text,0));
  new.change_sequence := nextval('public.account_change_sequence'); return new;
end; $$;
drop trigger if exists assign_account_sequence on public.account_records;
create trigger assign_account_sequence before insert or update on public.account_records for each row execute function public.assign_account_sequence();
create or replace function public.account_commit_operation(p_namespace text,p_changes jsonb,p_operation_id text)
returns void language plpgsql security definer set search_path = '' as $$
declare receipt public.account_save_receipts;
begin
  if auth.uid() is null then raise exception 'Sign in to save.' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
  select * into receipt from public.account_save_receipts where user_id=auth.uid() and operation_id=p_operation_id;
  if receipt.operation_id is not null then
    if receipt.namespace<>p_namespace or receipt.changes<>p_changes then raise exception 'Operation ID reused.' using errcode='42501'; end if;
    return;
  end if;
  perform public.account_save_records(p_namespace,p_changes);
  insert into public.account_save_receipts(user_id,operation_id,namespace,changes) values(auth.uid(),p_operation_id,p_namespace,p_changes);
end; $$;
-- Imports use the same owner lock and cannot replace existing tombstones.
alter function public.account_import_records(text,jsonb) security definer;
create or replace function public.account_read_delta(p_namespace text,p_after bigint default 0,p_limit integer default 500)
returns table(record_id text,payload jsonb,deleted boolean,revision bigint,change_sequence bigint)
language sql stable security definer set search_path = '' as $$
  select r.record_id,r.payload,r.deleted,r.revision,r.change_sequence from public.account_records r
  where r.user_id=auth.uid() and r.namespace=p_namespace and r.change_sequence>p_after
  order by r.change_sequence limit greatest(1,least(p_limit,500));
$$;
revoke insert,update,delete on public.account_records from authenticated;
revoke all on function public.account_save_records(text,jsonb) from authenticated;
revoke all on function public.account_commit_operation(text,jsonb,text), public.account_read_delta(text,bigint,integer) from public,anon;
grant execute on function public.account_commit_operation(text,jsonb,text), public.account_read_delta(text,bigint,integer) to authenticated;
-- Realtime is a wake-up signal; delta reads remain the source of truth.
do $$ begin
  if exists(select 1 from pg_publication where pubname='supabase_realtime')
    and not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='account_records') then
    alter publication supabase_realtime add table public.account_records;
  end if;
end $$;
notify pgrst,'reload schema';
commit;
