-- Deletes every tester profile, their matches, workouts, messages, and login accounts.
-- Real accounts and real chats stay in place.
-- Tester ids use the prefix 00000000-0000-4000-a000-.

delete from public.match_messages
where sender_id::text like '00000000-0000-4000-a000-%'
   or match_id in (
     select id from public.match_requests
     where from_user_id::text like '00000000-0000-4000-a000-%'
        or to_user_id::text like '00000000-0000-4000-a000-%'
   );

delete from public.attendance
where user_id::text like '00000000-0000-4000-a000-%'
   or planned_workout_id in (
     select planned_workout_id from public.planned_workout
     where created_by::text like '00000000-0000-4000-a000-%'
        or match_id in (
          select id from public.match_requests
          where from_user_id::text like '00000000-0000-4000-a000-%'
             or to_user_id::text like '00000000-0000-4000-a000-%'
        )
   );

delete from public.workout_logs
where user_id::text like '00000000-0000-4000-a000-%'
   or planned_workout_id in (
     select planned_workout_id from public.planned_workout
     where created_by::text like '00000000-0000-4000-a000-%'
        or match_id in (
          select id from public.match_requests
          where from_user_id::text like '00000000-0000-4000-a000-%'
             or to_user_id::text like '00000000-0000-4000-a000-%'
        )
   );

delete from public.planned_workout
where created_by::text like '00000000-0000-4000-a000-%'
   or match_id in (
     select id from public.match_requests
     where from_user_id::text like '00000000-0000-4000-a000-%'
        or to_user_id::text like '00000000-0000-4000-a000-%'
   );

delete from public.chat_read
where user_id::text like '00000000-0000-4000-a000-%'
   or match_id in (
     select id from public.match_requests
     where from_user_id::text like '00000000-0000-4000-a000-%'
        or to_user_id::text like '00000000-0000-4000-a000-%'
   );

delete from public.match_requests
where from_user_id::text like '00000000-0000-4000-a000-%'
   or to_user_id::text like '00000000-0000-4000-a000-%';

delete from public.discover_profiles where is_tester = true;

delete from public.profile_photo
where user_id::text like '00000000-0000-4000-a000-%';

delete from public.profile_prompt
where user_id::text like '00000000-0000-4000-a000-%';

delete from public.user_availability
where user_id::text like '00000000-0000-4000-a000-%';

delete from public.user_goal
where user_id::text like '00000000-0000-4000-a000-%';

delete from public.user_account
where id::text like '00000000-0000-4000-a000-%';

delete from auth.identities
where user_id::text like '00000000-0000-4000-a000-%';

delete from auth.users
where id::text like '00000000-0000-4000-a000-%';
