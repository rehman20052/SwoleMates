-- Match requests and the chats they become. Coordinates are not stored here.

create table if not exists public.match_requests (
  id uuid primary key default gen_random_uuid(),
  from_user_id uuid not null references auth.users (id) on delete cascade,
  to_user_id uuid not null references auth.users (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now(),
  constraint match_requests_pair_key unique (from_user_id, to_user_id),
  constraint match_requests_not_self check (from_user_id <> to_user_id)
);

create table if not exists public.match_messages (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.match_requests (id) on delete cascade,
  sender_id uuid not null references auth.users (id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 1000),
  created_at timestamptz not null default now()
);

alter table public.match_requests enable row level security;
alter table public.match_messages enable row level security;

drop policy if exists "participants read match requests" on public.match_requests;
drop policy if exists "users send match requests" on public.match_requests;
drop policy if exists "recipient responds to match request" on public.match_requests;
drop policy if exists "sender updates match request" on public.match_requests;
drop policy if exists "sender cancels pending request" on public.match_requests;

create policy "participants read match requests"
on public.match_requests for select
to authenticated
using (
  from_user_id = (select auth.uid())
  or to_user_id = (select auth.uid())
);

create policy "users send match requests"
on public.match_requests for insert
to authenticated
with check (
  from_user_id = (select auth.uid())
  and status = 'pending'
);

create policy "recipient responds to match request"
on public.match_requests for update
to authenticated
using (to_user_id = (select auth.uid()))
with check (to_user_id = (select auth.uid()) and status in ('accepted', 'declined'));

create policy "sender updates match request"
on public.match_requests for update
to authenticated
using (from_user_id = (select auth.uid()))
with check (from_user_id = (select auth.uid()) and status = 'pending');

create policy "sender cancels pending request"
on public.match_requests for delete
to authenticated
using (from_user_id = (select auth.uid()) and status = 'pending');

drop policy if exists "participants read messages" on public.match_messages;
drop policy if exists "participants send messages" on public.match_messages;

create policy "participants read messages"
on public.match_messages for select
to authenticated
using (
  exists (
    select 1
    from public.match_requests request
    where request.id = match_id
      and request.status = 'accepted'
      and (request.from_user_id = (select auth.uid()) or request.to_user_id = (select auth.uid()))
  )
);

create policy "participants send messages"
on public.match_messages for insert
to authenticated
with check (
  sender_id = (select auth.uid())
  and exists (
    select 1
    from public.match_requests request
    where request.id = match_id
      and request.status = 'accepted'
      and (request.from_user_id = (select auth.uid()) or request.to_user_id = (select auth.uid()))
  )
);

create or replace function public.my_connections()
returns table (
  id uuid,
  other_user_id uuid,
  direction text,
  status text,
  created_at timestamptz,
  profile jsonb,
  last_message text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    request.id,
    case
      when request.from_user_id = (select auth.uid()) then request.to_user_id
      else request.from_user_id
    end as other_user_id,
    case
      when request.from_user_id = (select auth.uid()) then 'outgoing'
      else 'incoming'
    end as direction,
    request.status,
    request.created_at,
    other.profile,
    (
      select messages.body
      from public.match_messages messages
      where messages.match_id = request.id
      order by messages.created_at desc
      limit 1
    ) as last_message
  from public.match_requests request
  left join public.discover_profiles other
    on other.id = case
      when request.from_user_id = (select auth.uid()) then request.to_user_id
      else request.from_user_id
    end
  where request.from_user_id = (select auth.uid())
     or request.to_user_id = (select auth.uid());
$$;

revoke all on function public.my_connections() from public;
revoke all on function public.my_connections() from anon;
grant execute on function public.my_connections() to authenticated;

-- When both people have asked to train, keep one accepted chat and drop the extra request.
create or replace function public.collapse_mutual_requests()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  pair record;
begin
  if me is null then
    return;
  end if;

  for pair in
    select other_id
    from (
      select case when from_user_id = me then to_user_id else from_user_id end as other_id
      from public.match_requests
      where from_user_id = me or to_user_id = me
      group by 1
      having count(*) > 1
    ) pairs
  loop
    perform pg_advisory_xact_lock(
      hashtext(least(me::text, pair.other_id::text) || ':' || greatest(me::text, pair.other_id::text))
    );

    update public.match_requests
    set status = 'accepted'
    where from_user_id = pair.other_id
      and to_user_id = me
      and status = 'pending'
      and exists (
        select 1
        from public.match_requests mine
        where mine.from_user_id = me
          and mine.to_user_id = pair.other_id
          and mine.status = 'pending'
      );

    delete from public.match_requests pending
    where pending.status = 'pending'
      and (
        (pending.from_user_id = me and pending.to_user_id = pair.other_id)
        or (pending.from_user_id = pair.other_id and pending.to_user_id = me)
      )
      and exists (
        select 1
        from public.match_requests accepted
        where accepted.status = 'accepted'
          and accepted.id <> pending.id
          and (
            (accepted.from_user_id = me and accepted.to_user_id = pair.other_id)
            or (accepted.from_user_id = pair.other_id and accepted.to_user_id = me)
          )
      );
  end loop;
end;
$$;

-- Sending a request back at someone who already asked accepts their request immediately.
create or replace function public.send_match_request(to_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  reverse_status text;
begin
  if me is null then
    raise exception 'Sign in again before sending a request.';
  end if;
  if me = to_user_id then
    raise exception 'You can''t send a request to yourself.';
  end if;

  perform pg_advisory_xact_lock(
    hashtext(least(me::text, to_user_id::text) || ':' || greatest(me::text, to_user_id::text))
  );

  select status into reverse_status
  from public.match_requests
  where from_user_id = to_user_id and to_user_id = me
  for update;

  if reverse_status is not null then
    if reverse_status <> 'accepted' then
      update public.match_requests
      set status = 'accepted'
      where from_user_id = to_user_id and to_user_id = me;
    end if;

    delete from public.match_requests
    where from_user_id = me
      and to_user_id = to_user_id
      and status <> 'accepted';
    return;
  end if;

  insert into public.match_requests (from_user_id, to_user_id, status)
  values (me, to_user_id, 'pending')
  on conflict (from_user_id, to_user_id)
  do update set status = 'pending', created_at = now()
  where public.match_requests.status = 'declined';
end;
$$;

revoke all on function public.collapse_mutual_requests() from public;
revoke all on function public.collapse_mutual_requests() from anon;
grant execute on function public.collapse_mutual_requests() to authenticated;

revoke all on function public.send_match_request(uuid) from public;
revoke all on function public.send_match_request(uuid) from anon;
grant execute on function public.send_match_request(uuid) to authenticated;

notify pgrst, 'reload schema';
