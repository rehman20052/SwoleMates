-- Phase 2 of moving data out of account_records: tracked lifts live in tracked_lift, and each
-- lift's progress over time in lift_history. Same sync rules as workout-tables.sql: the app's
-- offline queue, revision check (stale saves refused with 40001) and receipts are unchanged.
-- Run once in the Supabase SQL Editor after workout-tables.sql. Safe to re-run.
begin;

-- 1. Tables ---------------------------------------------------------------------------------
create table if not exists public.tracked_lift (
  lift_id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  record_id text not null,                 -- the lift's id inside the app
  name text not null default '',
  unit text not null default 'lb' check (unit in ('lb','kg')),
  current_weight numeric not null default 0 check (current_weight >= 0),
  goal_weight numeric not null default 0 check (goal_weight >= 0),
  min_reps int not null default 1,
  max_reps int not null default 1,
  artwork jsonb,                           -- picked icon or photo
  deleted boolean not null default false,
  deleted_at timestamptz,
  revision bigint not null default 1,
  updated_at timestamptz not null default now(),
  change_sequence bigint not null default nextval('public.account_change_sequence'),
  constraint tracked_lift_user_record_key unique (user_id, record_id)
);
create index if not exists tracked_lift_delta_idx on public.tracked_lift (user_id, change_sequence);

create table if not exists public.lift_history (
  history_id uuid primary key default gen_random_uuid(),
  lift_id uuid not null references public.tracked_lift (lift_id) on delete cascade,
  position int not null,
  entry_date text not null,                -- kept exactly as the app sent it
  weight numeric not null check (weight >= 0),
  min_reps int not null check (min_reps >= 1),
  max_reps int not null check (max_reps >= min_reps and max_reps <= 100),
  workout_log_id text                      -- the workout this entry came from, if any
);
create index if not exists lift_history_lift_idx on public.lift_history (lift_id, position);

alter table public.tracked_lift enable row level security;
alter table public.lift_history enable row level security;
revoke all on public.tracked_lift, public.lift_history from anon, authenticated;
grant select on public.tracked_lift, public.lift_history to authenticated;
drop policy if exists "read own lifts" on public.tracked_lift;
create policy "read own lifts" on public.tracked_lift for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "read own lift history" on public.lift_history;
create policy "read own lift history" on public.lift_history for select to authenticated
  using (exists (select 1 from public.tracked_lift l where l.lift_id = lift_history.lift_id and l.user_id = (select auth.uid())));

-- Every write gets a new change number, as in workout_logs.
create or replace function public.tracked_lift_sync_fields() returns trigger language plpgsql set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(new.user_id::text, 0));
  if tg_op = 'UPDATE' and new.revision = old.revision and coalesce(current_setting('swolemates.lift_apply', true), '') <> 'on' then
    new.revision := old.revision + 1;
  end if;
  new.change_sequence := nextval('public.account_change_sequence');
  new.updated_at := now();
  return new;
end; $$;
drop trigger if exists tracked_lift_sync_fields on public.tracked_lift;
create trigger tracked_lift_sync_fields before insert or update on public.tracked_lift
  for each row execute function public.tracked_lift_sync_fields();

-- 2. Rows to and from the app's lift shape ----------------------------------------------------
create or replace function public.lift_payload(l public.tracked_lift) returns jsonb language sql stable set search_path = '' as $$
  select jsonb_strip_nulls(jsonb_build_object(
      'id', l.record_id, 'name', l.name, 'unit', l.unit, 'currentWeight', l.current_weight,
      'minReps', l.min_reps, 'maxReps', l.max_reps, 'goalWeight', l.goal_weight, 'artwork', l.artwork))
    || jsonb_build_object('history', coalesce((
      select jsonb_agg(jsonb_strip_nulls(jsonb_build_object('date', h.entry_date, 'weight', h.weight,
               'minReps', h.min_reps, 'maxReps', h.max_reps, 'workoutLogId', h.workout_log_id)) order by h.position)
      from public.lift_history h where h.lift_id = l.lift_id), '[]'::jsonb));
$$;

create or replace function public.lift_apply(p_user uuid, p_record text, p_payload jsonb, p_deleted boolean, p_revision bigint)
returns void language plpgsql security definer set search_path = '' as $$
declare v_lift uuid; entry jsonb; pos int := 0;
begin
  perform set_config('swolemates.lift_apply', 'on', true);
  if p_deleted or p_payload is null then
    insert into public.tracked_lift as l (user_id, record_id, deleted, deleted_at, revision)
      values (p_user, p_record, true, now(), p_revision)
    on conflict (user_id, record_id) do update set deleted = true, deleted_at = now(), revision = excluded.revision;
    return;
  end if;
  insert into public.tracked_lift as l (user_id, record_id, name, unit, current_weight, goal_weight, min_reps, max_reps,
      artwork, deleted, deleted_at, revision)
    values (p_user, p_record, coalesce(p_payload ->> 'name', ''), coalesce(p_payload ->> 'unit', 'lb'),
      (p_payload ->> 'currentWeight')::numeric, (p_payload ->> 'goalWeight')::numeric,
      (p_payload ->> 'minReps')::int, (p_payload ->> 'maxReps')::int, p_payload -> 'artwork', false, null, p_revision)
  on conflict (user_id, record_id) do update set
    name = excluded.name, unit = excluded.unit, current_weight = excluded.current_weight,
    goal_weight = excluded.goal_weight, min_reps = excluded.min_reps, max_reps = excluded.max_reps,
    artwork = excluded.artwork, deleted = false, deleted_at = null, revision = excluded.revision
  returning lift_id into v_lift;

  delete from public.lift_history where lift_id = v_lift;
  for entry in select value from jsonb_array_elements(coalesce(p_payload -> 'history', '[]'::jsonb)) loop
    pos := pos + 1;
    insert into public.lift_history (lift_id, position, entry_date, weight, min_reps, max_reps, workout_log_id)
      values (v_lift, pos, entry ->> 'date', (entry ->> 'weight')::numeric, (entry ->> 'minReps')::int,
              (entry ->> 'maxReps')::int, entry ->> 'workoutLogId');
  end loop;
end; $$;
revoke all on function public.lift_apply(uuid, text, jsonb, boolean, bigint) from public, anon, authenticated;

-- 3. What the app calls (same contract as the workout_* functions) ---------------------------
create or replace function public.lift_commit_operation(p_changes jsonb, p_operation_id text)
returns void language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); receipt public.account_save_receipts; change jsonb; actual bigint;
begin
  if me is null then raise exception 'Sign in to save.' using errcode = '42501'; end if;
  if jsonb_typeof(p_changes) <> 'array' or jsonb_array_length(p_changes) > 5000 then raise exception 'Invalid changes.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(me::text, 0));
  select * into receipt from public.account_save_receipts where user_id = me and operation_id = p_operation_id;
  if receipt.operation_id is not null then
    if receipt.namespace <> 'lifts' or receipt.changes <> p_changes then raise exception 'Operation ID reused.' using errcode = '42501'; end if;
    return;
  end if;
  for change in select value from jsonb_array_elements(p_changes) loop
    select revision into actual from public.tracked_lift where user_id = me and record_id = change ->> 'id';
    if coalesce(actual, 0) <> (change ->> 'expectedRevision')::bigint then
      raise exception 'A newer version exists. Refresh and try again.' using errcode = '40001';
    end if;
    perform public.lift_apply(me, change ->> 'id', change -> 'payload', coalesce((change ->> 'deleted')::boolean, false), coalesce(actual, 0) + 1);
    actual := null;
  end loop;
  insert into public.account_save_receipts (user_id, operation_id, namespace, changes) values (me, p_operation_id, 'lifts', p_changes);
end; $$;

create or replace function public.lift_read_delta(p_after bigint default 0, p_limit int default 500)
returns table (record_id text, payload jsonb, deleted boolean, revision bigint, change_sequence bigint)
language sql stable security definer set search_path = '' as $$
  select l.record_id, case when l.deleted then null else public.lift_payload(l) end, l.deleted, l.revision, l.change_sequence
  from public.tracked_lift l where l.user_id = auth.uid() and l.change_sequence > p_after
  order by l.change_sequence limit greatest(1, least(p_limit, 500));
$$;

create or replace function public.lift_read_records(p_ids text[])
returns table (record_id text, payload jsonb, deleted boolean, revision bigint)
language sql stable security definer set search_path = '' as $$
  select l.record_id, case when l.deleted then null else public.lift_payload(l) end, l.deleted, l.revision
  from public.tracked_lift l where l.user_id = auth.uid() and l.record_id = any (p_ids);
$$;

create or replace function public.lift_import_records(p_records jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); r jsonb;
begin
  if me is null then raise exception 'Sign in to import your data.' using errcode = '42501'; end if;
  if jsonb_typeof(p_records) <> 'array' or jsonb_array_length(p_records) > 5000 then raise exception 'Invalid records.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(me::text, 0));
  for r in select value from jsonb_array_elements(p_records) loop
    if not exists (select 1 from public.tracked_lift l where l.user_id = me and l.record_id = r ->> 'id') then
      perform public.lift_apply(me, r ->> 'id', r -> 'payload', false, 1);
    end if;
  end loop;
end; $$;

revoke all on function public.lift_commit_operation(jsonb, text), public.lift_read_delta(bigint, int),
  public.lift_read_records(text[]), public.lift_import_records(jsonb) from public, anon;
grant execute on function public.lift_commit_operation(jsonb, text), public.lift_read_delta(bigint, int),
  public.lift_read_records(text[]), public.lift_import_records(jsonb) to authenticated;

-- 4. Older app versions still save lifts to account_records: copy those writes over too.
create or replace function public.forward_lift_records() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform public.lift_apply(new.user_id, new.record_id, new.payload, new.deleted or new.payload is null,
    greatest(new.revision, coalesce((select l.revision from public.tracked_lift l where l.user_id = new.user_id and l.record_id = new.record_id), 0)));
  return new;
end; $$;
drop trigger if exists forward_lift_records on public.account_records;
create trigger forward_lift_records after insert or update on public.account_records
  for each row when (new.namespace = 'lifts') execute function public.forward_lift_records();

-- 5. Copy existing lifts, keeping revisions and never overwriting a newer copy.
do $$
declare r record;
begin
  for r in select a.user_id, a.record_id, a.payload, a.deleted, a.revision
           from public.account_records a join auth.users u on u.id = a.user_id
           where a.namespace = 'lifts'
             and not exists (select 1 from public.tracked_lift l
                             where l.user_id = a.user_id and l.record_id = a.record_id and l.revision > a.revision) loop
    perform public.lift_apply(r.user_id, r.record_id, r.payload, r.deleted or r.payload is null, r.revision);
  end loop;
end $$;

do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'tracked_lift') then
    alter publication supabase_realtime add table public.tracked_lift;
  end if;
end $$;

notify pgrst, 'reload schema';
commit;
