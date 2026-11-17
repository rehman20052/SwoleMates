-- Phase 1 of moving data out of account_records: every workout (lifts and cardio) lives in
-- workout_logs, with its exercises in workout_exercise and sets in workout_set.
-- The app keeps its offline sync: these functions take the same changes and enforce the same
-- revision check that account_commit_operation does. Run once in the Supabase SQL Editor.
-- Safe to re-run. Existing workouts are copied over from account_records at the end.
begin;

-- 1. workout_logs: one row per session --------------------------------------------------------
alter table public.workout_logs
  add column if not exists record_id text,             -- the app's sync id ("planned:<id>" or its own log id)
  add column if not exists log_ref text,               -- the log's own id inside the app
  add column if not exists kind text not null default 'lift',
  add column if not exists duration_minutes int,
  add column if not exists checked_in boolean,
  add column if not exists partner_name text,
  add column if not exists partner_photo text,
  add column if not exists logged_at text,             -- kept exactly as the app sent it
  add column if not exists workout_origin text,
  add column if not exists source_template_id text,
  add column if not exists activity text,              -- cardio: Running, Swimming, Pilates...
  add column if not exists distance numeric,
  add column if not exists distance_unit text,
  add column if not exists effort text,
  add column if not exists calories int,
  add column if not exists calories_source text,
  add column if not exists deleted boolean not null default false,
  add column if not exists deleted_at timestamptz,
  add column if not exists revision bigint not null default 1,
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists change_sequence bigint not null default nextval('public.account_change_sequence');

do $$ begin
  alter table public.workout_logs add constraint workout_logs_kind_check check (kind in ('lift','cardio'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.workout_logs add constraint workout_logs_user_record_key unique (user_id, record_id);
exception when duplicate_table or duplicate_object then null; end $$;

-- Workouts belong to the login, so they save even before someone has a user_account row.
alter table public.workout_logs drop constraint if exists workout_logs_user_id_fkey;
alter table public.workout_logs add constraint workout_logs_user_id_fkey
  foreign key (user_id) references auth.users (id) on delete cascade;

create index if not exists workout_logs_delta_idx on public.workout_logs (user_id, change_sequence);
-- The check-in code writes partner workouts directly as the signed-in user, which takes a
-- change number from this sequence.
grant usage on sequence public.account_change_sequence to authenticated;

-- Keeps every write in step with the sync: new change number, bumped revision, and ids for
-- partner workouts that the check-in code writes directly.
create or replace function public.workout_logs_sync_fields() returns trigger language plpgsql set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(new.user_id::text, 0));
  if new.record_id is null and new.planned_workout_id is not null then new.record_id := 'planned:' || new.planned_workout_id; end if;
  if new.log_ref is null then new.log_ref := coalesce('verified-check-in-' || new.planned_workout_id, new.record_id, new.log_id::text); end if;
  -- workout_apply sets the revision itself; any other update (e.g. a partner check-in) bumps it.
  if tg_op = 'UPDATE' and new.revision = old.revision and coalesce(current_setting('swolemates.workout_apply', true), '') <> 'on' then
    new.revision := old.revision + 1;
  end if;
  new.change_sequence := nextval('public.account_change_sequence');
  new.updated_at := now();
  return new;
end; $$;
drop trigger if exists workout_logs_sync_fields on public.workout_logs;
create trigger workout_logs_sync_fields before insert or update on public.workout_logs
  for each row execute function public.workout_logs_sync_fields();

-- Give existing partner workouts their sync ids. Marked as an internal write so it doesn't
-- count as an edit (which would bump their revision and make the copy below skip them).
select set_config('swolemates.workout_apply', 'on', true);
update public.workout_logs set record_id = 'planned:' || planned_workout_id
  where record_id is null and planned_workout_id is not null;

-- 2. Exercises and sets ---------------------------------------------------------------------
create table if not exists public.workout_exercise (
  exercise_id uuid primary key default gen_random_uuid(),
  log_id uuid not null references public.workout_logs (log_id) on delete cascade,
  position int not null,
  client_id text not null,
  name text not null check (length(name) between 1 and 100),
  unit text not null check (unit in ('lb','kg')),
  sets int not null check (sets between 1 and 100),
  reps int not null check (reps between 1 and 100),
  weight numeric not null check (weight >= 0)
);
create index if not exists workout_exercise_log_idx on public.workout_exercise (log_id, position);

create table if not exists public.workout_set (
  set_id uuid primary key default gen_random_uuid(),
  exercise_id uuid not null references public.workout_exercise (exercise_id) on delete cascade,
  set_number int not null,
  reps int not null check (reps between 1 and 100),
  weight numeric not null check (weight >= 0)
);
create index if not exists workout_set_exercise_idx on public.workout_set (exercise_id, set_number);

alter table public.workout_exercise enable row level security;
alter table public.workout_set enable row level security;
revoke all on public.workout_exercise, public.workout_set from anon, authenticated;
grant select on public.workout_exercise, public.workout_set to authenticated;
drop policy if exists "read own exercises" on public.workout_exercise;
create policy "read own exercises" on public.workout_exercise for select to authenticated
  using (exists (select 1 from public.workout_logs w where w.log_id = workout_exercise.log_id and w.user_id = (select auth.uid())));
drop policy if exists "read own sets" on public.workout_set;
create policy "read own sets" on public.workout_set for select to authenticated
  using (exists (select 1 from public.workout_exercise e join public.workout_logs w on w.log_id = e.log_id
                 where e.exercise_id = workout_set.exercise_id and w.user_id = (select auth.uid())));

-- 3. Turning rows back into the app's workout shape ----------------------------------------
create or replace function public.workout_payload(w public.workout_logs) returns jsonb language sql stable set search_path = '' as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'id', w.log_ref, 'date', w.workout_date, 'title', coalesce(w.title, ''), 'notes', w.notes, 'verified', w.verified,
    'checkedIn', w.checked_in, 'plannedWorkoutId', w.planned_workout_id, 'partnerName', w.partner_name,
    'partnerPhoto', w.partner_photo, 'loggedAt', w.logged_at, 'durationMinutes', w.duration_minutes,
    'workoutOrigin', w.workout_origin, 'sourceTemplateId', w.source_template_id,
    'exercises', (select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
        'id', e.client_id, 'name', e.name, 'sets', e.sets, 'reps', e.reps, 'weight', e.weight, 'unit', e.unit,
        'setDetails', (select jsonb_agg(jsonb_build_object('reps', s.reps, 'weight', s.weight) order by s.set_number)
                       from public.workout_set s where s.exercise_id = e.exercise_id))) order by e.position)
      from public.workout_exercise e where e.log_id = w.log_id),
    'activity', case when w.activity is null then null else jsonb_strip_nulls(jsonb_build_object(
      'type', w.activity, 'distance', w.distance, 'distanceUnit', w.distance_unit, 'effort', w.effort,
      'calories', w.calories, 'caloriesSource', w.calories_source)) end));
$$;

-- 4. Writing one workout (and its exercises and sets) from the app's shape -----------------
create or replace function public.workout_apply(p_user uuid, p_record text, p_payload jsonb, p_deleted boolean, p_revision bigint)
returns void language plpgsql security definer set search_path = '' as $$
declare v_log uuid; ex jsonb; v_ex uuid; st jsonb; pos int := 0; n int; v_plan uuid; a jsonb := p_payload -> 'activity';
begin
  perform set_config('swolemates.workout_apply', 'on', true);
  if p_deleted or p_payload is null then
    insert into public.workout_logs as w (user_id, record_id, log_ref, workout_date, title, verified, deleted, deleted_at, revision)
      values (p_user, p_record, p_record, current_date, '', false, true, now(), p_revision)
    on conflict (user_id, record_id) do update set deleted = true, deleted_at = now(), revision = excluded.revision;
    return;
  end if;
  -- Only link a planned workout that still exists.
  if coalesce(p_payload ->> 'plannedWorkoutId', '') ~ '^[0-9a-fA-F-]{36}$' then
    select planned_workout_id into v_plan from public.planned_workout where planned_workout_id = (p_payload ->> 'plannedWorkoutId')::uuid;
  end if;
  insert into public.workout_logs as w (user_id, record_id, log_ref, workout_date, title, notes, verified, checked_in,
      planned_workout_id, partner_name, partner_photo, logged_at, duration_minutes, workout_origin, source_template_id,
      kind, activity, distance, distance_unit, effort, calories, calories_source, deleted, deleted_at, revision)
    values (p_user, p_record, p_payload ->> 'id', (p_payload ->> 'date')::date, coalesce(p_payload ->> 'title', ''),
      p_payload ->> 'notes', coalesce((p_payload ->> 'verified')::boolean, false), (p_payload ->> 'checkedIn')::boolean,
      v_plan, p_payload ->> 'partnerName', p_payload ->> 'partnerPhoto', p_payload ->> 'loggedAt',
      (p_payload ->> 'durationMinutes')::int, p_payload ->> 'workoutOrigin', p_payload ->> 'sourceTemplateId',
      case when a is null then 'lift' else 'cardio' end, a ->> 'type', (a ->> 'distance')::numeric, a ->> 'distanceUnit',
      a ->> 'effort', (a ->> 'calories')::int, a ->> 'caloriesSource', false, null, p_revision)
  on conflict (user_id, record_id) do update set
    log_ref = excluded.log_ref, workout_date = excluded.workout_date, title = excluded.title, notes = excluded.notes,
    verified = excluded.verified, checked_in = excluded.checked_in, planned_workout_id = excluded.planned_workout_id,
    partner_name = excluded.partner_name, partner_photo = excluded.partner_photo, logged_at = excluded.logged_at,
    duration_minutes = excluded.duration_minutes, workout_origin = excluded.workout_origin,
    source_template_id = excluded.source_template_id, kind = excluded.kind, activity = excluded.activity,
    distance = excluded.distance, distance_unit = excluded.distance_unit, effort = excluded.effort,
    calories = excluded.calories, calories_source = excluded.calories_source, deleted = false, deleted_at = null,
    revision = excluded.revision
  returning log_id into v_log;

  delete from public.workout_exercise where log_id = v_log;
  for ex in select value from jsonb_array_elements(coalesce(p_payload -> 'exercises', '[]'::jsonb)) loop
    pos := pos + 1;
    insert into public.workout_exercise (log_id, position, client_id, name, unit, sets, reps, weight)
      values (v_log, pos, ex ->> 'id', ex ->> 'name', ex ->> 'unit', (ex ->> 'sets')::int, (ex ->> 'reps')::int, (ex ->> 'weight')::numeric)
      returning exercise_id into v_ex;
    n := 0;
    for st in select value from jsonb_array_elements(coalesce(ex -> 'setDetails', '[]'::jsonb)) loop
      n := n + 1;
      insert into public.workout_set (exercise_id, set_number, reps, weight)
        values (v_ex, n, (st ->> 'reps')::int, (st ->> 'weight')::numeric);
    end loop;
  end loop;
end; $$;
revoke all on function public.workout_apply(uuid, text, jsonb, boolean, bigint) from public, anon, authenticated;

-- 5. What the app calls ---------------------------------------------------------------------
-- Saves a batch of changes. Same rules as account_commit_operation: one owner lock, a revision
-- check per workout (a stale save is refused with 40001), and a receipt so a retry is safe.
create or replace function public.workout_commit_operation(p_changes jsonb, p_operation_id text)
returns void language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); receipt public.account_save_receipts; change jsonb; actual bigint;
begin
  if me is null then raise exception 'Sign in to save.' using errcode = '42501'; end if;
  if jsonb_typeof(p_changes) <> 'array' or jsonb_array_length(p_changes) > 5000 then raise exception 'Invalid changes.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(me::text, 0));
  select * into receipt from public.account_save_receipts where user_id = me and operation_id = p_operation_id;
  if receipt.operation_id is not null then
    if receipt.namespace <> 'workout_logs' or receipt.changes <> p_changes then raise exception 'Operation ID reused.' using errcode = '42501'; end if;
    return;
  end if;
  for change in select value from jsonb_array_elements(p_changes) loop
    select revision into actual from public.workout_logs where user_id = me and record_id = change ->> 'id';
    if coalesce(actual, 0) <> (change ->> 'expectedRevision')::bigint then
      raise exception 'A newer version exists. Refresh and try again.' using errcode = '40001';
    end if;
    perform public.workout_apply(me, change ->> 'id', change -> 'payload', coalesce((change ->> 'deleted')::boolean, false), coalesce(actual, 0) + 1);
    actual := null;
  end loop;
  insert into public.account_save_receipts (user_id, operation_id, namespace, changes) values (me, p_operation_id, 'workout_logs', p_changes);
end; $$;

-- Workouts changed since a change number, for the app's sync.
create or replace function public.workout_read_delta(p_after bigint default 0, p_limit int default 500)
returns table (record_id text, payload jsonb, deleted boolean, revision bigint, change_sequence bigint)
language sql stable security definer set search_path = '' as $$
  select w.record_id, case when w.deleted then null else public.workout_payload(w) end, w.deleted, w.revision, w.change_sequence
  from public.workout_logs w
  where w.user_id = auth.uid() and w.record_id is not null and w.change_sequence > p_after
  order by w.change_sequence limit greatest(1, least(p_limit, 500));
$$;

-- Specific workouts by sync id, read right after a save.
create or replace function public.workout_read_records(p_ids text[])
returns table (record_id text, payload jsonb, deleted boolean, revision bigint)
language sql stable security definer set search_path = '' as $$
  select w.record_id, case when w.deleted then null else public.workout_payload(w) end, w.deleted, w.revision
  from public.workout_logs w where w.user_id = auth.uid() and w.record_id = any (p_ids);
$$;

-- One-time import of workouts kept only on a device: adds missing ones, never overwrites.
create or replace function public.workout_import_records(p_records jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); r jsonb;
begin
  if me is null then raise exception 'Sign in to import your data.' using errcode = '42501'; end if;
  if jsonb_typeof(p_records) <> 'array' or jsonb_array_length(p_records) > 5000 then raise exception 'Invalid records.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(me::text, 0));
  for r in select value from jsonb_array_elements(p_records) loop
    if not exists (select 1 from public.workout_logs w where w.user_id = me and w.record_id = r ->> 'id') then
      perform public.workout_apply(me, r ->> 'id', r -> 'payload', false, 1);
    end if;
  end loop;
end; $$;

revoke all on function public.workout_commit_operation(jsonb, text), public.workout_read_delta(bigint, int),
  public.workout_read_records(text[]), public.workout_import_records(jsonb) from public, anon;
grant execute on function public.workout_commit_operation(jsonb, text), public.workout_read_delta(bigint, int),
  public.workout_read_records(text[]), public.workout_import_records(jsonb) to authenticated;

-- 6. Older app versions still save workouts to account_records: copy those writes over too.
create or replace function public.forward_workout_records() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform public.workout_apply(new.user_id, new.record_id, new.payload, new.deleted or new.payload is null,
    greatest(new.revision, coalesce((select w.revision from public.workout_logs w where w.user_id = new.user_id and w.record_id = new.record_id), 0)));
  return new;
end; $$;
drop trigger if exists forward_workout_records on public.account_records;
create trigger forward_workout_records after insert or update on public.account_records
  for each row when (new.namespace = 'workout_logs') execute function public.forward_workout_records();

-- 7. Copy existing workouts out of account_records, keeping their revisions so devices that
--    already have them don't see a conflict.
do $$
declare r record;
begin
  -- Skips any workout the new tables already have a newer version of, so re-running this
  -- script never rolls back edits made after the switch.
  for r in select a.user_id, a.record_id, a.payload, a.deleted, a.revision
           from public.account_records a join auth.users u on u.id = a.user_id
           where a.namespace = 'workout_logs'
             and not exists (select 1 from public.workout_logs w
                             where w.user_id = a.user_id and w.record_id = a.record_id and w.revision > a.revision) loop
    perform public.workout_apply(r.user_id, r.record_id, r.payload, r.deleted or r.payload is null, r.revision);
  end loop;
end $$;

-- Realtime wakes the app when a workout changes, as it does for account_records.
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'workout_logs') then
    alter publication supabase_realtime add table public.workout_logs;
  end if;
end $$;

notify pgrst, 'reload schema';
commit;
