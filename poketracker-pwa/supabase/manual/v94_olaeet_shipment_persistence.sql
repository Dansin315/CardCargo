-- CardCargo v94 - canonical OLAEET international shipment persistence
-- Run once in the Supabase SQL editor.
-- This is intentionally a manual SQL file because CardCargo's remote migration
-- history has previously diverged from the local migration history.

begin;

create extension if not exists pgcrypto;

-- Canonical OLAEET fields on the existing CardCargo shipment record. Existing
-- legacy columns are preserved; the importer mirrors values into both the new
-- canonical columns and any legacy aliases that already exist.
alter table public.shipments
  add column if not exists external_shipment_id text,
  add column if not exists provider text,
  add column if not exists provider_status text,
  add column if not exists courier text,
  add column if not exists tracking_number text,
  add column if not exists payment_transaction_id text,
  add column if not exists shipping_amount numeric,
  add column if not exists shipping_fee numeric,
  add column if not exists additional_fee numeric,
  add column if not exists insurance_fee numeric,
  add column if not exists total_payment numeric,
  add column if not exists currency text,
  add column if not exists recipient_name text,
  add column if not exists recipient_address jsonb,
  add column if not exists package_count integer,
  add column if not exists box_count integer,
  add column if not exists package_info jsonb,
  add column if not exists provider_created_at timestamptz,
  add column if not exists provider_completed_at timestamptz,
  add column if not exists raw_metadata jsonb;

-- One warehouse package belongs to at most one current international shipment.
alter table public.warehouse_packages
  add column if not exists shipment_id uuid;

create index if not exists warehouse_packages_shipment_id_idx
  on public.warehouse_packages (shipment_id);

-- Complete OLAEET extraction bound to the normal CardCargo shipment row.
create table if not exists public.olaeet_shipment_extractions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  shipment_id uuid,
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

alter table public.olaeet_shipment_extractions
  add column if not exists shipment_id uuid,
  add column if not exists provider_status text,
  add column if not exists provider_created_at timestamptz,
  add column if not exists provider_completed_at timestamptz,
  add column if not exists courier text,
  add column if not exists tracking_number text,
  add column if not exists payment_transaction_id text,
  add column if not exists shipping_amount numeric,
  add column if not exists shipping_fee numeric,
  add column if not exists additional_fee numeric,
  add column if not exists insurance_fee numeric,
  add column if not exists total_payment numeric,
  add column if not exists currency text default 'KRW',
  add column if not exists address jsonb default '{}'::jsonb,
  add column if not exists boxes jsonb default '[]'::jsonb,
  add column if not exists packages jsonb default '[]'::jsonb,
  add column if not exists expected_item_count integer,
  add column if not exists expected_box_count integer,
  add column if not exists extraction_complete boolean default false,
  add column if not exists page_url text,
  add column if not exists raw_text text,
  add column if not exists diagnostics jsonb default '{}'::jsonb,
  add column if not exists extracted_at timestamptz,
  add column if not exists raw_payload jsonb default '{}'::jsonb,
  add column if not exists imported_at timestamptz default now();

create index if not exists olaeet_shipment_extractions_shipment_idx
  on public.olaeet_shipment_extractions (shipment_id);

create table if not exists public.olaeet_shipment_package_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  shipment_id uuid,
  external_shipment_id text not null,
  warehouse_package_id uuid not null references public.warehouse_packages(id) on delete cascade,
  external_package_id text not null,
  domestic_tracking_number text,
  item_category text,
  recipient_masked text,
  match_method text not null default 'external-id',
  created_at timestamptz not null default now(),
  unique (user_id, external_shipment_id, external_package_id)
);

alter table public.olaeet_shipment_package_links
  add column if not exists shipment_id uuid;

create index if not exists olaeet_shipment_package_links_shipment_idx
  on public.olaeet_shipment_package_links (shipment_id);

alter table public.olaeet_shipment_extractions enable row level security;
alter table public.olaeet_shipment_package_links enable row level security;

drop policy if exists "olaeet_shipment_extractions_select_own" on public.olaeet_shipment_extractions;
create policy "olaeet_shipment_extractions_select_own"
on public.olaeet_shipment_extractions for select
using (auth.uid() = user_id);

drop policy if exists "olaeet_shipment_extractions_insert_own" on public.olaeet_shipment_extractions;
create policy "olaeet_shipment_extractions_insert_own"
on public.olaeet_shipment_extractions for insert
with check (auth.uid() = user_id);

drop policy if exists "olaeet_shipment_extractions_update_own" on public.olaeet_shipment_extractions;
create policy "olaeet_shipment_extractions_update_own"
on public.olaeet_shipment_extractions for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "olaeet_shipment_extractions_delete_own" on public.olaeet_shipment_extractions;
create policy "olaeet_shipment_extractions_delete_own"
on public.olaeet_shipment_extractions for delete
using (auth.uid() = user_id);

drop policy if exists "olaeet_shipment_package_links_select_own" on public.olaeet_shipment_package_links;
create policy "olaeet_shipment_package_links_select_own"
on public.olaeet_shipment_package_links for select
using (auth.uid() = user_id);

drop policy if exists "olaeet_shipment_package_links_insert_own" on public.olaeet_shipment_package_links;
create policy "olaeet_shipment_package_links_insert_own"
on public.olaeet_shipment_package_links for insert
with check (auth.uid() = user_id);

drop policy if exists "olaeet_shipment_package_links_update_own" on public.olaeet_shipment_package_links;
create policy "olaeet_shipment_package_links_update_own"
on public.olaeet_shipment_package_links for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "olaeet_shipment_package_links_delete_own" on public.olaeet_shipment_package_links;
create policy "olaeet_shipment_package_links_delete_own"
on public.olaeet_shipment_package_links for delete
using (auth.uid() = user_id);

notify pgrst, 'reload schema';

commit;
