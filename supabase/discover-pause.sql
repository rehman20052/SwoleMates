-- Hides a person from other people's Discover without deleting their account.
-- Adds a column on discover_profiles. Does not create a new table.
-- Safe to run more than once.

alter table public.discover_profiles
  add column if not exists paused boolean not null default false;

create or replace function public.discover_people()
returns table (
  id uuid,
  profile jsonb,
  distance_miles numeric
)
language sql
stable
security definer
set search_path = public
as $$
  select
    other.id,
    other.profile,
    round(public.miles_between(me.latitude, me.longitude, other.latitude, other.longitude)::numeric)
  from public.discover_profiles me
  join public.discover_profiles other on other.id <> me.id
  where me.id = (select auth.uid())
    and me.latitude is not null
    and me.longitude is not null
    and other.latitude is not null
    and other.longitude is not null
    and coalesce(other.paused, false) = false
    and public.miles_between(me.latitude, me.longitude, other.latitude, other.longitude) <= 50;
$$;

revoke all on function public.discover_people() from public;
revoke all on function public.discover_people() from anon;
grant execute on function public.discover_people() to authenticated;

notify pgrst, 'reload schema';
