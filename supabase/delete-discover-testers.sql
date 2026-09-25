-- Deletes every tester profile, their match requests, and their messages.
-- Real accounts and real chats stay in place.

delete from public.match_requests
where from_user_id::text like '00000000-0000-4000-a000-%'
   or to_user_id::text like '00000000-0000-4000-a000-%';

delete from public.discover_profiles where is_tester = true;
