-- Public Social testers. They are not matched with anyone, so they show
-- on the Public tab. Re-running replaces only these three. Real posts stay.
-- Remove them later with supabase/delete-discover-testers.sql

delete from public.discover_profiles
where id in (
  '00000000-0000-4000-a000-000000000501',
  '00000000-0000-4000-a000-000000000502',
  '00000000-0000-4000-a000-000000000503'
);

delete from public.profile_photo
where user_id in (
  '00000000-0000-4000-a000-000000000501',
  '00000000-0000-4000-a000-000000000502',
  '00000000-0000-4000-a000-000000000503'
);

delete from public.user_account
where id in (
  '00000000-0000-4000-a000-000000000501',
  '00000000-0000-4000-a000-000000000502',
  '00000000-0000-4000-a000-000000000503'
);

delete from auth.identities
where user_id in (
  '00000000-0000-4000-a000-000000000501',
  '00000000-0000-4000-a000-000000000502',
  '00000000-0000-4000-a000-000000000503'
);

delete from auth.users
where id in (
  '00000000-0000-4000-a000-000000000501',
  '00000000-0000-4000-a000-000000000502',
  '00000000-0000-4000-a000-000000000503'
);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-4000-a000-000000000501',
    'authenticated', 'authenticated', 'mina.alvarez.501@swolemates.test',
    extensions.crypt('swolemates-tester-seed-501', extensions.gen_salt('bf')),
    now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
    now(), now(), '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-4000-a000-000000000502',
    'authenticated', 'authenticated', 'jordan.hale.502@swolemates.test',
    extensions.crypt('swolemates-tester-seed-502', extensions.gen_salt('bf')),
    now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
    now(), now(), '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-4000-a000-000000000503',
    'authenticated', 'authenticated', 'priya.shah.503@swolemates.test',
    extensions.crypt('swolemates-tester-seed-503', extensions.gen_salt('bf')),
    now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
    now(), now(), '', '', '', ''
  );

insert into public.user_account (
  id, full_name, birthdate, gender, hometown, about, fitness_level,
  bench_lbs, squat_lbs, deadlift_lbs, social_public, updated_at
)
values
  (
    '00000000-0000-4000-a000-000000000501',
    'Mina Alvarez', date '1999-06-14', 'Female', 'Deer Park',
    'Looking for a consistent training partner nearby.', 'Intermediate',
    115, 185, 225, true, now()
  ),
  (
    '00000000-0000-4000-a000-000000000502',
    'Jordan Hale', date '1997-01-22', 'Male', 'Babylon',
    'Looking for a consistent training partner nearby.', 'Advanced',
    225, 315, 405, true, now()
  ),
  (
    '00000000-0000-4000-a000-000000000503',
    'Priya Shah', date '2001-09-03', 'Female', 'Huntington',
    'Looking for a consistent training partner nearby.', 'Beginner',
    75, 135, 165, true, now()
  );

insert into public.profile_photo (photo_id, user_id, storage_path, caption, sort_order)
values
  ('00000000-0000-4000-f000-000000000501', '00000000-0000-4000-a000-000000000501', 'https://randomuser.me/api/portraits/women/44.jpg', '', 1),
  ('00000000-0000-4000-f000-000000000502', '00000000-0000-4000-a000-000000000502', 'https://randomuser.me/api/portraits/men/52.jpg', '', 1),
  ('00000000-0000-4000-f000-000000000503', '00000000-0000-4000-a000-000000000503', 'https://randomuser.me/api/portraits/women/68.jpg', '', 1);

insert into public.discover_profiles (id, profile, latitude, longitude, is_tester)
values
  (
    '00000000-0000-4000-a000-000000000501',
    jsonb_build_object(
      'fullName', 'Mina Alvarez', 'age', '27', 'gender', 'Female', 'primaryGym', 'Harbor Strength',
      'hometown', 'Deer Park', 'about', 'Looking for a consistent training partner nearby.', 'experienceLevel', 'Intermediate',
      'selectedGoals', jsonb_build_array('Strength training'), 'availabilityDays', jsonb_build_array('Tue', 'Thu'),
      'availabilityTimes', jsonb_build_array('Evening'), 'bench', '115 lbs', 'squat', '185 lbs', 'deadlift', '225 lbs',
      'customLiftName', '', 'customLift', 'N/A',
      'photos', jsonb_build_array('https://randomuser.me/api/portraits/women/44.jpg'),
      'photoCaptions', jsonb_build_array(''),
      'prompts', jsonb_build_array(
        jsonb_build_object('prompt', 'My current obsession in the gym is...', 'answer', 'Getting stronger without missing workouts.'),
        jsonb_build_object('prompt', 'My go-to pre-workout ritual involves...', 'answer', 'A short walk and a playlist.'),
        jsonb_build_object('prompt', 'We''ll get along if you never...', 'answer', 'Skip the warmup.')
      )
    ),
    null, null, true
  ),
  (
    '00000000-0000-4000-a000-000000000502',
    jsonb_build_object(
      'fullName', 'Jordan Hale', 'age', '29', 'gender', 'Male', 'primaryGym', 'Iron Harbor',
      'hometown', 'Babylon', 'about', 'Looking for a consistent training partner nearby.', 'experienceLevel', 'Advanced',
      'selectedGoals', jsonb_build_array('Gain mass'), 'availabilityDays', jsonb_build_array('Mon', 'Wed', 'Fri'),
      'availabilityTimes', jsonb_build_array('Morning'), 'bench', '225 lbs', 'squat', '315 lbs', 'deadlift', '405 lbs',
      'customLiftName', '', 'customLift', 'N/A',
      'photos', jsonb_build_array('https://randomuser.me/api/portraits/men/52.jpg'),
      'photoCaptions', jsonb_build_array(''),
      'prompts', jsonb_build_array(
        jsonb_build_object('prompt', 'My current obsession in the gym is...', 'answer', 'Getting stronger without missing workouts.'),
        jsonb_build_object('prompt', 'My go-to pre-workout ritual involves...', 'answer', 'A short walk and a playlist.'),
        jsonb_build_object('prompt', 'We''ll get along if you never...', 'answer', 'Skip the warmup.')
      )
    ),
    null, null, true
  ),
  (
    '00000000-0000-4000-a000-000000000503',
    jsonb_build_object(
      'fullName', 'Priya Shah', 'age', '25', 'gender', 'Female', 'primaryGym', 'Pine Aire Fitness',
      'hometown', 'Huntington', 'about', 'Looking for a consistent training partner nearby.', 'experienceLevel', 'Beginner',
      'selectedGoals', jsonb_build_array('Fat loss'), 'availabilityDays', jsonb_build_array('Sat'),
      'availabilityTimes', jsonb_build_array('Afternoon'), 'bench', '75 lbs', 'squat', '135 lbs', 'deadlift', '165 lbs',
      'customLiftName', '', 'customLift', 'N/A',
      'photos', jsonb_build_array('https://randomuser.me/api/portraits/women/68.jpg'),
      'photoCaptions', jsonb_build_array(''),
      'prompts', jsonb_build_array(
        jsonb_build_object('prompt', 'My current obsession in the gym is...', 'answer', 'Getting stronger without missing workouts.'),
        jsonb_build_object('prompt', 'My go-to pre-workout ritual involves...', 'answer', 'A short walk and a playlist.'),
        jsonb_build_object('prompt', 'We''ll get along if you never...', 'answer', 'Skip the warmup.')
      )
    ),
    null, null, true
  );

insert into public.post (id, author_id, body, created_at)
values
  (
    '00000000-0000-4000-e000-000000000501',
    '00000000-0000-4000-a000-000000000501',
    'Leg day finally felt smooth. Squats moved and I still had something left for lunges.',
    now() - interval '4 minutes'
  ),
  (
    '00000000-0000-4000-e000-000000000511',
    '00000000-0000-4000-a000-000000000501',
    'Looking for someone who trains evenings at Harbor Strength.',
    now() - interval '2 hours'
  ),
  (
    '00000000-0000-4000-e000-000000000502',
    '00000000-0000-4000-a000-000000000502',
    'Hit a bench PR this morning. 225 for three, then called it before my shoulders complained.',
    now() - interval '18 minutes'
  ),
  (
    '00000000-0000-4000-e000-000000000503',
    '00000000-0000-4000-a000-000000000503',
    'First week of actually showing up. The warmup felt longer than the workout and that is fine.',
    now() - interval '40 minutes'
  );

insert into public.post_like (post_id, user_id, created_at)
values
  (
    '00000000-0000-4000-e000-000000000501',
    '00000000-0000-4000-a000-000000000502',
    now() - interval '2 minutes'
  );
