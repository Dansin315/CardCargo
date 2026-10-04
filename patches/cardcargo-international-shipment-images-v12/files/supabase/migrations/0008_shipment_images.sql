-- Manual images attached directly to an international OLAEET shipment.
-- Images from contained warehouse packages and linked Bunjang purchases are
-- resolved dynamically and are not duplicated in this table.

create table if not exists public.shipment_images (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  shipment_id uuid not null references public.shipments(id) on delete cascade,
  storage_path text not null unique,
  original_filename text,
  category text not null default 'general',
  mime_type text,
  byte_size bigint,
  sha256 text,
  position integer not null default 1 check (position > 0),
  created_at timestamptz not null default now(),
  unique (shipment_id, position)
);

alter table public.shipment_images
  drop constraint if exists shipment_images_category_check;

alter table public.shipment_images
  add constraint shipment_images_category_check
  check (
    category in (
      'general',
      'consolidation',
      'carton',
      'label',
      'customs',
      'damage'
    )
  );

create index if not exists shipment_images_shipment_idx
  on public.shipment_images(shipment_id, position);

create unique index if not exists shipment_images_unique_hash
  on public.shipment_images(shipment_id, sha256)
  where sha256 is not null;

alter table public.shipment_images enable row level security;

drop policy if exists owner_full_access_shipment_images
  on public.shipment_images;

create policy owner_full_access_shipment_images
on public.shipment_images
for all to authenticated
using (
  public.is_app_owner()
  and user_id = (select auth.uid())
)
with check (
  public.is_app_owner()
  and user_id = (select auth.uid())
);

grant select, insert, update, delete
on public.shipment_images
to authenticated;

notify pgrst, 'reload schema';
