-- CardCargo Inventory completion patch.
-- Safe to apply after 0016 or after 0017: all structural changes are idempotent.
-- Ensures English Pokemon identity/species, inventory lifecycle fields and inventory images.

begin;

alter table public.purchase_items
  add column if not exists pokemon_name_en text,
  add column if not exists pokemon_species text[] not null default '{}'::text[];

alter table public.inventory_units
  add column if not exists pokemon_name_en text,
  add column if not exists pokemon_species text[] not null default '{}'::text[],
  add column if not exists rarity text,
  add column if not exists estimated_value numeric(14,2),
  add column if not exists estimated_value_currency text not null default 'EUR',
  add column if not exists purchased_at date,
  add column if not exists arrived_at date;

alter table public.inventory_units
  drop constraint if exists inventory_units_estimated_value_nonnegative;
alter table public.inventory_units
  add constraint inventory_units_estimated_value_nonnegative
  check (estimated_value is null or estimated_value >= 0);

create index if not exists purchase_items_pokemon_species_gin_idx
  on public.purchase_items using gin (pokemon_species);
create index if not exists inventory_units_pokemon_species_gin_idx
  on public.inventory_units using gin (pokemon_species);
create index if not exists inventory_units_purchased_at_idx
  on public.inventory_units (user_id, purchased_at desc);
create index if not exists inventory_units_arrived_at_idx
  on public.inventory_units (user_id, arrived_at desc);

create table if not exists public.inventory_unit_images (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  inventory_unit_id uuid not null references public.inventory_units(id) on delete cascade,
  storage_path text not null unique,
  original_filename text,
  mime_type text,
  byte_size bigint,
  sha256 text,
  source_type text not null default 'manual',
  source_image_id uuid,
  position integer not null default 1 check (position > 0),
  created_at timestamptz not null default now()
);

alter table public.inventory_unit_images
  drop constraint if exists inventory_unit_images_source_type_check;
alter table public.inventory_unit_images
  add constraint inventory_unit_images_source_type_check
  check (source_type in ('manual', 'purchase', 'warehouse_package'));

create unique index if not exists inventory_unit_images_storage_path_idx
  on public.inventory_unit_images(storage_path);
create unique index if not exists inventory_unit_images_unit_position_idx
  on public.inventory_unit_images(inventory_unit_id, position);
create unique index if not exists inventory_unit_images_unit_hash_idx
  on public.inventory_unit_images(inventory_unit_id, sha256)
  where sha256 is not null;
create index if not exists inventory_unit_images_user_idx
  on public.inventory_unit_images(user_id, created_at desc);

alter table public.inventory_unit_images enable row level security;

drop policy if exists owner_full_access_inventory_unit_images
  on public.inventory_unit_images;
create policy owner_full_access_inventory_unit_images
on public.inventory_unit_images
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
on public.inventory_unit_images
to authenticated;

create or replace function public.derive_inventory_pokemon_species(
  p_item_name text,
  p_pokemon_name_en text
)
returns text[]
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_source text;
  v_clean text;
  v_parts text[];
begin
  v_source := nullif(btrim(p_pokemon_name_en), '');

  if v_source is null and coalesce(p_item_name, '') ~ '[A-Za-z]' then
    v_source := btrim(p_item_name);
  end if;

  if v_source is null then
    return '{}'::text[];
  end if;

  v_clean := regexp_replace(
    v_source,
    '^(Shining|Radiant|Dark|Light|Birthday|Surfing|Flying)[[:space:]]+',
    '',
    'i'
  );
  v_clean := regexp_replace(
    v_clean,
    '^(Rocket''s|Team Rocket''s)[[:space:]]+',
    '',
    'i'
  );
  v_clean := regexp_replace(
    v_clean,
    '[[:space:]]+(V-UNION|VMAX|VSTAR|BREAK|LV\\.X|Prime|GX|EX|ex|V)$',
    '',
    'i'
  );

  v_parts := regexp_split_to_array(
    v_clean,
    '[[:space:]]*(?:&|,|[[:space:]]and[[:space:]])[[:space:]]*',
    'i'
  );

  return array(
    select btrim(part)
    from unnest(v_parts) as t(part)
    where btrim(part) <> ''
  );
end;
$$;

create or replace function public.sync_purchase_item_pokemon_identity()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_catalog_english text;
begin
  if new.catalog_snapshot is not null then
    v_catalog_english := coalesce(
      nullif(btrim(new.catalog_snapshot ->> 'englishName'), ''),
      nullif(btrim(new.catalog_snapshot ->> 'pokemonNameEn'), '')
    );
  end if;

  if coalesce(array_length(new.pokemon_species, 1), 0) = 0 then
    new.pokemon_species := public.derive_inventory_pokemon_species(
      new.item_name,
      coalesce(v_catalog_english, new.pokemon_name_en)
    );
  end if;

  if nullif(btrim(coalesce(new.pokemon_name_en, '')), '') is null
     and coalesce(array_length(new.pokemon_species, 1), 0) > 0 then
    new.pokemon_name_en := array_to_string(new.pokemon_species, ', ');
  end if;

  return new;
end;
$$;

drop trigger if exists purchase_items_sync_pokemon_identity on public.purchase_items;
create trigger purchase_items_sync_pokemon_identity
before insert or update of item_name, pokemon_name_en, pokemon_species, catalog_snapshot
on public.purchase_items
for each row
execute function public.sync_purchase_item_pokemon_identity();

create or replace function public.sync_inventory_unit_pokemon_identity()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if coalesce(array_length(new.pokemon_species, 1), 0) = 0 then
    new.pokemon_species := public.derive_inventory_pokemon_species(
      new.item_name,
      new.pokemon_name_en
    );
  end if;

  if nullif(btrim(coalesce(new.pokemon_name_en, '')), '') is null
     and coalesce(array_length(new.pokemon_species, 1), 0) > 0 then
    new.pokemon_name_en := array_to_string(new.pokemon_species, ', ');
  end if;

  return new;
end;
$$;

drop trigger if exists inventory_units_sync_pokemon_identity on public.inventory_units;
create trigger inventory_units_sync_pokemon_identity
before insert or update of item_name, pokemon_name_en, pokemon_species
on public.inventory_units
for each row
execute function public.sync_inventory_unit_pokemon_identity();

-- Existing Purchase Items: derive English species from catalog metadata first.
update public.purchase_items pi
set pokemon_species = public.derive_inventory_pokemon_species(
      pi.item_name,
      coalesce(
        nullif(btrim(pi.catalog_snapshot ->> 'englishName'), ''),
        nullif(btrim(pi.catalog_snapshot ->> 'pokemonNameEn'), ''),
        pi.pokemon_name_en
      )
    )
where coalesce(array_length(pi.pokemon_species, 1), 0) = 0;

update public.purchase_items
set pokemon_name_en = array_to_string(pokemon_species, ', ')
where nullif(btrim(coalesce(pokemon_name_en, '')), '') is null
  and coalesce(array_length(pokemon_species, 1), 0) > 0;

-- Existing physical units: copy identity/lifecycle metadata from their Purchase Item.
update public.inventory_units iu
set pokemon_species = case
      when coalesce(array_length(iu.pokemon_species, 1), 0) > 0 then iu.pokemon_species
      else public.derive_inventory_pokemon_species(
        iu.item_name,
        coalesce(
          nullif(btrim(pi.catalog_snapshot ->> 'englishName'), ''),
          nullif(btrim(iu.pokemon_name_en), ''),
          nullif(btrim(pi.pokemon_name_en), '')
        )
      )
    end,
    pokemon_name_en = coalesce(
      nullif(btrim(iu.pokemon_name_en), ''),
      nullif(btrim(pi.pokemon_name_en), ''),
      nullif(array_to_string(pi.pokemon_species, ', '), '')
    ),
    rarity = coalesce(iu.rarity, pi.rarity),
    purchased_at = coalesce(iu.purchased_at, p.purchased_at::date)
from public.purchase_items pi
left join public.purchases p on p.id = pi.purchase_id
where iu.purchase_item_id = pi.id;

-- Best-effort arrival-date backfill from delivered international shipments.
with item_arrivals as (
  select pi.id as purchase_item_id, max(s.delivered_at)::date as arrived_at
  from public.purchase_items pi
  join public.warehouse_package_purchases wpp
    on wpp.purchase_id = pi.purchase_id
  join public.shipment_packages sp
    on sp.warehouse_package_id = wpp.warehouse_package_id
  join public.shipments s
    on s.id = sp.shipment_id
   and s.status = 'delivered'
   and s.delivered_at is not null
  where pi.purchase_id is not null
  group by pi.id

  union all

  select pi.id as purchase_item_id, max(s.delivered_at)::date as arrived_at
  from public.purchase_items pi
  join public.shipment_packages sp
    on sp.warehouse_package_id = pi.warehouse_package_id
  join public.shipments s
    on s.id = sp.shipment_id
   and s.status = 'delivered'
   and s.delivered_at is not null
  where pi.warehouse_package_id is not null
  group by pi.id
)
update public.inventory_units iu
set arrived_at = arrivals.arrived_at
from (
  select purchase_item_id, max(arrived_at) as arrived_at
  from item_arrivals
  group by purchase_item_id
) arrivals
where iu.purchase_item_id = arrivals.purchase_item_id
  and iu.arrived_at is null;

update public.inventory_units
set arrived_at = created_at::date
where arrived_at is null
  and status = 'in_collection';

notify pgrst, 'reload schema';
commit;
