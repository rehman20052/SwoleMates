-- Apply after matches.sql, social.sql and account-sync.sql. Additive, rerunnable.
begin;
alter table public.match_requests add column if not exists requested_by uuid references auth.users(id);
alter table public.match_requests add column if not exists ended_at timestamptz;
alter table public.match_requests add column if not exists ended_by uuid references auth.users(id);
update public.match_requests set requested_by = from_user_id where requested_by is null;
alter table public.match_requests alter column requested_by set not null;
alter table public.match_requests drop constraint if exists match_requests_status_check;
alter table public.match_requests add constraint match_requests_status_check check(status in ('pending','accepted','declined','unmatched'));
revoke insert, update, delete on public.match_requests from authenticated;

create or replace function public.contact_blocked(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.block where (user_id=a and blocked_id=b) or (user_id=b and blocked_id=a));
$$;
create or replace function public.blocked_contact_ids() returns table(person uuid)
language sql stable security definer set search_path = '' as $$
  select blocked_id from public.block where user_id=auth.uid()
  union select user_id from public.block where blocked_id=auth.uid();
$$;
create or replace function public.guard_match_participants() returns trigger language plpgsql set search_path = '' as $$
begin
  if new.id is distinct from old.id or new.from_user_id is distinct from old.from_user_id or new.to_user_id is distinct from old.to_user_id then
    raise exception 'Match participants are immutable.' using errcode='42501';
  end if;
  if new.requested_by not in (new.from_user_id,new.to_user_id) then raise exception 'Invalid requester.'; end if;
  return new;
end; $$;
drop trigger if exists guard_match_participants on public.match_requests;
create trigger guard_match_participants before update on public.match_requests for each row execute function public.guard_match_participants();

-- Every contact mutation takes the same pair lock, including block creation.
create or replace function public.contact_lock(a uuid,b uuid) returns void language sql set search_path = '' as $$
  select pg_advisory_xact_lock(hashtextextended(least(a,b)::text || greatest(a,b)::text, 1));
$$;
drop function if exists public.send_match_request(uuid);
create function public.send_match_request(target_user uuid) returns void language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); r public.match_requests;
begin
  if me is null or me=target_user then raise exception 'Invalid requester.' using errcode='42501'; end if;
  perform public.contact_lock(me,target_user);
  if public.contact_blocked(me,target_user) then raise exception 'Contact is blocked.' using errcode='42501'; end if;
  select * into r from public.match_requests where (from_user_id=me and to_user_id=target_user) or (to_user_id=me and from_user_id=target_user)
    order by case status when 'accepted' then 0 when 'pending' then 1 else 2 end, created_at desc limit 1 for update;
  if r.id is null then
    insert into public.match_requests(from_user_id,to_user_id,requested_by) values(me,target_user,me);
  elsif r.status='pending' and r.requested_by<>me then
    update public.match_requests set status='accepted' where id=r.id;
  elsif r.status in ('declined','unmatched') then
    update public.match_requests set status='pending',requested_by=me,created_at=now(),ended_at=null,ended_by=null where id=r.id;
  end if;
end; $$;
create or replace function public.transition_match(request_id uuid, action text) returns void language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); r public.match_requests; next_status text;
begin
  select * into r from public.match_requests where id=request_id;
  if me is null or r.id is null or me not in (r.from_user_id,r.to_user_id) then raise exception 'Not a participant.' using errcode='42501'; end if;
  perform public.contact_lock(r.from_user_id,r.to_user_id);
  select * into r from public.match_requests where id=request_id for update;
  if public.contact_blocked(r.from_user_id,r.to_user_id) then raise exception 'Contact is blocked.' using errcode='42501'; end if;
  if action in ('accept','decline') and r.status='pending' and r.requested_by<>me then
    next_status := case action when 'accept' then 'accepted' else 'declined' end;
  elsif action='cancel' and r.status='pending' and r.requested_by=me then next_status:='declined';
  elsif action='unmatch' and r.status='accepted' then next_status:='unmatched';
  else raise exception 'Invalid match transition.' using errcode='42501'; end if;
  update public.match_requests set status=next_status, ended_at=case when next_status<>'accepted' then now() else null end,
    ended_by=case when next_status<>'accepted' then me else null end where id=request_id;
  if next_status in ('declined','unmatched') then
    update public.planned_workout set status='cancelled' where match_id=request_id and status in ('proposed','scheduled');
  end if;
end; $$;
create or replace function public.disable_blocked_contact() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform public.contact_lock(new.user_id,new.blocked_id);
  update public.match_requests set status='unmatched',ended_at=now(),ended_by=new.user_id
    where (from_user_id=new.user_id and to_user_id=new.blocked_id) or (to_user_id=new.user_id and from_user_id=new.blocked_id);
  update public.planned_workout set status='cancelled' where status in ('proposed','scheduled') and match_id in
    (select id from public.match_requests where (from_user_id=new.user_id and to_user_id=new.blocked_id) or (to_user_id=new.user_id and from_user_id=new.blocked_id));
  return new;
end; $$;
drop trigger if exists disable_blocked_contact on public.block;
create trigger disable_blocked_contact before insert on public.block for each row execute function public.disable_blocked_contact();
create or replace function public.block_contact(person uuid) returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or person=auth.uid() then raise exception 'Invalid block.' using errcode='42501'; end if;
  perform public.contact_lock(auth.uid(),person);
  insert into public.block(user_id,blocked_id) values(auth.uid(),person) on conflict do nothing;
end; $$;

create or replace function public.public_profile_fields(profile jsonb) returns jsonb language sql immutable set search_path = '' as $$
  select coalesce(jsonb_object_agg(key,value),'{}'::jsonb) from jsonb_each(profile) where key = any(array[
    'fullName','age','gender','primaryGym','gymAddress','experienceLevel','goals','availabilityDays','availabilityTimes',
    'about','hometown','selectedGoals','prompts','photos','avatar','photoMedia','photoCaptions','displayLifts','bench','squat','deadlift','customLiftName','customLift']);
$$;
create or replace function public.my_connections() returns table(id uuid,other_user_id uuid,direction text,status text,created_at timestamptz,profile jsonb,last_message text)
language sql stable security definer set search_path = '' as $$
  select r.id, case when r.from_user_id=auth.uid() then r.to_user_id else r.from_user_id end,
    case when r.requested_by=auth.uid() then 'outgoing' else 'incoming' end,r.status,r.created_at,
    public.public_profile_fields(p.profile),(select m.body from public.match_messages m where m.match_id=r.id order by m.created_at desc limit 1)
  from public.match_requests r left join public.discover_profiles p on p.id=case when r.from_user_id=auth.uid() then r.to_user_id else r.from_user_id end
  where auth.uid() in (r.from_user_id,r.to_user_id) and not public.contact_blocked(r.from_user_id,r.to_user_id);
$$;
create or replace function public.discover_people() returns table(id uuid,profile jsonb,distance_miles numeric)
language sql stable security definer set search_path = '' as $$
  select p.id,public.public_profile_fields(p.profile),round(public.miles_between(me.latitude,me.longitude,p.latitude,p.longitude)::numeric)
  from public.discover_profiles me join public.discover_profiles p on p.id<>me.id
  where me.id=auth.uid() and me.latitude is not null and me.longitude is not null and p.latitude is not null and p.longitude is not null
    and not p.paused and not public.contact_blocked(me.id,p.id) and public.miles_between(me.latitude,me.longitude,p.latitude,p.longitude)<=50;
$$;
create or replace function public.public_match_profile(person uuid) returns jsonb language sql stable security definer set search_path = '' as $$
  select public.public_profile_fields(p.profile) from public.discover_profiles p join public.user_account a on a.id=p.id
  where p.id=person and auth.uid() is not null and a.social_public and not public.contact_blocked(auth.uid(),person);
$$;

-- Restrictive policies protect all existing permissive policies and future edits.
create or replace function public.can_contact_match(target uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.match_requests r where r.id=target and r.status='accepted'
    and auth.uid() in (r.from_user_id,r.to_user_id) and not public.contact_blocked(r.from_user_id,r.to_user_id));
$$;
drop policy if exists contact_safety on public.match_messages;
create policy contact_safety on public.match_messages as restrictive for all to authenticated using(public.can_contact_match(match_id)) with check(public.can_contact_match(match_id));
drop policy if exists contact_safety on public.planned_workout;
create policy contact_safety on public.planned_workout as restrictive for all to authenticated using(public.can_contact_match(match_id)) with check(public.can_contact_match(match_id));
do $$ begin
  if to_regprocedure('public.collapse_mutual_requests()') is not null then
    revoke all on function public.collapse_mutual_requests() from public,anon,authenticated;
  end if;
  if to_regprocedure('public.cancel_match_request(uuid)') is not null then
    revoke all on function public.cancel_match_request(uuid) from public,anon,authenticated;
  end if;
end $$;
revoke all on function public.contact_lock(uuid,uuid), public.contact_blocked(uuid,uuid), public.block_contact(uuid), public.transition_match(uuid,text), public.send_match_request(uuid), public.blocked_contact_ids(), public.can_contact_match(uuid) from public,anon;
grant execute on function public.contact_blocked(uuid,uuid), public.block_contact(uuid), public.transition_match(uuid,text), public.send_match_request(uuid), public.blocked_contact_ids(), public.can_contact_match(uuid) to authenticated;
notify pgrst,'reload schema';
commit;

