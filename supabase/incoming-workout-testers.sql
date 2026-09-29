-- Incoming match requests and proposed workouts for one signed-in account.
-- Re-running replaces only these four testers. Real chats stay in place.
-- Pending requests stay pending. Workout matches are inserted already accepted
-- so a proposal can exist; the workouts themselves stay proposed.
--
-- Insert order: auth.users, then user_account, then discover_profiles,
-- then match_requests, planned_workout, and match_messages.
-- user_account.id matches auth.users.id. match_requests.from_user_id and
-- planned_workout.created_by point at user_account. Chat still reads
-- discover_profiles through my_connections().
-- Remove them later with supabase/delete-discover-testers.sql

alter table public.discover_profiles
  add column if not exists is_tester boolean not null default false;

delete from public.match_messages
where match_id in (
  '00000000-0000-4000-b000-000000000401',
  '00000000-0000-4000-b000-000000000402',
  '00000000-0000-4000-b000-000000000403',
  '00000000-0000-4000-b000-000000000404'
)
or sender_id in (
  '00000000-0000-4000-a000-000000000401',
  '00000000-0000-4000-a000-000000000402',
  '00000000-0000-4000-a000-000000000403',
  '00000000-0000-4000-a000-000000000404'
);

delete from public.attendance
where planned_workout_id in (
  '00000000-0000-4000-c000-000000000403',
  '00000000-0000-4000-c000-000000000404'
)
or user_id in (
  '00000000-0000-4000-a000-000000000401',
  '00000000-0000-4000-a000-000000000402',
  '00000000-0000-4000-a000-000000000403',
  '00000000-0000-4000-a000-000000000404'
);

delete from public.workout_logs
where planned_workout_id in (
  '00000000-0000-4000-c000-000000000403',
  '00000000-0000-4000-c000-000000000404'
)
or user_id in (
  '00000000-0000-4000-a000-000000000401',
  '00000000-0000-4000-a000-000000000402',
  '00000000-0000-4000-a000-000000000403',
  '00000000-0000-4000-a000-000000000404'
);

delete from public.planned_workout
where planned_workout_id in (
  '00000000-0000-4000-c000-000000000403',
  '00000000-0000-4000-c000-000000000404'
)
or match_id in (
  '00000000-0000-4000-b000-000000000401',
  '00000000-0000-4000-b000-000000000402',
  '00000000-0000-4000-b000-000000000403',
  '00000000-0000-4000-b000-000000000404'
)
or created_by in (
  '00000000-0000-4000-a000-000000000401',
  '00000000-0000-4000-a000-000000000402',
  '00000000-0000-4000-a000-000000000403',
  '00000000-0000-4000-a000-000000000404'
);

delete from public.chat_read
where match_id in (
  '00000000-0000-4000-b000-000000000401',
  '00000000-0000-4000-b000-000000000402',
  '00000000-0000-4000-b000-000000000403',
  '00000000-0000-4000-b000-000000000404'
)
or user_id in (
  '00000000-0000-4000-a000-000000000401',
  '00000000-0000-4000-a000-000000000402',
  '00000000-0000-4000-a000-000000000403',
  '00000000-0000-4000-a000-000000000404'
);

delete from public.match_requests
where id in (
  '00000000-0000-4000-b000-000000000401',
  '00000000-0000-4000-b000-000000000402',
  '00000000-0000-4000-b000-000000000403',
  '00000000-0000-4000-b000-000000000404'
)
or from_user_id in (
  '00000000-0000-4000-a000-000000000401',
  '00000000-0000-4000-a000-000000000402',
  '00000000-0000-4000-a000-000000000403',
  '00000000-0000-4000-a000-000000000404'
)
or to_user_id in (
  '00000000-0000-4000-a000-000000000401',
  '00000000-0000-4000-a000-000000000402',
  '00000000-0000-4000-a000-000000000403',
  '00000000-0000-4000-a000-000000000404'
);

delete from public.discover_profiles
where id in (
  '00000000-0000-4000-a000-000000000401',
  '00000000-0000-4000-a000-000000000402',
  '00000000-0000-4000-a000-000000000403',
  '00000000-0000-4000-a000-000000000404'
);

delete from public.profile_photo
where user_id in (
  '00000000-0000-4000-a000-000000000401',
  '00000000-0000-4000-a000-000000000402',
  '00000000-0000-4000-a000-000000000403',
  '00000000-0000-4000-a000-000000000404'
);

delete from public.profile_prompt
where user_id in (
  '00000000-0000-4000-a000-000000000401',
  '00000000-0000-4000-a000-000000000402',
  '00000000-0000-4000-a000-000000000403',
  '00000000-0000-4000-a000-000000000404'
);

delete from public.user_availability
where user_id in (
  '00000000-0000-4000-a000-000000000401',
  '00000000-0000-4000-a000-000000000402',
  '00000000-0000-4000-a000-000000000403',
  '00000000-0000-4000-a000-000000000404'
);

delete from public.user_goal
where user_id in (
  '00000000-0000-4000-a000-000000000401',
  '00000000-0000-4000-a000-000000000402',
  '00000000-0000-4000-a000-000000000403',
  '00000000-0000-4000-a000-000000000404'
);

delete from public.user_account
where id in (
  '00000000-0000-4000-a000-000000000401',
  '00000000-0000-4000-a000-000000000402',
  '00000000-0000-4000-a000-000000000403',
  '00000000-0000-4000-a000-000000000404'
);

delete from auth.identities
where user_id in (
  '00000000-0000-4000-a000-000000000401',
  '00000000-0000-4000-a000-000000000402',
  '00000000-0000-4000-a000-000000000403',
  '00000000-0000-4000-a000-000000000404'
);

delete from auth.users
where id in (
  '00000000-0000-4000-a000-000000000401',
  '00000000-0000-4000-a000-000000000402',
  '00000000-0000-4000-a000-000000000403',
  '00000000-0000-4000-a000-000000000404'
);

do $$
declare
  me uuid := '7a67ab3f-5ee4-4e3d-9636-d8e73f8c98e1';
begin
  insert into auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at,
    confirmation_token,
    email_change,
    email_change_token_new,
    recovery_token
  )
  values
    (
      '00000000-0000-0000-0000-000000000000',
      '00000000-0000-4000-a000-000000000401',
      'authenticated',
      'authenticated',
      'sable.quinn.401@swolemates.test',
      extensions.crypt('swolemates-tester-seed-401', extensions.gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{}'::jsonb,
      now(),
      now(),
      '',
      '',
      '',
      ''
    ),
    (
      '00000000-0000-0000-0000-000000000000',
      '00000000-0000-4000-a000-000000000402',
      'authenticated',
      'authenticated',
      'mateo.ruiz.402@swolemates.test',
      extensions.crypt('swolemates-tester-seed-402', extensions.gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{}'::jsonb,
      now(),
      now(),
      '',
      '',
      '',
      ''
    ),
    (
      '00000000-0000-0000-0000-000000000000',
      '00000000-0000-4000-a000-000000000403',
      'authenticated',
      'authenticated',
      'elena.voss.403@swolemates.test',
      extensions.crypt('swolemates-tester-seed-403', extensions.gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{}'::jsonb,
      now(),
      now(),
      '',
      '',
      '',
      ''
    ),
    (
      '00000000-0000-0000-0000-000000000000',
      '00000000-0000-4000-a000-000000000404',
      'authenticated',
      'authenticated',
      'andre.blake.404@swolemates.test',
      extensions.crypt('swolemates-tester-seed-404', extensions.gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{}'::jsonb,
      now(),
      now(),
      '',
      '',
      '',
      ''
    );

  insert into public.user_account (
    id, full_name, birthdate, gender, hometown, about, fitness_level,
    bench_lbs, squat_lbs, deadlift_lbs, updated_at
  )
  values
    (
      '00000000-0000-4000-a000-000000000401',
      'Sable Quinn', date '2000-04-12', 'Female', 'Huntington',
      'Incoming tester request.', 'Intermediate',
      95, 145, 185, now()
    ),
    (
      '00000000-0000-4000-a000-000000000402',
      'Mateo Ruiz', date '1995-08-03', 'Male', 'Babylon',
      'Incoming tester request.', 'Advanced',
      225, 315, 405, now()
    ),
    (
      '00000000-0000-4000-a000-000000000403',
      'Elena Voss', date '1998-02-17', 'Female', 'Deer Park',
      'Accepted tester match with a proposed workout.', 'Intermediate',
      105, 165, 215, now()
    ),
    (
      '00000000-0000-4000-a000-000000000404',
      'Andre Blake', date '1996-11-09', 'Male', 'Wyandanch',
      'Accepted tester match with a proposed workout.', 'Advanced',
      205, 295, 365, now()
    )
  on conflict (id) do update set
    full_name = excluded.full_name,
    birthdate = excluded.birthdate,
    gender = excluded.gender,
    hometown = excluded.hometown,
    about = excluded.about,
    fitness_level = excluded.fitness_level,
    bench_lbs = excluded.bench_lbs,
    squat_lbs = excluded.squat_lbs,
    deadlift_lbs = excluded.deadlift_lbs,
    updated_at = excluded.updated_at;

  insert into public.discover_profiles (id, profile, latitude, longitude, is_tester)
  values
    (
      '00000000-0000-4000-a000-000000000401',
      jsonb_build_object(
        'fullName', 'Sable Quinn', 'age', '26', 'gender', 'Female', 'primaryGym', 'Peak Barbell',
        'hometown', 'Huntington', 'about', 'Incoming tester request.', 'experienceLevel', 'Intermediate',
        'selectedGoals', jsonb_build_array('Strength training'), 'availabilityDays', jsonb_build_array('Tue'),
        'availabilityTimes', jsonb_build_array('Evening'), 'bench', '95 lbs', 'squat', '145 lbs', 'deadlift', '185 lbs',
        'customLiftName', '', 'customLift', 'N/A', 'photos', jsonb_build_array('https://randomuser.me/api/portraits/women/47.jpg'),
        'photoCaptions', jsonb_build_array(''), 'prompts', '[]'::jsonb
      ),
      null, null, true
    ),
    (
      '00000000-0000-4000-a000-000000000402',
      jsonb_build_object(
        'fullName', 'Mateo Ruiz', 'age', '31', 'gender', 'Male', 'primaryGym', 'Iron and Oak',
        'hometown', 'Babylon', 'about', 'Incoming tester request.', 'experienceLevel', 'Advanced',
        'selectedGoals', jsonb_build_array('Gain mass'), 'availabilityDays', jsonb_build_array('Thu'),
        'availabilityTimes', jsonb_build_array('Morning'), 'bench', '225 lbs', 'squat', '315 lbs', 'deadlift', '405 lbs',
        'customLiftName', '', 'customLift', 'N/A', 'photos', jsonb_build_array('https://randomuser.me/api/portraits/men/41.jpg'),
        'photoCaptions', jsonb_build_array(''), 'prompts', '[]'::jsonb
      ),
      null, null, true
    ),
    (
      '00000000-0000-4000-a000-000000000403',
      jsonb_build_object(
        'fullName', 'Elena Voss', 'age', '28', 'gender', 'Female', 'primaryGym', 'Harbor Strength',
        'hometown', 'Deer Park', 'about', 'Accepted tester match with a proposed workout.', 'experienceLevel', 'Intermediate',
        'selectedGoals', jsonb_build_array('Strength training'), 'availabilityDays', jsonb_build_array('Sat'),
        'availabilityTimes', jsonb_build_array('Evening'), 'bench', '105 lbs', 'squat', '165 lbs', 'deadlift', '215 lbs',
        'customLiftName', '', 'customLift', 'N/A', 'photos', jsonb_build_array('https://randomuser.me/api/portraits/women/65.jpg'),
        'photoCaptions', jsonb_build_array(''), 'prompts', '[]'::jsonb
      ),
      null, null, true
    ),
    (
      '00000000-0000-4000-a000-000000000404',
      jsonb_build_object(
        'fullName', 'Andre Blake', 'age', '29', 'gender', 'Male', 'primaryGym', 'Iron Harbor',
        'hometown', 'Wyandanch', 'about', 'Accepted tester match with a proposed workout.', 'experienceLevel', 'Advanced',
        'selectedGoals', jsonb_build_array('Gain mass'), 'availabilityDays', jsonb_build_array('Sun'),
        'availabilityTimes', jsonb_build_array('Morning'), 'bench', '205 lbs', 'squat', '295 lbs', 'deadlift', '365 lbs',
        'customLiftName', '', 'customLift', 'N/A', 'photos', jsonb_build_array('https://randomuser.me/api/portraits/men/32.jpg'),
        'photoCaptions', jsonb_build_array(''), 'prompts', '[]'::jsonb
      ),
      null, null, true
    );

  insert into public.match_requests (id, from_user_id, to_user_id, status, created_at)
  values
    ('00000000-0000-4000-b000-000000000401', '00000000-0000-4000-a000-000000000401', me, 'pending', now() - interval '35 minutes'),
    ('00000000-0000-4000-b000-000000000402', '00000000-0000-4000-a000-000000000402', me, 'pending', now() - interval '20 minutes'),
    ('00000000-0000-4000-b000-000000000403', '00000000-0000-4000-a000-000000000403', me, 'accepted', now() - interval '2 days'),
    ('00000000-0000-4000-b000-000000000404', '00000000-0000-4000-a000-000000000404', me, 'accepted', now() - interval '1 day');

  insert into public.planned_workout (
    planned_workout_id, match_id, created_by, location, title, workout_date, start_time, focus, notes, status
  )
  values
    (
      '00000000-0000-4000-c000-000000000403',
      '00000000-0000-4000-b000-000000000403',
      '00000000-0000-4000-a000-000000000403',
      'Harbor Strength',
      'Push',
      date '2026-10-03',
      time '18:30:00',
      'Push',
      '{"acceptedBy":["00000000-0000-4000-a000-000000000403"]}',
      'proposed'
    ),
    (
      '00000000-0000-4000-c000-000000000404',
      '00000000-0000-4000-b000-000000000404',
      '00000000-0000-4000-a000-000000000404',
      'Iron Harbor',
      'Pull',
      date '2026-10-04',
      time '09:00:00',
      'Pull',
      '{"acceptedBy":["00000000-0000-4000-a000-000000000404"]}',
      'proposed'
    );

  insert into public.match_messages (id, match_id, sender_id, body, created_at)
  values
    (
      '00000000-0000-4000-d000-000000000403',
      '00000000-0000-4000-b000-000000000403',
      '00000000-0000-4000-a000-000000000403',
      E'Proposed a Push workout for Oct 3 at 6:30 PM.\nworkout-plan:00000000-0000-4000-c000-000000000403',
      now() - interval '30 minutes'
    ),
    (
      '00000000-0000-4000-d000-000000000404',
      '00000000-0000-4000-b000-000000000404',
      '00000000-0000-4000-a000-000000000404',
      E'Proposed a Pull workout for Oct 4 at 9:00 AM.\nworkout-plan:00000000-0000-4000-c000-000000000404',
      now() - interval '15 minutes'
    );
end $$;
