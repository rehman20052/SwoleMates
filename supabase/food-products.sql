-- Additive product-memory schema. Clients may read the shared cache but cannot
-- write it. User confirmations remain private and cannot overwrite shared data.
begin;
create table if not exists public.product_cache (
  barcode text primary key check (barcode ~ '^\d{14}$'),
  name text,
  basis text not null check (basis in ('per_serving','per_container','per_100g','unknown')),
  serving_size text,
  calories numeric check (calories >= 0), protein numeric check (protein >= 0),
  carbs numeric check (carbs >= 0), fat numeric check (fat >= 0),
  source text not null default 'open_food_facts', source_updated_at timestamptz,
  fetched_at timestamptz not null default now(), payload jsonb,
  check (octet_length(coalesce(payload::text, '')) <= 262144)
);
alter table public.product_cache enable row level security;
revoke all on public.product_cache from anon, authenticated;
grant select on public.product_cache to anon, authenticated;
drop policy if exists product_cache_read on public.product_cache;
create policy product_cache_read on public.product_cache for select to anon, authenticated using (true);

create table if not exists public.user_products (
  user_id uuid not null references auth.users(id) on delete cascade,
  barcode text not null check (barcode ~ '^\d{14}$'),
  name text,
  basis text not null check (basis in ('per_serving','per_container','per_100g','unknown')),
  serving_size text,
  calories numeric check (calories >= 0), protein numeric check (protein >= 0),
  carbs numeric check (carbs >= 0), fat numeric check (fat >= 0),
  confirmed_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  primary key (user_id, barcode)
);
alter table public.user_products enable row level security;
revoke all on public.user_products from anon, authenticated;
grant select, insert, update, delete on public.user_products to authenticated;
drop policy if exists user_products_own on public.user_products;
create policy user_products_own on public.user_products for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
commit;
