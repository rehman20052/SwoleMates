-- Preserve original gallery photos; use the separately saved circular avatar.
-- Run in the Supabase SQL Editor after deploying the app change.
begin;
create or replace function public.social_people(people uuid[])
returns table (id uuid, full_name text, photo_path text)
language sql
stable
security definer
set search_path = public
as $$
  select
    account.id,
    account.full_name::text,
    coalesce(
      (select nullif(card.profile ->> 'avatar', '') from public.discover_profiles card where card.id = account.id),
      (select photo.storage_path::text
      from public.profile_photo photo
      where photo.user_id = account.id
        and photo.storage_path !~* '\.(mp4|mov|m4v|webm)$'
      order by photo.sort_order
      limit 1)
    )
  from public.user_account account
  where account.id = any (people)
    and (
      public.can_see_author(account.id)
      or exists (
        select 1
        from public.post_comment commented
        join public.post on post.id = commented.post_id
        where commented.author_id = account.id
          and public.can_see_author(post.author_id)
      )
      or exists (
        select 1
        from public.post_like liked
        join public.post on post.id = liked.post_id
        where liked.user_id = account.id
          and public.can_see_author(post.author_id)
      )
      or exists (
        select 1
        from public.comment_like liked
        join public.post_comment comment on comment.id = liked.comment_id
        join public.post on post.id = comment.post_id
        where liked.user_id = account.id
          and public.can_see_author(post.author_id)
      )
    );
$$;
revoke all on function public.social_people(uuid[]) from public, anon;
grant execute on function public.social_people(uuid[]) to authenticated;
commit;
