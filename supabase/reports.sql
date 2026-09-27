-- Reports need their own table. public.block only stores who you blocked,
-- not a reason or an explanation, so those details cannot live there.
-- Safe to run more than once. Does not create or change public.block.

create table if not exists public.report (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  reported_id uuid not null references auth.users (id) on delete cascade,
  reason text not null check (char_length(btrim(reason)) between 1 and 80),
  details text not null default '' check (char_length(details) <= 500),
  created_at timestamptz not null default now(),
  constraint report_not_self check (user_id <> reported_id)
);

alter table public.report enable row level security;

drop policy if exists "users file their own reports" on public.report;
drop policy if exists "users read their own reports" on public.report;

create policy "users file their own reports"
on public.report for insert
to authenticated
with check (user_id = (select auth.uid()));

create policy "users read their own reports"
on public.report for select
to authenticated
using (user_id = (select auth.uid()));

notify pgrst, 'reload schema';
