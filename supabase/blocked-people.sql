-- Run after reliability-safety.sql. Only the caller's outgoing blocks are visible.
begin;
create or replace function public.my_blocked_people()
returns table(user_id uuid, profile jsonb)
language sql stable security definer set search_path = '' as $$
  select b.blocked_id, jsonb_build_object(
    'fullName', p.profile->'fullName',
    'photos', p.profile->'photos',
    'photoMedia', p.profile->'photoMedia',
    'avatar', p.profile->'avatar')
  from public.block b
  left join public.discover_profiles p on p.id = b.blocked_id
  where b.user_id = auth.uid()
  order by lower(coalesce(p.profile->>'fullName', '')), b.blocked_id;
$$;
revoke all on function public.my_blocked_people() from public, anon;
grant execute on function public.my_blocked_people() to authenticated;
notify pgrst, 'reload schema';
commit;
