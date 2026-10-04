-- CardCargo v106
-- Manual/date-range assignment of Bunjang purchases to an international shipment.
-- Run manually in the Supabase SQL editor.

begin;

create extension if not exists pgcrypto;

create table if not exists public.shipment_bunjang_purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  shipment_id uuid not null references public.shipments(id) on delete cascade,
  external_shipment_id text not null,
  purchase_id uuid not null references public.purchases(id) on delete cascade,
  added_via text not null default 'manual',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, shipment_id, purchase_id)
);

create index if not exists shipment_bunjang_purchases_user_shipment_idx
  on public.shipment_bunjang_purchases(user_id, shipment_id);

create index if not exists shipment_bunjang_purchases_user_external_idx
  on public.shipment_bunjang_purchases(user_id, external_shipment_id);

create index if not exists shipment_bunjang_purchases_purchase_idx
  on public.shipment_bunjang_purchases(purchase_id);

alter table public.shipment_bunjang_purchases enable row level security;

drop policy if exists "shipment_bunjang_purchases_select_own"
  on public.shipment_bunjang_purchases;
create policy "shipment_bunjang_purchases_select_own"
  on public.shipment_bunjang_purchases
  for select using (auth.uid() = user_id);

drop policy if exists "shipment_bunjang_purchases_insert_own"
  on public.shipment_bunjang_purchases;
create policy "shipment_bunjang_purchases_insert_own"
  on public.shipment_bunjang_purchases
  for insert with check (auth.uid() = user_id);

drop policy if exists "shipment_bunjang_purchases_update_own"
  on public.shipment_bunjang_purchases;
create policy "shipment_bunjang_purchases_update_own"
  on public.shipment_bunjang_purchases
  for update using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "shipment_bunjang_purchases_delete_own"
  on public.shipment_bunjang_purchases;
create policy "shipment_bunjang_purchases_delete_own"
  on public.shipment_bunjang_purchases
  for delete using (auth.uid() = user_id);

notify pgrst, 'reload schema';

commit;
