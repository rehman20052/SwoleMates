begin;
create or replace function public.account_controls_available() returns boolean language sql stable set search_path = '' as $$ select auth.uid() is not null; $$;
revoke all on function public.account_controls_available() from public,anon;
grant execute on function public.account_controls_available() to authenticated;
create table if not exists public.app_diagnostics (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  release text not null check(length(release)<=64),
  platform text not null check(platform in ('web','ios','android','windows','macos')),
  screen_identifier text not null check(screen_identifier in ('app','account')),
  operation text not null check(operation in ('render','sync')),
  error_code text not null check(error_code ~ '^[A-Z0-9]{3,12}$'),
  fingerprint text not null check(fingerprint ~ '^[0-9a-f]{1,16}$')
);
alter table public.app_diagnostics enable row level security;
revoke all on public.app_diagnostics from public,anon,authenticated;
grant insert(release,platform,screen_identifier,operation,error_code,fingerprint) on public.app_diagnostics to authenticated;
grant usage on sequence public.app_diagnostics_id_seq to authenticated;
drop policy if exists opt_in_reports on public.app_diagnostics;
create policy opt_in_reports on public.app_diagnostics for insert to authenticated with check(auth.uid() is not null);
create or replace function public.expire_app_diagnostics() returns void language sql security definer set search_path = '' as $$
  delete from public.app_diagnostics where created_at < now()-interval '30 days';
$$;
revoke all on function public.expire_app_diagnostics() from public,anon,authenticated;
grant execute on function public.expire_app_diagnostics() to service_role;

create or replace function public.export_my_account() returns jsonb language plpgsql security definer set search_path = '' as $$
declare result jsonb := '{}'::jsonb; entry record; rows jsonb;
begin
  if auth.uid() is null then raise exception 'Sign in to export.' using errcode='42501'; end if;
  -- Explicit owner columns only: never export another participant's private records.
  for entry in select * from (values
    ('user_account','id'),('account_records','user_id'),('profile_photo','user_id'),('profile_prompt','user_id'),
    ('user_availability','user_id'),('user_goal','user_id'),('discover_filter','user_id'),('discover_skip','user_id'),
    ('block','user_id'),('report','user_id'),('workout_logs','user_id'),('nutrition_goal','user_id'),
    ('food_log_entry','user_id'),('saved_meal','user_id'),('post','author_id'),('post_comment','author_id'),
    ('post_like','user_id'),('comment_like','user_id'),('follow','follower_id'),('user_products','user_id'),('attendance','user_id')
  ) as owned(table_name,owner_column) loop
    if to_regclass('public.'||entry.table_name) is not null then
      execute format('select coalesce(jsonb_agg(to_jsonb(t)),''[]''::jsonb) from public.%I t where %I=$1',entry.table_name,entry.owner_column) into rows using auth.uid();
      result := result || jsonb_build_object(entry.table_name,rows);
    end if;
  end loop;
  result := result || jsonb_build_object('match_messages',(select coalesce(jsonb_agg(to_jsonb(m)),'[]'::jsonb) from public.match_messages m where m.sender_id=auth.uid()));
  return result;
end; $$;
revoke all on function public.export_my_account() from public,anon;
grant execute on function public.export_my_account() to authenticated;

-- Server-only cleanup. Private logs belonging to other people survive removal of a plan.
create or replace function public.remove_account_data(owner_id uuid) returns void language plpgsql security definer set search_path = '' as $$
declare entry record;
begin
  if owner_id is null then raise exception 'Missing owner.'; end if;
  if to_regclass('public.workout_logs') is not null then
    update public.workout_logs set planned_workout_id=null where planned_workout_id in
      (select p.planned_workout_id from public.planned_workout p join public.match_requests r on r.id=p.match_id where owner_id in(r.from_user_id,r.to_user_id));
  end if;
  if to_regclass('public.attendance') is not null then
    delete from public.attendance where planned_workout_id in
      (select p.planned_workout_id from public.planned_workout p join public.match_requests r on r.id=p.match_id where owner_id in(r.from_user_id,r.to_user_id));
  end if;
  delete from public.planned_workout where match_id in(select id from public.match_requests where owner_id in(from_user_id,to_user_id));
  delete from public.match_requests where owner_id in(from_user_id,to_user_id);
  for entry in select * from (values
    ('profile_photo','user_id'),('profile_prompt','user_id'),('user_availability','user_id'),('user_goal','user_id'),
    ('discover_filter','user_id'),('discover_skip','user_id'),('discover_skip','skipped_user_id'),('block','user_id'),('block','blocked_id'),
    ('report','user_id'),('report','reported_id'),('workout_logs','user_id'),('nutrition_goal','user_id'),('food_log_entry','user_id'),
    ('saved_meal','user_id'),('attendance','user_id'),('chat_read','user_id'),('event_rsvp','user_id'),('account_records','user_id'),
    ('account_save_receipts','user_id'),('discover_profiles','id'),('user_products','user_id'),('user_account','id')
  ) as owned(table_name,owner_column) loop
    if to_regclass('public.'||entry.table_name) is not null then
      execute format('delete from public.%I where %I=$1',entry.table_name,entry.owner_column) using owner_id;
    end if;
  end loop;
end; $$;
revoke all on function public.remove_account_data(uuid) from public,anon,authenticated;
grant execute on function public.remove_account_data(uuid) to service_role;
notify pgrst,'reload schema';
commit;
