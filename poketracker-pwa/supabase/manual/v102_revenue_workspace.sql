-- CardCargo v102 - Umsatz / shipment revenue workspace
-- Run once in Supabase SQL editor.

begin;

create extension if not exists pgcrypto;

create table if not exists public.inventory_sales_values (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  inventory_unit_id uuid not null references public.inventory_units(id) on delete cascade,
  shipment_id uuid not null references public.shipments(id) on delete cascade,
  external_shipment_id text not null,
  min_sale_price_krw numeric,
  sale_price_krw numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, inventory_unit_id)
);

create index if not exists inventory_sales_values_user_shipment_idx
  on public.inventory_sales_values(user_id, shipment_id);
create index if not exists inventory_sales_values_external_shipment_idx
  on public.inventory_sales_values(user_id, external_shipment_id);

create table if not exists public.shipment_revenue_fx (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  shipment_id uuid not null references public.shipments(id) on delete cascade,
  external_shipment_id text not null,
  requested_date date not null,
  rate_date date not null,
  krw_per_eur numeric not null check (krw_per_eur > 0),
  source text not null default 'Frankfurter / ECB',
  created_at timestamptz not null default now(),
  unique (user_id, shipment_id)
);

alter table public.inventory_sales_values enable row level security;
alter table public.shipment_revenue_fx enable row level security;

-- inventory_sales_values policies
drop policy if exists "inventory_sales_values_select_own" on public.inventory_sales_values;
create policy "inventory_sales_values_select_own"
on public.inventory_sales_values for select
using (auth.uid() = user_id);

drop policy if exists "inventory_sales_values_insert_own" on public.inventory_sales_values;
create policy "inventory_sales_values_insert_own"
on public.inventory_sales_values for insert
with check (auth.uid() = user_id);

drop policy if exists "inventory_sales_values_update_own" on public.inventory_sales_values;
create policy "inventory_sales_values_update_own"
on public.inventory_sales_values for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "inventory_sales_values_delete_own" on public.inventory_sales_values;
create policy "inventory_sales_values_delete_own"
on public.inventory_sales_values for delete
using (auth.uid() = user_id);

-- shipment_revenue_fx policies
drop policy if exists "shipment_revenue_fx_select_own" on public.shipment_revenue_fx;
create policy "shipment_revenue_fx_select_own"
on public.shipment_revenue_fx for select
using (auth.uid() = user_id);

drop policy if exists "shipment_revenue_fx_insert_own" on public.shipment_revenue_fx;
create policy "shipment_revenue_fx_insert_own"
on public.shipment_revenue_fx for insert
with check (auth.uid() = user_id);

drop policy if exists "shipment_revenue_fx_update_own" on public.shipment_revenue_fx;
create policy "shipment_revenue_fx_update_own"
on public.shipment_revenue_fx for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

grant select, insert, update, delete on public.inventory_sales_values to authenticated;
grant select, insert, update, delete on public.shipment_revenue_fx to authenticated;

notify pgrst, 'reload schema';

commit;
