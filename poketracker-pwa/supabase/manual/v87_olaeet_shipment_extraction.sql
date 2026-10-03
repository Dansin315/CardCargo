-- CardCargo v87
-- Complete OLAEET international-shipment extraction storage.
-- Run this manually in the Supabase SQL editor because this project's remote
-- migration history has previously diverged from the local migration history.

begin;

create extension if not exists pgcrypto;

create table if not exists public.olaeet_shipment_extractions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  external_shipment_id text not null,
  provider_status text,
  provider_created_at timestamptz,
  provider_completed_at timestamptz,
  courier text,
  tracking_number text,
  payment_transaction_id text,
  shipping_amount numeric,
  shipping_fee numeric,
  additional_fee numeric,
  insurance_fee numeric,
  total_payment numeric,
  currency text not null default 'KRW',
  address jsonb not null default '{}'::jsonb,
  boxes jsonb not null default '[]'::jsonb,
  packages jsonb not null default '[]'::jsonb,
  expected_item_count integer,
  expected_box_count integer,
  extraction_complete boolean not null default false,
  page_url text,
  raw_text text,
  diagnostics jsonb not null default '{}'::jsonb,
  extracted_at timestamptz,
  raw_payload jsonb not null default '{}'::jsonb,
  imported_at timestamptz not null default now(),
  unique (user_id, external_shipment_id)
);

create index if not exists
  olaeet_shipment_extractions_user_tracking_idx
on public.olaeet_shipment_extractions
  (user_id, tracking_number);

create table if not exists public.olaeet_shipment_package_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  external_shipment_id text not null,
  warehouse_package_id uuid not null
    references public.warehouse_packages(id) on delete cascade,
  external_package_id text not null,
  domestic_tracking_number text,
  item_category text,
  recipient_masked text,
  match_method text not null default 'external-id',
  created_at timestamptz not null default now(),
  unique (
    user_id,
    external_shipment_id,
    external_package_id
  )
);

create index if not exists
  olaeet_shipment_package_links_shipment_idx
on public.olaeet_shipment_package_links
  (user_id, external_shipment_id);

alter table public.olaeet_shipment_extractions
  enable row level security;

alter table public.olaeet_shipment_package_links
  enable row level security;

drop policy if exists
  "olaeet_shipment_extractions_select_own"
on public.olaeet_shipment_extractions;

create policy
  "olaeet_shipment_extractions_select_own"
on public.olaeet_shipment_extractions
for select
using (auth.uid() = user_id);

drop policy if exists
  "olaeet_shipment_extractions_insert_own"
on public.olaeet_shipment_extractions;

create policy
  "olaeet_shipment_extractions_insert_own"
on public.olaeet_shipment_extractions
for insert
with check (auth.uid() = user_id);

drop policy if exists
  "olaeet_shipment_extractions_update_own"
on public.olaeet_shipment_extractions;

create policy
  "olaeet_shipment_extractions_update_own"
on public.olaeet_shipment_extractions
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists
  "olaeet_shipment_extractions_delete_own"
on public.olaeet_shipment_extractions;

create policy
  "olaeet_shipment_extractions_delete_own"
on public.olaeet_shipment_extractions
for delete
using (auth.uid() = user_id);

drop policy if exists
  "olaeet_shipment_package_links_select_own"
on public.olaeet_shipment_package_links;

create policy
  "olaeet_shipment_package_links_select_own"
on public.olaeet_shipment_package_links
for select
using (auth.uid() = user_id);

drop policy if exists
  "olaeet_shipment_package_links_insert_own"
on public.olaeet_shipment_package_links;

create policy
  "olaeet_shipment_package_links_insert_own"
on public.olaeet_shipment_package_links
for insert
with check (auth.uid() = user_id);

drop policy if exists
  "olaeet_shipment_package_links_update_own"
on public.olaeet_shipment_package_links;

create policy
  "olaeet_shipment_package_links_update_own"
on public.olaeet_shipment_package_links
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists
  "olaeet_shipment_package_links_delete_own"
on public.olaeet_shipment_package_links;

create policy
  "olaeet_shipment_package_links_delete_own"
on public.olaeet_shipment_package_links
for delete
using (auth.uid() = user_id);

notify pgrst, 'reload schema';

commit;
