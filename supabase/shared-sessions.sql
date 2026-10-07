begin;
create table if not exists public.shared_workout_sessions (
  planned_workout_id uuid primary key references public.planned_workout(planned_workout_id) on delete cascade,
  exercise_plan jsonb not null default '[]'::jsonb,
  locked_at timestamptz,
  states jsonb not null default '{}'::jsonb
);
alter table public.shared_workout_sessions enable row level security;
revoke all on public.shared_workout_sessions from public,anon,authenticated;
create or replace function public.shared_session_available() returns boolean language sql stable set search_path = '' as $$ select auth.uid() is not null; $$;
create or replace function public.workout_session_action(workout_id uuid, action text, exercise_plan jsonb default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare p public.planned_workout; r public.match_requests; s public.shared_workout_sessions; me uuid:=auth.uid(); item jsonb;
begin
  select * into p from public.planned_workout where planned_workout_id=workout_id;
  select * into r from public.match_requests where id=p.match_id;
  if me is null or r.id is null or me not in(r.from_user_id,r.to_user_id) then raise exception 'Not a participant.' using errcode='42501'; end if;
  perform public.contact_lock(r.from_user_id,r.to_user_id);
  if not public.can_contact_match(r.id) then raise exception 'Contact unavailable.' using errcode='42501'; end if;
  select * into p from public.planned_workout where planned_workout_id=workout_id for update;
  if p.status not in ('proposed','scheduled','completed') then raise exception 'Session unavailable.'; end if;
  insert into public.shared_workout_sessions(planned_workout_id) values(workout_id) on conflict do nothing;
  select * into s from public.shared_workout_sessions where planned_workout_id=workout_id for update;
  if action='edit' then
    if p.created_by<>me or s.locked_at is not null then raise exception 'Plan is locked or you are not its proposer.' using errcode='42501'; end if;
    if exercise_plan is null or jsonb_typeof(exercise_plan)<>'array' or jsonb_array_length(exercise_plan)>30 then raise exception 'Invalid exercise plan.'; end if;
    for item in select value from jsonb_array_elements(exercise_plan) loop
      if jsonb_typeof(item)<>'object' or not(item ? 'name' and item ? 'sets' and item ? 'reps') or length(item->>'name') not between 1 and 100
        or (item->>'sets')::integer not between 1 and 100 or (item->>'reps')::integer not between 1 and 100
        or item - 'name' - 'sets' - 'reps' <> '{}'::jsonb then raise exception 'Invalid exercise; share only name, sets and target reps.'; end if;
    end loop;
    update public.shared_workout_sessions set exercise_plan=workout_session_action.exercise_plan where planned_workout_id=workout_id;
  elsif action in ('ready','training','finished') then
    if p.status<>'scheduled' then raise exception 'Accept the session first.'; end if;
    if action='finished' and coalesce(s.states->>me::text,'') not in ('training','finished') then raise exception 'Start before finishing.'; end if;
    if action='ready' and coalesce(s.states->>me::text,'') in ('training','finished') then raise exception 'Session already started.'; end if;
    if action='training' and s.states->>me::text='finished' then raise exception 'Session already finished.'; end if;
    update public.shared_workout_sessions set states=states || jsonb_build_object(me::text,action),
      locked_at=case when action='training' then coalesce(locked_at,now()) else locked_at end where planned_workout_id=workout_id;
  elsif action<>'read' then raise exception 'Invalid action.'; end if;
  select * into s from public.shared_workout_sessions where planned_workout_id=workout_id;
  return jsonb_build_object('plan',s.exercise_plan,'locked',s.locked_at is not null,'states',s.states);
end; $$;
revoke all on function public.shared_session_available(), public.workout_session_action(uuid,text,jsonb) from public,anon;
grant execute on function public.shared_session_available(), public.workout_session_action(uuid,text,jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
