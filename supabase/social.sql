-- Social tab: posts, likes and comments.
-- Your posts are seen by you and the people you're matched with (an accepted
-- match), unless either of you has blocked the other.
-- Safe to run more than once.

create table if not exists public.post (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references auth.users (id) on delete cascade,
  body text not null default '' check (char_length(body) <= 1000),
  media_path text,
  media_type text check (media_type in ('image', 'video')),
  created_at timestamptz not null default now(),
  constraint post_has_content check (btrim(body) <> '' or media_path is not null),
  constraint post_media_complete check ((media_path is null) = (media_type is null))
);

create index if not exists post_author_created_idx on public.post (author_id, created_at desc);

create table if not exists public.post_like (
  post_id uuid not null references public.post (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

-- Replies point at a top-level comment (parent_id). Threads are one level deep.
create table if not exists public.post_comment (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.post (id) on delete cascade,
  author_id uuid not null references auth.users (id) on delete cascade,
  parent_id uuid references public.post_comment (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 500 and btrim(body) <> ''),
  created_at timestamptz not null default now(),
  edited_at timestamptz
);

create index if not exists post_comment_post_idx on public.post_comment (post_id, created_at);

create table if not exists public.comment_like (
  comment_id uuid not null references public.post_comment (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (comment_id, user_id)
);

alter table public.post enable row level security;
alter table public.post_like enable row level security;
alter table public.post_comment enable row level security;
alter table public.comment_like enable row level security;

-- True for your own posts, and for people you're matched with when neither of you blocked the other.
-- Security definer so it can check the other person's blocks.
create or replace function public.shares_posts_with(author uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select author = (select auth.uid())
    or (
      exists (
        select 1
        from public.match_requests request
        where request.status = 'accepted'
          and (
            (request.from_user_id = (select auth.uid()) and request.to_user_id = author)
            or (request.from_user_id = author and request.to_user_id = (select auth.uid()))
          )
      )
      and not exists (
        select 1
        from public.block
        where (block.user_id = (select auth.uid()) and block.blocked_id = author)
           or (block.user_id = author and block.blocked_id = (select auth.uid()))
      )
    );
$$;

-- One setting per person. Private (false) is matches-only. Public is any signed-in user.
alter table public.user_account add column if not exists social_public boolean not null default false;

-- When the person last opened the Social bell. Events after this time are unread.
alter table public.user_account add column if not exists social_notified_at timestamptz;

-- Private accounts are matches-only. A public account is visible to any signed-in
-- user, unless someone blocked the other.
create or replace function public.can_see_author(author uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select author = (select auth.uid())
    or (
      not exists (
        select 1
        from public.block
        where (block.user_id = (select auth.uid()) and block.blocked_id = author)
           or (block.user_id = author and block.blocked_id = (select auth.uid()))
      )
      and (
        exists (
          select 1
          from public.match_requests request
          where request.status = 'accepted'
            and (
              (request.from_user_id = (select auth.uid()) and request.to_user_id = author)
              or (request.from_user_id = author and request.to_user_id = (select auth.uid()))
            )
        )
        or coalesce((select account.social_public from public.user_account account where account.id = author), false)
      )
    );
$$;

create or replace function public.can_see_post(target_post uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.post
    where post.id = target_post
      and public.can_see_author(post.author_id)
  );
$$;

create or replace function public.social_is_public(person uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select account.social_public from public.user_account account where account.id = person), false);
$$;

drop policy if exists "friends read posts" on public.post;
drop policy if exists "users write their own posts" on public.post;
drop policy if exists "authors delete their posts" on public.post;

create policy "friends read posts"
on public.post for select
to authenticated
using (public.can_see_author(author_id));

create policy "users write their own posts"
on public.post for insert
to authenticated
with check (author_id = (select auth.uid()));

create policy "authors delete their posts"
on public.post for delete
to authenticated
using (author_id = (select auth.uid()));

drop policy if exists "authors edit their posts" on public.post;
create policy "authors edit their posts"
on public.post for update
to authenticated
using (author_id = (select auth.uid()))
with check (author_id = (select auth.uid()));

drop policy if exists "friends read post likes" on public.post_like;
drop policy if exists "users like posts they can see" on public.post_like;
drop policy if exists "users remove their own likes" on public.post_like;

create policy "friends read post likes"
on public.post_like for select
to authenticated
using (public.can_see_post(post_id));

create policy "users like posts they can see"
on public.post_like for insert
to authenticated
with check (user_id = (select auth.uid()) and public.can_see_post(post_id));

create policy "users remove their own likes"
on public.post_like for delete
to authenticated
using (user_id = (select auth.uid()));

drop policy if exists "friends read comments" on public.post_comment;
drop policy if exists "users comment on posts they can see" on public.post_comment;
drop policy if exists "authors edit their comments" on public.post_comment;
drop policy if exists "authors or post owners delete comments" on public.post_comment;

create policy "friends read comments"
on public.post_comment for select
to authenticated
using (public.can_see_post(post_id));

create policy "users comment on posts they can see"
on public.post_comment for insert
to authenticated
with check (
  author_id = (select auth.uid())
  and public.can_see_post(post_id)
  and (
    post_comment.parent_id is null
    or exists (
      select 1
      from public.post_comment parent
      where parent.id = post_comment.parent_id
        and parent.post_id = post_comment.post_id
        and parent.parent_id is null
    )
  )
);

create policy "authors edit their comments"
on public.post_comment for update
to authenticated
using (author_id = (select auth.uid()))
with check (author_id = (select auth.uid()));

-- The post's author can remove any comment on it. Replies go with their comment.
create policy "authors or post owners delete comments"
on public.post_comment for delete
to authenticated
using (
  author_id = (select auth.uid())
  or exists (
    select 1
    from public.post
    where post.id = post_comment.post_id
      and post.author_id = (select auth.uid())
  )
);

-- Only the text of a comment can change, and changing it marks it edited.
create or replace function public.guard_post_comment_edit()
returns trigger
language plpgsql
as $$
begin
  if new.post_id <> old.post_id
    or new.author_id <> old.author_id
    or new.parent_id is distinct from old.parent_id
    or new.created_at <> old.created_at then
    raise exception 'Only the comment text can be edited.';
  end if;
  new.edited_at := case when new.body is distinct from old.body then now() else old.edited_at end;
  return new;
end;
$$;

drop trigger if exists guard_post_comment_edit on public.post_comment;
create trigger guard_post_comment_edit
before update on public.post_comment
for each row execute function public.guard_post_comment_edit();

drop policy if exists "friends read comment likes" on public.comment_like;
drop policy if exists "users like comments they can see" on public.comment_like;
drop policy if exists "users remove their own comment likes" on public.comment_like;

create policy "friends read comment likes"
on public.comment_like for select
to authenticated
using (exists (select 1 from public.post_comment where post_comment.id = comment_like.comment_id));

create policy "users like comments they can see"
on public.comment_like for insert
to authenticated
with check (
  user_id = (select auth.uid())
  and exists (select 1 from public.post_comment where post_comment.id = comment_like.comment_id)
);

create policy "users remove their own comment likes"
on public.comment_like for delete
to authenticated
using (user_id = (select auth.uid()));

-- Name and main photo for people in your feed: your matches, anyone who
-- commented on or liked a post you can see, and anyone who liked your comment.
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
    (
      select photo.storage_path::text
      from public.profile_photo photo
      where photo.user_id = account.id
        and photo.storage_path !~* '\.(mp4|mov|m4v|webm)$'
      order by photo.sort_order
      limit 1
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

revoke all on function public.shares_posts_with(uuid) from public, anon;
grant execute on function public.shares_posts_with(uuid) to authenticated;
revoke all on function public.can_see_author(uuid) from public, anon;
grant execute on function public.can_see_author(uuid) to authenticated;
revoke all on function public.can_see_post(uuid) from public, anon;
grant execute on function public.can_see_post(uuid) to authenticated;
revoke all on function public.social_is_public(uuid) from public, anon;
grant execute on function public.social_is_public(uuid) to authenticated;

-- The match card for someone who made their account public. Coordinates and
-- birthdate stay out. A private account, or a block in either direction, returns nothing.
create or replace function public.public_match_profile(person uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select card.profile
    - 'latitude' - 'longitude' - 'gymLatitude' - 'gymLongitude' - 'zipCode' - 'birthDate'
  from public.discover_profiles card
  where card.id = person
    and person is distinct from (select auth.uid())
    and coalesce((select account.social_public from public.user_account account where account.id = person), false)
    and not exists (
      select 1
      from public.block
      where (block.user_id = (select auth.uid()) and block.blocked_id = person)
         or (block.user_id = person and block.blocked_id = (select auth.uid()))
    );
$$;

revoke all on function public.public_match_profile(uuid) from public, anon;
grant execute on function public.public_match_profile(uuid) to authenticated;
revoke all on function public.social_people(uuid[]) from public, anon;
grant execute on function public.social_people(uuid[]) to authenticated;

-- Post photos and clips. Private: files are read through short-lived signed
-- links, and only by people who can see the post. Files live under <author id>/.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'post-media',
  'post-media',
  false,
  52428800,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'video/mp4', 'video/quicktime']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "friends read post media" on storage.objects;
drop policy if exists "users upload their own post media" on storage.objects;
drop policy if exists "users delete their own post media" on storage.objects;

create policy "friends read post media"
on storage.objects for select
to authenticated
using (
  -- case keeps the uuid cast away from files in other buckets.
  case
    when bucket_id = 'post-media' then public.can_see_author(((storage.foldername(name))[1])::uuid)
    else false
  end
);

create policy "users upload their own post media"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'post-media'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

create policy "users delete their own post media"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'post-media'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

-- New posts, likes, and comments can arrive while the Social tab is open.
do $$
declare
  live_table text;
begin
  foreach live_table in array array['post', 'post_like', 'post_comment', 'comment_like']
  loop
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = live_table
    ) then
      execute format('alter publication supabase_realtime add table public.%I', live_table);
    end if;
  end loop;
end $$;

alter table public.post add column if not exists edited_at timestamptz;

-- Only the text of a post can change, and changing it marks it edited.
create or replace function public.guard_post_edit()
returns trigger
language plpgsql
as $$
begin
  if new.author_id <> old.author_id
    or new.media_path is distinct from old.media_path
    or new.media_type is distinct from old.media_type
    or new.created_at <> old.created_at then
    raise exception 'Only the post text can be edited.';
  end if;
  new.edited_at := case when new.body is distinct from old.body then now() else old.edited_at end;
  return new;
end;
$$;

drop trigger if exists guard_post_edit on public.post;
create trigger guard_post_edit
before update on public.post
for each row execute function public.guard_post_edit();

notify pgrst, 'reload schema';
