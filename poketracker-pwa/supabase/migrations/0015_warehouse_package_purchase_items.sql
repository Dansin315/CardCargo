-- CardCargo Inventory v1.2
-- Connect Purchase Items with OLAEET packages.
-- A card row belongs directly either to a Bunjang purchase or to an OLAEET
-- package. Package-owned rows represent bonus/extra cards discovered at OLAEET.
-- Views/APIs merge both scopes so the same row is visible from both sides.

begin;

alter table public.purchase_items
  alter column purchase_id drop not null;

alter table public.purchase_items
  add column if not exists warehouse_package_id uuid;

alter table public.purchase_items
  drop constraint if exists purchase_items_warehouse_package_id_fkey;

alter table public.purchase_items
  add constraint purchase_items_warehouse_package_id_fkey
  foreign key (warehouse_package_id)
  references public.warehouse_packages(id)
  on delete restrict;

alter table public.purchase_items
  drop constraint if exists purchase_items_exactly_one_parent_check;

alter table public.purchase_items
  add constraint purchase_items_exactly_one_parent_check
  check (
    (purchase_id is not null and warehouse_package_id is null)
    or
    (purchase_id is null and warehouse_package_id is not null)
  );

create index if not exists purchase_items_warehouse_package_created_idx
  on public.purchase_items(warehouse_package_id, created_at)
  where warehouse_package_id is not null;

-- Purchase-owned items keep deriving their OLAEET package through
-- warehouse_package_purchases. Package-owned items are direct bonus/extra cards.
-- Inventory remains linked to the same purchase_item row, so edits from either
-- view stay synchronized.
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
    pi.purchase_id,
    pi.warehouse_package_id,
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
