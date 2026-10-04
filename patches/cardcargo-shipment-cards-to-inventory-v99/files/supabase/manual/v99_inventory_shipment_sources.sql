-- CardCargo v99
-- Persistent source/tag relation between inventory units and international shipments.
-- Run manually in the Supabase SQL editor.

begin;

create extension if not exists pgcrypto;

create table if not exists public.inventory_shipment_sources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  inventory_unit_id uuid not null references public.inventory_units(id) on delete cascade,
  shipment_id uuid not null references public.shipments(id) on delete cascade,
  external_shipment_id text not null,
  purchase_item_id uuid references public.purchase_items(id) on delete set null,
  source_type text not null,
  source_parent_id uuid,
  source_storage_number text,
  note text,
  created_at timestamptz not null default now(),
  unique (user_id, inventory_unit_id, shipment_id)
);

create index if not exists inventory_shipment_sources_user_shipment_idx
  on public.inventory_shipment_sources(user_id, shipment_id);

create index if not exists inventory_shipment_sources_user_external_idx
  on public.inventory_shipment_sources(user_id, external_shipment_id);

create index if not exists inventory_shipment_sources_inventory_idx
  on public.inventory_shipment_sources(inventory_unit_id);

alter table public.inventory_shipment_sources enable row level security;

drop policy if exists "inventory_shipment_sources_select_own"
  on public.inventory_shipment_sources;
create policy "inventory_shipment_sources_select_own"
  on public.inventory_shipment_sources
  for select using (auth.uid() = user_id);

drop policy if exists "inventory_shipment_sources_insert_own"
  on public.inventory_shipment_sources;
create policy "inventory_shipment_sources_insert_own"
  on public.inventory_shipment_sources
  for insert with check (auth.uid() = user_id);

drop policy if exists "inventory_shipment_sources_update_own"
  on public.inventory_shipment_sources;
create policy "inventory_shipment_sources_update_own"
  on public.inventory_shipment_sources
  for update using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "inventory_shipment_sources_delete_own"
  on public.inventory_shipment_sources;
create policy "inventory_shipment_sources_delete_own"
  on public.inventory_shipment_sources
  for delete using (auth.uid() = user_id);

notify pgrst, 'reload schema';

commit;
