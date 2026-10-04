-- Manual images attached directly to an OLAEET warehouse package.
-- Images inherited from linked purchases are not copied. They are resolved
-- dynamically through warehouse_package_purchases -> purchase_images, so they
-- disappear automatically when the purchase assignment is removed.

create table if not exists public.warehouse_package_images (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  warehouse_package_id uuid not null references public.warehouse_packages(id) on delete cascade,
  storage_path text not null unique,
  original_filename text,
  mime_type text,
  byte_size bigint,
  sha256 text,
  position integer not null default 1 check (position > 0),
  created_at timestamptz not null default now(),
  unique (warehouse_package_id, position)
);

create index if not exists warehouse_package_images_package_idx
  on public.warehouse_package_images(warehouse_package_id, position);

create unique index if not exists warehouse_package_images_unique_hash
  on public.warehouse_package_images(warehouse_package_id, sha256)
  where sha256 is not null;

alter table public.warehouse_package_images enable row level security;

drop policy if exists owner_full_access_warehouse_package_images
  on public.warehouse_package_images;

create policy owner_full_access_warehouse_package_images
on public.warehouse_package_images
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
on public.warehouse_package_images
to authenticated;

notify pgrst, 'reload schema';
