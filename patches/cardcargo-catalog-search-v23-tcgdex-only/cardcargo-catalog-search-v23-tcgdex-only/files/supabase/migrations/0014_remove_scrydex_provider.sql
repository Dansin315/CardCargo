-- CardCargo Catalog Search v23
-- Remove Scrydex as an allowed catalog provider.
-- Existing TCGdex and historical pokemontcg references remain valid.

begin;

update public.purchase_items
set
  catalog_provider = null,
  catalog_card_id = null,
  catalog_language = null,
  catalog_match_type = null,
  catalog_image_url = null,
  catalog_snapshot = null
where catalog_provider = 'scrydex';

alter table public.purchase_items
  drop constraint if exists purchase_items_catalog_provider_check;

alter table public.purchase_items
  add constraint purchase_items_catalog_provider_check
  check (
    catalog_provider is null
    or catalog_provider in ('tcgdex', 'pokemontcg')
  );

notify pgrst, 'reload schema';

commit;
