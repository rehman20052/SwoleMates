-- Incoming match requests you can accept. Re-running replaces only these three testers.
-- Gio, Abdur, and every other real match stay in place.
-- Remove them later with supabase/delete-discover-testers.sql

alter table public.discover_profiles drop constraint if exists discover_profiles_id_fkey;
alter table public.discover_profiles
  add column if not exists is_tester boolean not null default false;

alter table public.match_requests drop constraint if exists match_requests_from_user_id_fkey;
alter table public.match_requests drop constraint if exists match_requests_to_user_id_fkey;
alter table public.match_messages drop constraint if exists match_messages_sender_id_fkey;

delete from public.match_requests
where from_user_id::text like '00000000-0000-4000-a000-00000000030%'
   or to_user_id::text like '00000000-0000-4000-a000-00000000030%';

delete from public.discover_profiles
where id::text like '00000000-0000-4000-a000-00000000030%';

do $$
declare
  me uuid;
  real_count integer;
begin
  select count(*) into real_count
  from public.discover_profiles
  where is_tester = false;

  if real_count = 1 then
    select id into me
    from public.discover_profiles
    where is_tester = false;
  else
    select id into me
    from public.discover_profiles
    where is_tester = false
      and lower(btrim(profile->>'fullName')) = 'zub karim';
  end if;

  if me is null then
    raise exception 'Could not tell which account these tester matches belong to.';
  end if;

  insert into public.discover_profiles (id, profile, latitude, longitude, is_tester)
  values
    (
      '00000000-0000-4000-a000-000000000301',
      jsonb_build_object(
        'fullName', 'Lila Brooks', 'age', '26', 'gender', 'Female', 'primaryGym', 'Peak Barbell',
        'hometown', 'Huntington', 'about', 'Incoming tester request.', 'experienceLevel', 'Intermediate',
        'selectedGoals', jsonb_build_array('Strength training'), 'availabilityDays', jsonb_build_array('Tue'),
        'availabilityTimes', jsonb_build_array('Evening'), 'bench', '95 lbs', 'squat', '145 lbs', 'deadlift', '185 lbs',
        'customLiftName', '', 'customLift', 'N/A', 'photos', jsonb_build_array('https://randomuser.me/api/portraits/women/47.jpg'),
        'photoCaptions', jsonb_build_array(''), 'prompts', '[]'::jsonb
      ),
      null, null, true
    ),
    (
      '00000000-0000-4000-a000-000000000302',
      jsonb_build_object(
        'fullName', 'Noah Patel', 'age', '31', 'gender', 'Male', 'primaryGym', 'Iron and Oak',
        'hometown', 'Babylon', 'about', 'Incoming tester request.', 'experienceLevel', 'Advanced',
        'selectedGoals', jsonb_build_array('Gain mass'), 'availabilityDays', jsonb_build_array('Thu'),
        'availabilityTimes', jsonb_build_array('Morning'), 'bench', '245 lbs', 'squat', '365 lbs', 'deadlift', '455 lbs',
        'customLiftName', '', 'customLift', 'N/A', 'photos', jsonb_build_array('https://randomuser.me/api/portraits/men/41.jpg'),
        'photoCaptions', jsonb_build_array(''), 'prompts', '[]'::jsonb
      ),
      null, null, true
    ),
    (
      '00000000-0000-4000-a000-000000000303',
      jsonb_build_object(
        'fullName', 'Mina Cho', 'age', '28', 'gender', 'Female', 'primaryGym', 'South Shore Strength',
        'hometown', 'Bay Shore', 'about', 'Incoming tester request.', 'experienceLevel', 'Beginner',
        'selectedGoals', jsonb_build_array('Fat loss'), 'availabilityDays', jsonb_build_array('Sat'),
        'availabilityTimes', jsonb_build_array('Afternoon'), 'bench', '65 lbs', 'squat', '115 lbs', 'deadlift', '155 lbs',
        'customLiftName', '', 'customLift', 'N/A', 'photos', jsonb_build_array('https://randomuser.me/api/portraits/women/65.jpg'),
        'photoCaptions', jsonb_build_array(''), 'prompts', '[]'::jsonb
      ),
      null, null, true
    );

  insert into public.match_requests (id, from_user_id, to_user_id, status, created_at)
  values
    ('00000000-0000-4000-b000-000000000021', '00000000-0000-4000-a000-000000000301', me, 'pending', now() - interval '30 minutes'),
    ('00000000-0000-4000-b000-000000000022', '00000000-0000-4000-a000-000000000302', me, 'pending', now() - interval '18 minutes'),
    ('00000000-0000-4000-b000-000000000023', '00000000-0000-4000-a000-000000000303', me, 'pending', now() - interval '6 minutes');
end $$;
