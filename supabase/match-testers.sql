-- Fresh Chat testers. Re-running this replaces testers and leaves real people alone.
-- Three people have requested you. Three matches are already accepted and still new.
-- Remove them later with supabase/delete-discover-testers.sql

alter table public.discover_profiles drop constraint if exists discover_profiles_id_fkey;
alter table public.discover_profiles
  add column if not exists is_tester boolean not null default false;

alter table public.match_requests drop constraint if exists match_requests_from_user_id_fkey;
alter table public.match_requests drop constraint if exists match_requests_to_user_id_fkey;
alter table public.match_messages drop constraint if exists match_messages_sender_id_fkey;

delete from public.match_requests
where from_user_id::text like '00000000-0000-4000-a000-%'
   or to_user_id::text like '00000000-0000-4000-a000-%';

delete from public.discover_profiles where is_tester = true;

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
      '00000000-0000-4000-a000-000000000201',
      jsonb_build_object(
        'fullName', 'Camille Ortiz', 'age', '25', 'gender', 'Female', 'primaryGym', 'Harbor Strength',
        'hometown', 'Deer Park', 'about', 'Accepted tester match.', 'experienceLevel', 'Intermediate',
        'selectedGoals', jsonb_build_array('Strength training'), 'availabilityDays', jsonb_build_array('Tue'),
        'availabilityTimes', jsonb_build_array('Evening'), 'bench', '105 lbs', 'squat', '165 lbs', 'deadlift', '215 lbs',
        'customLiftName', '', 'customLift', 'N/A', 'photos', jsonb_build_array('https://randomuser.me/api/portraits/women/21.jpg'),
        'photoCaptions', jsonb_build_array(''), 'prompts', '[]'::jsonb
      ),
      null, null, true
    ),
    (
      '00000000-0000-4000-a000-000000000202',
      jsonb_build_object(
        'fullName', 'Theo Nguyen', 'age', '30', 'gender', 'Male', 'primaryGym', 'Iron Harbor',
        'hometown', 'Brentwood', 'about', 'Accepted tester match.', 'experienceLevel', 'Advanced',
        'selectedGoals', jsonb_build_array('Gain mass'), 'availabilityDays', jsonb_build_array('Thu'),
        'availabilityTimes', jsonb_build_array('Morning'), 'bench', '205 lbs', 'squat', '295 lbs', 'deadlift', '365 lbs',
        'customLiftName', '', 'customLift', 'N/A', 'photos', jsonb_build_array('https://randomuser.me/api/portraits/men/15.jpg'),
        'photoCaptions', jsonb_build_array(''), 'prompts', '[]'::jsonb
      ),
      null, null, true
    ),
    (
      '00000000-0000-4000-a000-000000000203',
      jsonb_build_object(
        'fullName', 'Ruby Kim', 'age', '23', 'gender', 'Female', 'primaryGym', 'Pine Aire Fitness',
        'hometown', 'West Babylon', 'about', 'Accepted tester match.', 'experienceLevel', 'Beginner',
        'selectedGoals', jsonb_build_array('Fat loss'), 'availabilityDays', jsonb_build_array('Sat'),
        'availabilityTimes', jsonb_build_array('Afternoon'), 'bench', '65 lbs', 'squat', '115 lbs', 'deadlift', '155 lbs',
        'customLiftName', '', 'customLift', 'N/A', 'photos', jsonb_build_array('https://randomuser.me/api/portraits/women/33.jpg'),
        'photoCaptions', jsonb_build_array(''), 'prompts', '[]'::jsonb
      ),
      null, null, true
    ),
    (
      '00000000-0000-4000-a000-000000000204',
      jsonb_build_object(
        'fullName', 'Sofia Alvarez', 'age', '24', 'gender', 'Female', 'primaryGym', 'North Shore Athletic',
        'hometown', 'Deer Park', 'about', 'Incoming tester request.', 'experienceLevel', 'Intermediate',
        'selectedGoals', jsonb_build_array('Strength training'), 'availabilityDays', jsonb_build_array('Mon'),
        'availabilityTimes', jsonb_build_array('Evening'), 'bench', '95 lbs', 'squat', '155 lbs', 'deadlift', '205 lbs',
        'customLiftName', '', 'customLift', 'N/A', 'photos', jsonb_build_array('https://randomuser.me/api/portraits/women/44.jpg'),
        'photoCaptions', jsonb_build_array(''), 'prompts', '[]'::jsonb
      ),
      null, null, true
    ),
    (
      '00000000-0000-4000-a000-000000000205',
      jsonb_build_object(
        'fullName', 'Jordan Hale', 'age', '29', 'gender', 'Male', 'primaryGym', 'Lift House',
        'hometown', 'Wyandanch', 'about', 'Incoming tester request.', 'experienceLevel', 'Advanced',
        'selectedGoals', jsonb_build_array('Gain mass'), 'availabilityDays', jsonb_build_array('Fri'),
        'availabilityTimes', jsonb_build_array('Morning'), 'bench', '225 lbs', 'squat', '315 lbs', 'deadlift', '405 lbs',
        'customLiftName', '', 'customLift', 'N/A', 'photos', jsonb_build_array('https://randomuser.me/api/portraits/men/32.jpg'),
        'photoCaptions', jsonb_build_array(''), 'prompts', '[]'::jsonb
      ),
      null, null, true
    ),
    (
      '00000000-0000-4000-a000-000000000206',
      jsonb_build_object(
        'fullName', 'Priya Shah', 'age', '27', 'gender', 'Female', 'primaryGym', 'Oak Street Athletics',
        'hometown', 'North Babylon', 'about', 'Incoming tester request.', 'experienceLevel', 'Beginner',
        'selectedGoals', jsonb_build_array('Endurance'), 'availabilityDays', jsonb_build_array('Sun'),
        'availabilityTimes', jsonb_build_array('Afternoon'), 'bench', '75 lbs', 'squat', '125 lbs', 'deadlift', '165 lbs',
        'customLiftName', '', 'customLift', 'N/A', 'photos', jsonb_build_array('https://randomuser.me/api/portraits/women/68.jpg'),
        'photoCaptions', jsonb_build_array(''), 'prompts', '[]'::jsonb
      ),
      null, null, true
    );

  insert into public.match_requests (id, from_user_id, to_user_id, status, created_at)
  values
    ('00000000-0000-4000-b000-000000000011', me, '00000000-0000-4000-a000-000000000201', 'accepted', now() - interval '3 days'),
    ('00000000-0000-4000-b000-000000000012', me, '00000000-0000-4000-a000-000000000202', 'accepted', now() - interval '2 days'),
    ('00000000-0000-4000-b000-000000000013', me, '00000000-0000-4000-a000-000000000203', 'accepted', now() - interval '1 day'),
    ('00000000-0000-4000-b000-000000000014', '00000000-0000-4000-a000-000000000204', me, 'pending', now() - interval '40 minutes'),
    ('00000000-0000-4000-b000-000000000015', '00000000-0000-4000-a000-000000000205', me, 'pending', now() - interval '25 minutes'),
    ('00000000-0000-4000-b000-000000000016', '00000000-0000-4000-a000-000000000206', me, 'pending', now() - interval '10 minutes');
end $$;
