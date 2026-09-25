-- Deletes every Discover tester and leaves real accounts in place.
delete from public.discover_profiles where is_tester = true;
