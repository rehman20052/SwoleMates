-- Removes only these tester chats: Maya Brooks, Andre Owens, Lena Patel, Eli Santos, and Ava Reed.
-- Real people, including Gio, stay in place.

delete from public.match_requests
where from_user_id in (
  select id
  from public.discover_profiles
  where is_tester = true
    and profile->>'fullName' in ('Maya Brooks', 'Andre Owens', 'Lena Patel', 'Eli Santos', 'Ava Reed')
)
or to_user_id in (
  select id
  from public.discover_profiles
  where is_tester = true
    and profile->>'fullName' in ('Maya Brooks', 'Andre Owens', 'Lena Patel', 'Eli Santos', 'Ava Reed')
);

delete from public.discover_profiles
where is_tester = true
  and profile->>'fullName' in ('Maya Brooks', 'Andre Owens', 'Lena Patel', 'Eli Santos', 'Ava Reed');
