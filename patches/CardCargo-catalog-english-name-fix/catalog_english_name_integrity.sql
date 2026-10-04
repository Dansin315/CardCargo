-- CardCargo catalog English-name integrity fix
-- Fixes species propagation after correcting TCGdex catalog matches.

begin;

-- pokemon_name_en is the explicit species identity and is more authoritative
-- than a full catalog card name stored in catalog_snapshot. Rebuild species
-- wherever a trustworthy English species value is already present.
update public.purchase_items
set pokemon_species = public.derive_inventory_pokemon_species(
  item_name,
  pokemon_name_en
)
where nullif(btrim(pokemon_name_en), '') is not null
  and pokemon_species is distinct from public.derive_inventory_pokemon_species(
    item_name,
    pokemon_name_en
  );

create or replace function public.cardcargo_set_purchase_item_species()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if nullif(btrim(new.pokemon_name_en), '') is not null then
    new.pokemon_species := public.derive_inventory_pokemon_species(
      new.item_name,
      new.pokemon_name_en
    );
  end if;
  return new;
end;
$$;

drop trigger if exists cardcargo_set_purchase_item_species_trigger
  on public.purchase_items;
create trigger cardcargo_set_purchase_item_species_trigger
before insert or update of item_name, pokemon_name_en
on public.purchase_items
for each row
execute function public.cardcargo_set_purchase_item_species();

-- If a catalog correction changes the inherited English Pokemon identity,
-- update linked inventory rows only when they still contain inherited/empty/
-- non-English metadata. Manually customized English species are preserved.
create or replace function public.cardcargo_sync_inventory_species_from_purchase_item()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_old_species text[];
  v_new_species text[];
begin
  if nullif(btrim(new.pokemon_name_en), '') is null then
    return new;
  end if;

  v_old_species := public.derive_inventory_pokemon_species(
    old.item_name,
    old.pokemon_name_en
  );
  v_new_species := public.derive_inventory_pokemon_species(
    new.item_name,
    new.pokemon_name_en
  );

  update public.inventory_units iu
  set
    pokemon_name_en = case
      when iu.pokemon_name_en is null
        or iu.pokemon_name_en = old.pokemon_name_en
        then new.pokemon_name_en
      else iu.pokemon_name_en
    end,
    pokemon_species = case
      when coalesce(array_length(iu.pokemon_species, 1), 0) = 0
        or iu.pokemon_species = v_old_species
        or not exists (
          select 1
          from unnest(coalesce(iu.pokemon_species, '{}'::text[])) as species(value)
          where value ~ '[A-Za-z]'
        )
        then v_new_species
      else iu.pokemon_species
    end
  where iu.purchase_item_id = new.id;

  return new;
end;
$$;

drop trigger if exists cardcargo_sync_inventory_species_from_purchase_item_trigger
  on public.purchase_items;
create trigger cardcargo_sync_inventory_species_from_purchase_item_trigger
after update of item_name, pokemon_name_en
on public.purchase_items
for each row
when (
  old.item_name is distinct from new.item_name
  or old.pokemon_name_en is distinct from new.pokemon_name_en
)
execute function public.cardcargo_sync_inventory_species_from_purchase_item();

-- New Inventory Units created from a Purchase Item should trust the explicit
-- pokemon_name_en value instead of a potentially stale catalog_snapshot.
create or replace function public.cardcargo_normalize_new_inventory_species()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_item_name text;
  v_pokemon_name_en text;
  v_species text[];
begin
  if new.purchase_item_id is null then
    return new;
  end if;

  select pi.item_name, pi.pokemon_name_en
  into v_item_name, v_pokemon_name_en
  from public.purchase_items pi
  where pi.id = new.purchase_item_id;

  if nullif(btrim(v_pokemon_name_en), '') is null then
    return new;
  end if;

  v_species := public.derive_inventory_pokemon_species(
    v_item_name,
    v_pokemon_name_en
  );

  new.pokemon_name_en := v_pokemon_name_en;
  new.pokemon_species := v_species;
  return new;
end;
$$;

drop trigger if exists cardcargo_normalize_new_inventory_species_trigger
  on public.inventory_units;
create trigger cardcargo_normalize_new_inventory_species_trigger
before insert
on public.inventory_units
for each row
execute function public.cardcargo_normalize_new_inventory_species();

notify pgrst, 'reload schema';

commit;
