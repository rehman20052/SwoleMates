-- Public profile cards for Discover. Coordinates stay in this table and are
-- never returned to other clients. Distance is rounded inside discover_people().

create table if not exists public.discover_profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  profile jsonb not null,
  latitude double precision,
  longitude double precision,
  updated_at timestamptz not null default now()
);

alter table public.discover_profiles enable row level security;

drop policy if exists "users read their own discover profile" on public.discover_profiles;
drop policy if exists "users insert their discover profile" on public.discover_profiles;
drop policy if exists "users update their discover profile" on public.discover_profiles;

create policy "users read their own discover profile"
on public.discover_profiles for select
to authenticated
using (id = (select auth.uid()));

create policy "users insert their discover profile"
on public.discover_profiles for insert
to authenticated
with check (id = (select auth.uid()));

create policy "users update their discover profile"
on public.discover_profiles for update
to authenticated
using (id = (select auth.uid()))
with check (id = (select auth.uid()));

create or replace function public.strip_discover_coordinates()
returns trigger
language plpgsql
as $$
begin
  new.profile = new.profile - 'latitude' - 'longitude' - 'gymLatitude' - 'gymLongitude' - 'zipCode';
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists strip_discover_coordinates on public.discover_profiles;
create trigger strip_discover_coordinates
before insert or update on public.discover_profiles
for each row execute function public.strip_discover_coordinates();

create or replace function public.miles_between(lat1 float, lon1 float, lat2 float, lon2 float)
returns float
language sql
immutable
as $$
  select 3958.8 * 2 * atan2(sqrt(haversine.a), sqrt(1 - haversine.a))
  from (
    select pow(sin(radians(lat2 - lat1) / 2), 2)
      + cos(radians(lat1)) * cos(radians(lat2)) * pow(sin(radians(lon2 - lon1) / 2), 2) as a
  ) haversine;
$$;

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
    and public.miles_between(me.latitude, me.longitude, other.latitude, other.longitude) <= 50;
$$;

revoke all on function public.miles_between(float, float, float, float) from public;
revoke all on function public.discover_people() from public;
revoke all on function public.discover_people() from anon;
grant execute on function public.discover_people() to authenticated;

notify pgrst, 'reload schema';
