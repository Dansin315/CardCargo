-- CardCargo v43
-- Allow deletion of an OLAEET warehouse package that owns direct bonus/extra
-- purchase_items. Those rows cannot exist without their warehouse package
-- because purchase_items_exactly_one_parent_check requires exactly one parent.
--
-- Inventory units are preserved: inventory_units.purchase_item_id already uses
-- ON DELETE SET NULL, so a previously transferred physical inventory item
-- remains in the inventory when its package-owned source row is removed.

begin;

alter table public.purchase_items
  drop constraint if exists purchase_items_warehouse_package_id_fkey;

alter table public.purchase_items
  add constraint purchase_items_warehouse_package_id_fkey
  foreign key (warehouse_package_id)
  references public.warehouse_packages(id)
  on delete cascade;

notify pgrst, 'reload schema';

commit;
