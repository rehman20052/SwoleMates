-- Let the sender edit a chat message for 5 minutes, or delete their own message.
-- Safe to run more than once.

alter table public.match_messages add column if not exists edited_at timestamptz;

create or replace function public.guard_match_message_edit()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.id is distinct from old.id
    or new.match_id is distinct from old.match_id
    or new.sender_id is distinct from old.sender_id
    or new.created_at is distinct from old.created_at
  then
    raise exception 'Only the message text can be changed.';
  end if;
  if old.created_at < now() - interval '5 minutes' then
    raise exception 'Messages can only be edited within 5 minutes of sending.';
  end if;
  new.edited_at := now();
  return new;
end;
$$;

drop trigger if exists guard_match_message_edit on public.match_messages;
create trigger guard_match_message_edit
before update on public.match_messages
for each row
execute function public.guard_match_message_edit();

drop policy if exists "sender edits recent messages" on public.match_messages;
drop policy if exists "sender deletes own messages" on public.match_messages;

create policy "sender edits recent messages"
on public.match_messages for update
to authenticated
using (
  sender_id = (select auth.uid())
  and created_at > now() - interval '5 minutes'
)
with check (sender_id = (select auth.uid()));

create policy "sender deletes own messages"
on public.match_messages for delete
to authenticated
using (sender_id = (select auth.uid()));

notify pgrst, 'reload schema';
