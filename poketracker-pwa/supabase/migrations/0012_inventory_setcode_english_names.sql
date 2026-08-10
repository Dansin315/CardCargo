-- CardCargo Inventory v1.1
-- Adds set codes and English Pokemon names to purchase items and physical inventory.

begin;

alter table public.purchase_items
  add column if not exists set_code text,
  add column if not exists pokemon_name_en text;

alter table public.inventory_units
  add column if not exists set_name text,
  add column if not exists set_code text,
  add column if not exists pokemon_name_en text,
  add column if not exists card_number text,
  add column if not exists language text;

create index if not exists purchase_items_set_code_idx
  on public.purchase_items(user_id, set_code)
  where set_code is not null;

create index if not exists purchase_items_pokemon_name_en_idx
  on public.purchase_items(user_id, pokemon_name_en)
  where pokemon_name_en is not null;

create index if not exists inventory_units_set_code_idx
  on public.inventory_units(user_id, set_code)
  where set_code is not null;

create index if not exists inventory_units_pokemon_name_en_idx
  on public.inventory_units(user_id, pokemon_name_en)
  where pokemon_name_en is not null;

-- Best-effort set-code backfill for old TCGdex-linked purchase items.
-- TCGdex card IDs follow SETCODE-localId for the records used by CardCargo.
update public.purchase_items
set set_code = split_part(catalog_card_id, '-', 1)
where set_code is null
  and catalog_provider = 'tcgdex'
  and catalog_card_id is not null
  and position('-' in catalog_card_id) > 0;

-- Existing physical inventory receives identity metadata from its Purchase Item.
update public.inventory_units iu
set
  item_name = pi.item_name,
  set_name = pi.set_name,
  set_code = pi.set_code,
  pokemon_name_en = pi.pokemon_name_en,
  card_number = pi.card_number,
  language = pi.language
from public.purchase_items pi
where iu.purchase_item_id = pi.id;

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
begin
  if not public.is_app_owner() then
    raise exception 'Not authorized';
  end if;

  select
    pi.id,
    pi.user_id,
    pi.item_name,
    pi.set_name,
    pi.set_code,
    pi.pokemon_name_en,
    pi.card_number,
    pi.language,
    pi.quantity,
    pi.grading_company,
    pi.grade,
    pi.allocated_unit_cost,
    pi.notes,
    p.price_currency
  into v_item
  from public.purchase_items pi
  join public.purchases p on p.id = pi.purchase_id
  where pi.id = p_purchase_item_id
    and pi.user_id = (select auth.uid())
    and p.user_id = (select auth.uid())
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

  for v_index in 1..v_remaining loop
    insert into public.inventory_units (
      user_id,
      purchase_item_id,
      item_name,
      set_name,
      set_code,
      pokemon_name_en,
      card_number,
      language,
      quantity,
      grading_company,
      grade,
      allocated_total_cost,
      cost_currency,
      status,
      notes
    ) values (
      v_item.user_id,
      p_purchase_item_id,
      v_item.item_name,
      v_item.set_name,
      v_item.set_code,
      v_item.pokemon_name_en,
      v_item.card_number,
      v_item.language,
      1,
      v_item.grading_company,
      v_item.grade,
      v_item.allocated_unit_cost,
      v_item.price_currency,
      'in_collection',
      v_item.notes
    );
  end loop;

  return v_remaining;
end;
$$;

revoke all on function public.create_inventory_units_from_purchase_item(uuid) from public;
grant execute on function public.create_inventory_units_from_purchase_item(uuid) to authenticated;

notify pgrst, 'reload schema';

commit;
