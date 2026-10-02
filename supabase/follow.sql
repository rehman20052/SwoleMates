-- A follow is not a match. match_requests is a match, with chat and a workout.
-- post_like is one like on one post. user_account has no list of people you follow.
-- This table is the one-way list of public accounts you follow, and when you followed them.
-- Posts that already existed stay in their normal place. Posts created at or after
-- created_at are the ones that lead the Public tab.
-- Safe to run more than once.

create table if not exists public.follow (
  follower_id uuid not null references auth.users (id) on delete cascade,
  following_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, following_id),
  constraint follow_not_self check (follower_id <> following_id)
);

alter table public.follow enable row level security;

-- The app cannot pick an earlier time to float old posts, and cannot follow as someone else.
create or replace function public.follow_stamp()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Sign in again before following someone.';
  end if;
  new.follower_id = (select auth.uid());
  new.created_at = now();
  return new;
end;
$$;

drop trigger if exists follow_stamp on public.follow;
create trigger follow_stamp
  before insert on public.follow
  for each row
  execute function public.follow_stamp();

revoke all on function public.follow_stamp() from public, anon, authenticated;

drop policy if exists "you read your follows" on public.follow;
drop policy if exists "you follow public accounts" on public.follow;
drop policy if exists "you unfollow" on public.follow;

create policy "you read your follows"
on public.follow
for select
to authenticated
using (follower_id = (select auth.uid()));

create policy "you follow public accounts"
on public.follow
for insert
to authenticated
with check (
  follower_id = (select auth.uid())
  and follower_id <> following_id
  and public.social_is_public(following_id)
  and public.can_see_author(following_id)
);

create policy "you unfollow"
on public.follow
for delete
to authenticated
using (follower_id = (select auth.uid()));

revoke all on table public.follow from public, anon;
grant select, insert, delete on table public.follow to authenticated;
