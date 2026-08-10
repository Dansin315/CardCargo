-- CardCargo Catalog Search v22
-- Allow Scrydex as a catalog provider for purchase items.

begin;

alter table public.purchase_items
  drop constraint if exists purchase_items_catalog_provider_check;

alter table public.purchase_items
  add constraint purchase_items_catalog_provider_check
  check (
    catalog_provider is null
    or catalog_provider in ('tcgdex', 'scrydex', 'pokemontcg')
  );

notify pgrst, 'reload schema';

commit;
