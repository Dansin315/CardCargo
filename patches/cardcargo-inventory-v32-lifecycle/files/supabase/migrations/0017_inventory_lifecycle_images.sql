-- CardCargo Inventory v1.4 / UI v32
-- Inventory lifecycle, editable Pokemon species, estimated value, dates and images.

begin;

alter table public.purchase_items
  add column if not exists pokemon_species text[] not null default '{}'::text[];

alter table public.inventory_units
  add column if not exists pokemon_species text[] not null default '{}'::text[],
  add column if not exists rarity text,
  add column if not exists estimated_value numeric(14,2),
  add column if not exists estimated_value_currency text not null default 'EUR',
  add column if not exists purchased_at date,
  add column if not exists arrived_at date;

alter table public.inventory_units
  drop constraint if exists inventory_units_estimated_value_currency_check;

alter table public.inventory_units
  add constraint inventory_units_estimated_value_currency_check
  check (char_length(estimated_value_currency) = 3);

alter table public.inventory_units
  drop constraint if exists inventory_units_estimated_value_nonnegative_check;

alter table public.inventory_units
  add constraint inventory_units_estimated_value_nonnegative_check
  check (estimated_value is null or estimated_value >= 0);

create index if not exists purchase_items_pokemon_species_idx
  on public.purchase_items using gin (pokemon_species);

create index if not exists inventory_units_pokemon_species_idx
  on public.inventory_units using gin (pokemon_species);

create index if not exists inventory_units_purchased_at_idx
  on public.inventory_units(user_id, purchased_at desc)
  where purchased_at is not null;

create index if not exists inventory_units_arrived_at_idx
  on public.inventory_units(user_id, arrived_at desc)
  where arrived_at is not null;

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
  created_at timestamptz not null default now(),
  unique (inventory_unit_id, position)
);

alter table public.inventory_unit_images
  drop constraint if exists inventory_unit_images_source_type_check;

alter table public.inventory_unit_images
  add constraint inventory_unit_images_source_type_check
  check (source_type in ('manual', 'purchase', 'warehouse_package'));

create index if not exists inventory_unit_images_unit_idx
  on public.inventory_unit_images(inventory_unit_id, position);

create unique index if not exists inventory_unit_images_unit_hash_idx
  on public.inventory_unit_images(inventory_unit_id, sha256)
  where sha256 is not null;

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

  -- Remove common card-name modifiers while preserving the Pokemon species.
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

  -- Remove portable TCG suffixes such as V, GX, VMAX, VSTAR and ex.
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

-- Backfill the new species field from existing English catalog metadata.
update public.purchase_items
set pokemon_species = public.derive_inventory_pokemon_species(
  item_name,
  coalesce(catalog_snapshot->>'englishName', pokemon_name_en)
)
where coalesce(array_length(pokemon_species, 1), 0) = 0;

update public.inventory_units iu
set
  pokemon_species = case
    when coalesce(array_length(iu.pokemon_species, 1), 0) > 0
      then iu.pokemon_species
    else public.derive_inventory_pokemon_species(
      iu.item_name,
      coalesce(pi.catalog_snapshot->>'englishName', iu.pokemon_name_en, pi.pokemon_name_en)
    )
  end,
  rarity = coalesce(iu.rarity, pi.rarity),
  purchased_at = coalesce(iu.purchased_at, p.purchased_at)
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

-- Older Inventory Units may have been manually transferred before CardCargo
-- started recording arrival dates. Use the inventory creation date as a safe
-- fallback for already-collected physical cards.
update public.inventory_units
set arrived_at = created_at::date
where arrived_at is null
  and status = 'in_collection';

create or replace function public.create_inventory_units_from_purchase_item(
  p_purchase_item_id uuid
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item record;
  v_existing integer;
  v_remaining integer;
  v_index integer;
  v_species text[];
begin
  if not public.is_app_owner() then
    raise exception 'Not authorized';
  end if;

  select
    pi.id,
    pi.user_id,
    pi.purchase_id,
    pi.warehouse_package_id,
    pi.item_name,
    pi.set_name,
    pi.set_code,
    pi.pokemon_name_en,
    pi.pokemon_species,
    pi.card_number,
    pi.language,
    pi.rarity,
    pi.catalog_snapshot,
    pi.quantity,
    pi.grading_company,
    pi.grade,
    pi.allocated_unit_cost,
    pi.notes,
    p.purchased_at,
    coalesce(p.price_currency, 'KRW') as price_currency
  into v_item
  from public.purchase_items pi
  left join public.purchases p
    on p.id = pi.purchase_id
   and p.user_id = (select auth.uid())
  left join public.warehouse_packages wp
    on wp.id = pi.warehouse_package_id
   and wp.user_id = (select auth.uid())
  where pi.id = p_purchase_item_id
    and pi.user_id = (select auth.uid())
    and (
      (pi.purchase_id is not null and p.id is not null)
      or
      (pi.warehouse_package_id is not null and wp.id is not null)
    )
  for update of pi;

  if not found then
    raise exception 'Purchase item not found';
  end if;

  select coalesce(sum(iu.quantity), 0)::integer
  into v_existing
  from public.inventory_units iu
  where iu.purchase_item_id = p_purchase_item_id
    and iu.user_id = (select auth.uid());

  v_remaining := greatest(0, v_item.quantity - v_existing);

  if v_remaining = 0 then
    return 0;
  end if;

  v_species := case
    when coalesce(array_length(v_item.pokemon_species, 1), 0) > 0
      then v_item.pokemon_species
    else public.derive_inventory_pokemon_species(
      v_item.item_name,
      coalesce(v_item.catalog_snapshot->>'englishName', v_item.pokemon_name_en)
    )
  end;

  for v_index in 1..v_remaining loop
    insert into public.inventory_units (
      user_id,
      purchase_item_id,
      item_name,
      set_name,
      set_code,
      pokemon_name_en,
      pokemon_species,
      card_number,
      language,
      rarity,
      quantity,
      grading_company,
      grade,
      allocated_total_cost,
      cost_currency,
      status,
      purchased_at,
      arrived_at,
      notes
    ) values (
      v_item.user_id,
      p_purchase_item_id,
      v_item.item_name,
      v_item.set_name,
      v_item.set_code,
      v_item.pokemon_name_en,
      v_species,
      v_item.card_number,
      v_item.language,
      v_item.rarity,
      1,
      v_item.grading_company,
      v_item.grade,
      v_item.allocated_unit_cost,
      v_item.price_currency,
      'in_collection',
      v_item.purchased_at,
      current_date,
      v_item.notes
    );
  end loop;

  return v_remaining;
end;
$$;

revoke all on function public.create_inventory_units_from_purchase_item(uuid) from public;
grant execute on function public.create_inventory_units_from_purchase_item(uuid) to authenticated;

create or replace function public.create_inventory_units_from_shipment(
  p_shipment_id uuid
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
  v_delivered_at timestamptz;
  v_arrived_on date;
  v_item_id uuid;
  v_created integer;
  v_total_created integer := 0;
begin
  if not public.is_app_owner() then
    raise exception 'Nicht autorisiert.';
  end if;

  select s.status, s.delivered_at
  into v_status, v_delivered_at
  from public.shipments s
  where s.id = p_shipment_id
    and s.user_id = (select auth.uid())
  for update;

  if not found then
    raise exception 'Internationale Sendung wurde nicht gefunden.';
  end if;

  if v_status <> 'delivered' then
    raise exception
      'Nur zugestellte internationale Sendungen können vollständig ins Inventar übernommen werden.';
  end if;

  v_arrived_on := coalesce(v_delivered_at::date, current_date);

  for v_item_id in
    select pi.id
    from public.shipment_packages sp
    join public.purchase_items pi
      on pi.warehouse_package_id = sp.warehouse_package_id
     and pi.user_id = (select auth.uid())
    where sp.shipment_id = p_shipment_id
      and sp.user_id = (select auth.uid())

    union

    select pi.id
    from public.shipment_packages sp
    join public.warehouse_package_purchases wpp
      on wpp.warehouse_package_id = sp.warehouse_package_id
     and wpp.user_id = (select auth.uid())
    join public.purchase_items pi
      on pi.purchase_id = wpp.purchase_id
     and pi.user_id = (select auth.uid())
    where sp.shipment_id = p_shipment_id
      and sp.user_id = (select auth.uid())
  loop
    select public.create_inventory_units_from_purchase_item(v_item_id)
    into v_created;

    update public.inventory_units
    set
      status = case
        when status in ('expected', 'in_warehouse', 'in_transit')
          then 'in_collection'::public.inventory_status
        else status
      end,
      arrived_at = coalesce(arrived_at, v_arrived_on)
    where purchase_item_id = v_item_id
      and user_id = (select auth.uid());

    v_total_created := v_total_created + coalesce(v_created, 0);
  end loop;

  return v_total_created;
end;
$$;

revoke all
on function public.create_inventory_units_from_shipment(uuid)
from public;

grant execute
on function public.create_inventory_units_from_shipment(uuid)
to authenticated;

notify pgrst, 'reload schema';

commit;
