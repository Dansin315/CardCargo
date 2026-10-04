-- CardCargo Inventory v1.3
-- Delivered international shipment -> transfer every recorded card copy into
-- inventory. The operation is idempotent because the existing per-item RPC
-- creates only the quantity that has not yet been transferred.

begin;

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
  v_item_id uuid;
  v_created integer;
  v_total_created integer := 0;
begin
  if not public.is_app_owner() then
    raise exception 'Nicht autorisiert.';
  end if;

  select s.status
  into v_status
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

  for v_item_id in
    -- Bonus/extra cards that belong directly to an OLAEET warehouse package.
    select pi.id
    from public.shipment_packages sp
    join public.purchase_items pi
      on pi.warehouse_package_id = sp.warehouse_package_id
     and pi.user_id = (select auth.uid())
    where sp.shipment_id = p_shipment_id
      and sp.user_id = (select auth.uid())

    union

    -- Purchase-owned cards whose Bunjang purchase belongs to one of the
    -- OLAEET packages contained in this international shipment.
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
