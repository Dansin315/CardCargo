-- CardCargo Inventory v1
-- Purchase Items remain OPTIONAL. This migration only enriches purchase_items
-- with catalog references and adds an explicit manual inventory-transfer RPC.

alter table public.purchase_items
  add column if not exists catalog_provider text,
  add column if not exists catalog_card_id text,
  add column if not exists catalog_language text,
  add column if not exists catalog_match_type text,
  add column if not exists catalog_image_url text,
  add column if not exists catalog_snapshot jsonb;

alter table public.purchase_items
  drop constraint if exists purchase_items_catalog_provider_check,
  add constraint purchase_items_catalog_provider_check
    check (catalog_provider is null or catalog_provider in ('tcgdex', 'pokemontcg')),
  drop constraint if exists purchase_items_catalog_match_type_check,
  add constraint purchase_items_catalog_match_type_check
    check (catalog_match_type is null or catalog_match_type in ('exact_language', 'equivalent_language'));

create index if not exists purchase_items_purchase_created_idx
  on public.purchase_items(purchase_id, created_at);

create index if not exists purchase_items_catalog_lookup_idx
  on public.purchase_items(catalog_provider, catalog_card_id)
  where catalog_provider is not null and catalog_card_id is not null;

create index if not exists inventory_units_purchase_item_idx
  on public.inventory_units(purchase_item_id)
  where purchase_item_id is not null;

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
