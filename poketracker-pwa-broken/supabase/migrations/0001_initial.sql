-- CardCargo initial schema
-- Run this migration after creating the Supabase project.

create extension if not exists pgcrypto;

create type public.purchase_status as enum (
  'planned',
  'ordered',
  'paid',
  'shipped_domestic',
  'warehouse_received',
  'consolidated',
  'international_transit',
  'delivered',
  'cancelled'
);

create type public.package_status as enum (
  'expected',
  'received',
  'inspected',
  'ready_for_consolidation',
  'consolidated',
  'returned'
);

create type public.shipment_status as enum (
  'draft',
  'booked',
  'in_transit',
  'customs',
  'out_for_delivery',
  'delivered',
  'exception',
  'cancelled'
);

create type public.inventory_status as enum (
  'expected',
  'in_warehouse',
  'in_transit',
  'in_collection',
  'listed_for_sale',
  'sold',
  'lost',
  'returned'
);

-- A database-level owner allowlist makes the project genuinely single-user.
create table public.app_owners (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.app_owners enable row level security;
revoke all on public.app_owners from anon, authenticated;

create or replace function public.is_app_owner()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.app_owners
    where user_id = (select auth.uid())
  );
$$;

revoke all on function public.is_app_owner() from public;
grant execute on function public.is_app_owner() to authenticated;

create table public.purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source text not null default 'bunjang' check (source in ('bunjang', 'manual', 'other')),
  source_listing_id text,
  listing_url text not null,
  canonical_url text,
  title text not null,
  description text,
  seller_name text,
  seller_id text,
  price_amount numeric(14,2),
  price_currency text not null default 'KRW' check (char_length(price_currency) = 3),
  domestic_shipping_amount numeric(14,2),
  service_fee_amount numeric(14,2),
  purchased_at date,
  status public.purchase_status not null default 'ordered',
  raw_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index purchases_unique_source_listing
  on public.purchases(user_id, source, source_listing_id)
  where source_listing_id is not null;
create unique index purchases_unique_canonical_url
  on public.purchases(user_id, source, canonical_url)
  where canonical_url is not null;
create index purchases_user_created_idx on public.purchases(user_id, created_at desc);
create index purchases_user_status_idx on public.purchases(user_id, status);

create table public.purchase_images (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  purchase_id uuid not null references public.purchases(id) on delete cascade,
  storage_path text not null unique,
  source_url text,
  original_filename text,
  mime_type text,
  byte_size bigint,
  sha256 text,
  position integer not null default 1 check (position > 0),
  kind text not null check (kind in ('remote', 'manual')),
  created_at timestamptz not null default now(),
  unique (purchase_id, position)
);

create index purchase_images_purchase_idx on public.purchase_images(purchase_id, position);
create unique index purchase_images_unique_hash
  on public.purchase_images(purchase_id, sha256)
  where sha256 is not null;

create table public.purchase_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  purchase_id uuid not null references public.purchases(id) on delete cascade,
  item_name text not null,
  franchise text not null default 'Pokémon',
  set_name text,
  card_number text,
  language text default 'Korean',
  rarity text,
  variant text,
  quantity integer not null default 1 check (quantity > 0),
  grading_company text,
  grade text,
  seller_condition text,
  allocated_unit_cost numeric(14,2),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.warehouse_packages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null default 'OLAEET',
  external_package_id text,
  customer_code text,
  domestic_tracking_number text,
  status public.package_status not null default 'expected',
  arrived_at timestamptz,
  weight_grams numeric(12,2),
  length_cm numeric(10,2),
  width_cm numeric(10,2),
  height_cm numeric(10,2),
  notes text,
  raw_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index warehouse_packages_external_unique
  on public.warehouse_packages(user_id, provider, external_package_id)
  where external_package_id is not null;

create table public.warehouse_package_purchases (
  user_id uuid not null references auth.users(id) on delete cascade,
  warehouse_package_id uuid not null references public.warehouse_packages(id) on delete cascade,
  purchase_id uuid not null references public.purchases(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (warehouse_package_id, purchase_id)
);

create table public.shipments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null default 'OLAEET',
  external_shipment_id text,
  carrier text,
  tracking_number text,
  status public.shipment_status not null default 'draft',
  shipped_at timestamptz,
  estimated_delivery_at timestamptz,
  delivered_at timestamptz,
  international_shipping_amount numeric(14,2),
  forwarding_fee_amount numeric(14,2),
  import_tax_amount numeric(14,2),
  currency text not null default 'KRW' check (char_length(currency) = 3),
  notes text,
  raw_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.shipment_packages (
  user_id uuid not null references auth.users(id) on delete cascade,
  shipment_id uuid not null references public.shipments(id) on delete cascade,
  warehouse_package_id uuid not null references public.warehouse_packages(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (shipment_id, warehouse_package_id)
);

create table public.inventory_units (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  purchase_item_id uuid references public.purchase_items(id) on delete set null,
  item_name text not null,
  quantity integer not null default 1 check (quantity > 0),
  condition text,
  grading_company text,
  grade text,
  storage_location text,
  allocated_total_cost numeric(14,2),
  cost_currency text not null default 'EUR' check (char_length(cost_currency) = 3),
  status public.inventory_status not null default 'expected',
  sold_at timestamptz,
  sale_price numeric(14,2),
  sale_currency text check (sale_currency is null or char_length(sale_currency) = 3),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.watch_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  enabled boolean not null default true,
  keywords jsonb not null default '[]'::jsonb,
  negative_keywords jsonb not null default '[]'::jsonb,
  min_price numeric(14,2),
  max_price numeric(14,2),
  currency text not null default 'KRW' check (char_length(currency) = 3),
  category_ids jsonb not null default '[]'::jsonb,
  seller_ids jsonb not null default '[]'::jsonb,
  check_interval_minutes integer not null default 15 check (check_interval_minutes >= 5),
  last_checked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.market_listings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source text not null default 'bunjang',
  external_listing_id text not null,
  listing_url text not null,
  title text not null,
  seller_name text,
  price_amount numeric(14,2),
  shipping_amount numeric(14,2),
  currency text not null default 'KRW' check (char_length(currency) = 3),
  sale_status text,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  last_notified_at timestamptz,
  raw_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, source, external_listing_id)
);

create table public.watch_rule_listings (
  user_id uuid not null references auth.users(id) on delete cascade,
  watch_rule_id uuid not null references public.watch_rules(id) on delete cascade,
  market_listing_id uuid not null references public.market_listings(id) on delete cascade,
  matched_at timestamptz not null default now(),
  notified_at timestamptz,
  primary key (watch_rule_id, market_listing_id)
);

create table public.alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  alert_type text not null,
  title text not null,
  message text,
  entity_type text,
  entity_id uuid,
  channel text,
  read_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger purchases_set_updated_at before update on public.purchases
for each row execute function public.set_updated_at();
create trigger purchase_items_set_updated_at before update on public.purchase_items
for each row execute function public.set_updated_at();
create trigger warehouse_packages_set_updated_at before update on public.warehouse_packages
for each row execute function public.set_updated_at();
create trigger shipments_set_updated_at before update on public.shipments
for each row execute function public.set_updated_at();
create trigger inventory_units_set_updated_at before update on public.inventory_units
for each row execute function public.set_updated_at();
create trigger watch_rules_set_updated_at before update on public.watch_rules
for each row execute function public.set_updated_at();
create trigger market_listings_set_updated_at before update on public.market_listings
for each row execute function public.set_updated_at();

-- Enable RLS and apply the same strict owner policy to every application table.
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'purchases',
    'purchase_images',
    'purchase_items',
    'warehouse_packages',
    'warehouse_package_purchases',
    'shipments',
    'shipment_packages',
    'inventory_units',
    'watch_rules',
    'market_listings',
    'watch_rule_listings',
    'alerts'
  ]
  loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format(
      'create policy %I on public.%I for all to authenticated using (public.is_app_owner() and user_id = (select auth.uid())) with check (public.is_app_owner() and user_id = (select auth.uid()))',
      'owner_full_access_' || table_name,
      table_name
    );
    execute format('grant select, insert, update, delete on public.%I to authenticated', table_name);
  end loop;
end $$;

-- Private bucket for copied listing images and temporary manual uploads.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'listing-images',
  'listing-images',
  false,
  6291456,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "Owner can read listing images"
on storage.objects for select to authenticated
using (
  bucket_id = 'listing-images'
  and public.is_app_owner()
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

-- Browser uploads are restricted to the owner's staging folder. Final archive
-- paths are written only by the server-side secret-key client.
create policy "Owner can upload staged listing images"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'listing-images'
  and public.is_app_owner()
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and (storage.foldername(name))[2] = 'staging'
);

create policy "Owner can delete staged listing images"
on storage.objects for delete to authenticated
using (
  bucket_id = 'listing-images'
  and public.is_app_owner()
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and (storage.foldername(name))[2] = 'staging'
);
