-- Heart reactions for match chat messages. Safe to run more than once.
create table if not exists public.message_reactions (
  message_id uuid not null references public.match_messages (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  reaction text not null default 'heart' check (reaction = 'heart'),
  created_at timestamptz not null default now(),
  primary key (message_id, user_id)
);

alter table public.message_reactions enable row level security;

drop policy if exists "participants read message reactions" on public.message_reactions;
drop policy if exists "participants add message reactions" on public.message_reactions;
drop policy if exists "users remove own message reactions" on public.message_reactions;

create policy "participants read message reactions"
on public.message_reactions for select to authenticated
using (exists (
  select 1 from public.match_messages message
  join public.match_requests request on request.id = message.match_id
  where message.id = message_id and request.status = 'accepted'
    and ((select auth.uid()) = request.from_user_id or (select auth.uid()) = request.to_user_id)
));

create policy "participants add message reactions"
on public.message_reactions for insert to authenticated
with check (user_id = (select auth.uid()) and exists (
  select 1 from public.match_messages message
  join public.match_requests request on request.id = message.match_id
  where message.id = message_id and request.status = 'accepted'
    and ((select auth.uid()) = request.from_user_id or (select auth.uid()) = request.to_user_id)
));

create policy "users remove own message reactions"
on public.message_reactions for delete to authenticated
using (user_id = (select auth.uid()));

grant select, insert, delete on public.message_reactions to authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'message_reactions'
  ) then
    alter publication supabase_realtime add table public.message_reactions;
  end if;
end $$;

notify pgrst, 'reload schema';
