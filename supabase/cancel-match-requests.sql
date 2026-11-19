-- Focused, rerunnable repair for cancelling your own pending match requests.
-- Cancels pending requests without deleting their referenced workout history.
begin;
alter table public.match_requests enable row level security;
grant select, delete on table public.match_requests to authenticated;

-- SELECT visibility is required alongside the DELETE policy.
drop policy if exists "participants read match requests" on public.match_requests;
create policy "participants read match requests"
on public.match_requests for select to authenticated
using (from_user_id = (select auth.uid()) or to_user_id = (select auth.uid()));

drop policy if exists "sender cancels pending request" on public.match_requests;
create policy "sender cancels pending request"
on public.match_requests for delete to authenticated
using (from_user_id = (select auth.uid()) and status = 'pending');

-- A request can still own workout records after a previous match. Deleting it
-- breaks planned_workout_match_id_fkey, or loses history if deletes cascade.
-- Reuse the existing declined state, which is hidden from pending requests and
-- already supports sending a fresh request through send_match_request().
create or replace function public.cancel_match_request(request_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'Sign in again before cancelling a request.';
  end if;

  perform 1 from public.match_requests
  where id = request_id and from_user_id = me and status = 'pending'
  for update;
  if not found then
    raise exception 'This request is no longer pending, or you are not its sender. Refresh requests.';
  end if;

  update public.match_requests set status = 'declined'
  where id = request_id and from_user_id = me and status = 'pending';

  if to_regclass('public.planned_workout') is not null then
    update public.planned_workout set status = 'cancelled'
    where match_id = request_id and status in ('proposed', 'scheduled');
  end if;
end;
$$;
revoke all on function public.cancel_match_request(uuid) from public, anon;
grant execute on function public.cancel_match_request(uuid) to authenticated;
commit;

-- Returns true when both table privileges have been applied.
select has_table_privilege('authenticated', 'public.match_requests', 'SELECT')
   and has_table_privilege('authenticated', 'public.match_requests', 'DELETE')
   as cancellation_privileges_ready;
