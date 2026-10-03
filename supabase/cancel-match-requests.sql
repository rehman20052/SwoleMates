-- Focused, rerunnable repair for cancelling your own pending match requests.
-- Does not delete any records or alter accepted chats/workouts.
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
commit;

-- Returns true when both table privileges have been applied.
select has_table_privilege('authenticated', 'public.match_requests', 'SELECT')
   and has_table_privilege('authenticated', 'public.match_requests', 'DELETE')
   as cancellation_privileges_ready;
