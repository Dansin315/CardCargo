#!/usr/bin/env python3
from __future__ import annotations

import argparse
from pathlib import Path
import shutil
import sys

OLD_RESOLVER = r'''async function resolveEnglishPokemonNames(
  dexId: number | null,
  suffix: string | null | undefined,
  cache: Map<number, { pokemonNameEn: string | null; englishName: string | null }>,
) {
  if (!dexId) return { pokemonNameEn: null, englishName: null }
  const cached = cache.get(dexId)
  if (cached) return cached
  try {
    const params = new URLSearchParams({ dexId: String(dexId) })
    const briefs = await fetchJson<TcgDexBrief[]>(
      `https://api.tcgdex.net/v2/en/cards?${params.toString()}`,
      undefined,
      { attempts: 1, timeoutMs: 10_000 },
    )

    const names = [...new Set(briefs.map((brief) => brief.name.trim()).filter(Boolean))]
    if (!names.length) {
      const empty = { pokemonNameEn: null, englishName: null }
      cache.set(dexId, empty)
      return empty
    }
    const speciesCandidates = [...new Set(names.map(stripPokemonCardSuffix).filter(Boolean))]
      .sort((a, b) => a.length - b.length || a.localeCompare(b))
    const pokemonNameEn = speciesCandidates[0] ?? null

    const wantedSuffix = normalizedText(suffix)
    const matchingSuffixNames = wantedSuffix
      ? names
          .filter((name) => normalizedText(name).endsWith(wantedSuffix))
          .sort((a, b) => a.length - b.length || a.localeCompare(b))
      : []
    const englishName =
      matchingSuffixNames[0] ??
      (pokemonNameEn ? appendSuffix(pokemonNameEn, suffix) : null)

    const resolved = { pokemonNameEn, englishName }
    cache.set(dexId, resolved)
    return resolved
  } catch {
    const empty = { pokemonNameEn: null, englishName: null }
    cache.set(dexId, empty)
    return empty
  }
}'''

NEW_RESOLVER = r'''async function resolveEnglishPokemonNames(
  dexId: number | null,
  suffix: string | null | undefined,
  cache: Map<string, { pokemonNameEn: string | null; englishName: string | null }>,
) {
  if (!dexId) return { pokemonNameEn: null, englishName: null }

  // The full English card name also depends on the suffix (ex, V, GX, ...),
  // so a dexId-only cache can leak a name from another card form.
  const cacheKey = `${dexId}:${normalizedText(suffix)}`
  const cached = cache.get(cacheKey)
  if (cached) return cached

  // PokeAPI is the authoritative fallback for the species identity. This keeps
  // pokemonNameEn stable even when an English TCGdex card lookup is incomplete.
  const speciesByDexId = await resolvePokemonSpeciesNames([dexId])
  const speciesEnglish = speciesByDexId.get(dexId)?.english?.trim() || null

  try {
    // IMPORTANT: TCGdex's default filter is a contains/lax filter. Without eq:
    // dexId=9 can also match values such as 89, which previously made
    // Blastoise (#9) resolve to Muk (#89). Always request strict equality.
    const params = new URLSearchParams({ dexId: `eq:${dexId}` })
    const briefs = await fetchJson<TcgDexBrief[]>(
      `https://api.tcgdex.net/v2/en/cards?${params.toString()}`,
      undefined,
      { attempts: 1, timeoutMs: 10_000 },
    )

    const names = [...new Set(briefs.map((brief) => brief.name.trim()).filter(Boolean))]
    const speciesCandidates = [...new Set(names.map(stripPokemonCardSuffix).filter(Boolean))]
      .sort((a, b) => a.length - b.length || a.localeCompare(b))
    const pokemonNameEn = speciesEnglish ?? speciesCandidates[0] ?? null

    const wantedSuffix = normalizedText(suffix)
    const matchingSuffixNames = wantedSuffix
      ? names
          .filter((name) => normalizedText(name).endsWith(wantedSuffix))
          .sort((a, b) => a.length - b.length || a.localeCompare(b))
      : []
    const englishName =
      matchingSuffixNames[0] ??
      (pokemonNameEn ? appendSuffix(pokemonNameEn, suffix) : null)

    const resolved = { pokemonNameEn, englishName }
    cache.set(cacheKey, resolved)
    return resolved
  } catch {
    // A failed TCGdex enrichment must not erase a species that PokeAPI already
    // resolved successfully (e.g. Japanese Mew -> Mew).
    const fallback = {
      pokemonNameEn: speciesEnglish,
      englishName: speciesEnglish ? appendSuffix(speciesEnglish, suffix) : null,
    }
    cache.set(cacheKey, fallback)
    return fallback
  }
}'''

REPLACEMENTS = [
    (
        "  let localizedSearchNames: string[] = []\n  let crossLanguageNameMode: CrossLanguageNamePlan['mode'] | null = null\n",
        "  let localizedSearchNames: string[] = []\n  let crossLanguageNameMode: CrossLanguageNamePlan['mode'] | null = null\n  let crossLanguageDexIds: number[] = []\n",
        "cross-language dexId state",
    ),
    (
        "    localizedSearchNames = plan.localizedSearchNames\n    crossLanguageNameMode = plan.mode\n",
        "    localizedSearchNames = plan.localizedSearchNames\n    crossLanguageNameMode = plan.mode\n    crossLanguageDexIds = plan.dexIds\n",
        "preserve cross-language dexIds",
    ),
    (
        "  const englishNameCache = new Map<\n    number,\n    { pokemonNameEn: string | null; englishName: string | null }\n  >()\n",
        "  const englishNameCache = new Map<\n    string,\n    { pokemonNameEn: string | null; englishName: string | null }\n  >()\n",
        "suffix-aware English-name cache",
    ),
    (
        "      const dexId = detail?.dexId?.[0] ?? null\n\n      let pokemonNameEn: string | null = null\n",
        "      const detailDexId =\n        detail?.dexId?.find((value) => Number.isInteger(value) && value > 0) ?? null\n      const dexId =\n        detailDexId ??\n        (crossLanguageDexIds.length === 1 ? crossLanguageDexIds[0] : null)\n\n      let pokemonNameEn: string | null = null\n",
        "dexId fallback from cross-language resolver",
    ),
    (
        "      } else if (detail?.category === 'Pokemon' && dexId) {\n",
        "      } else if (\n        dexId &&\n        (detail?.category === 'Pokemon' ||\n          (crossLanguageEnglishName && crossLanguageDexIds.length === 1))\n      ) {\n",
        "allow trusted cross-language Pokemon fallback",
    ),
    (
        "        pokemonNameEn = resolved.pokemonNameEn\n        englishName = resolved.englishName\n      }\n      const snapshot = detail\n",
        "        pokemonNameEn = resolved.pokemonNameEn\n        englishName = resolved.englishName\n\n        // When the search itself contained a supported English card-name\n        // modifier (Shining, Radiant, ...), preserve that full English card\n        // name while pokemonNameEn remains the bare species.\n        if (\n          crossLanguageNameMode === 'card-name' &&\n          crossLanguageDexIds.length === 1 &&\n          knownEnglishCardNameModifier(name)\n        ) {\n          englishName = appendSuffix(name, detail?.suffix)\n        }\n      }\n      const snapshot = detail\n",
        "preserve English card-name modifiers",
    ),
    (
        "            dexId: detail.dexId ?? [],\n            suffix: detail.suffix ?? null,\n",
        "            dexId: detail.dexId ?? [],\n            resolvedDexId: dexId,\n            dexIdSource: detailDexId ? 'tcgdex' : dexId ? 'cross-language' : null,\n            suffix: detail.suffix ?? null,\n",
        "catalog-resolution diagnostics",
    ),
]

MIGRATION = r'''-- CardCargo catalog English-name integrity fix
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
'''

README = r'''# CardCargo – Fix für falsche englische Pokémon-Namen

Dieser Patch ist für den Branch `feature/olaeet-module` gedacht.

## Behobene Fehler

1. **Blastoise (#9) wurde als Muk (#89) erkannt.**
   Die englische TCGdex-Abfrage verwendete `dexId=9`. TCGdex nutzt ohne Prefix einen laxen/contains-Filter. Der Patch verwendet deshalb `dexId=eq:9` und nimmt die Pokémon-Spezies zusätzlich aus PokeAPI als stabile Referenz.

2. **Mew aus japanischen Sets hatte teilweise keinen englischen Namen.**
   Die Cross-Language-Suche kann die Pokédex-ID bereits ermitteln, hat sie später aber verworfen, falls der japanische TCGdex-Detaildatensatz keine `dexId` enthielt. Der Patch trägt diese ID bis in die Kandidaten-Enrichment-Stufe weiter.

3. **„Treffer übernehmen“ hat den englischen Kartennamen als Hauptnamen bevorzugt.**
   Bei japanischen Karten bleibt jetzt `candidate.name` der sichtbare Kartenname. `candidate.pokemonNameEn` ist separat die englische Pokémon-Spezies.

4. **Bestehende Inventory-Daten können falsche/duplizierte Species behalten.**
   Eine neue Migration synchronisiert korrigierte `pokemon_name_en`-Werte sicher zu verknüpften Inventory Units, solange die dortige Species noch geerbt, leer oder nicht-englisch ist. Manuell abweichend gepflegte englische Species werden nicht überschrieben.

## Erwartete Ergebnisse

- `カメックスex` / SV2a / #009 → Englisch: `Blastoise ex`, Species: `Blastoise`
- `ミュウex` / SV4a → Englisch: `Mew ex`, Species: `Mew`
- `Shining Rayquaza` → vollständiger englischer Kartenname bleibt `Shining Rayquaza`, Species bleibt `Rayquaza`

Im Inventar soll damit z. B. stehen:

    ミュウex
    Mew

und nicht zweimal der japanische Name.

## Anwenden

Vom entpackten Patch-Verzeichnis aus:

    python3 apply_catalog_fix.py /pfad/zu/CardCargo

Das Script sucht den CardCargo-App-Root automatisch, prüft die erwarteten Quelltexte vor dem Schreiben und legt `.bak-catalog-fix`-Sicherungen der veränderten Dateien an.

Danach im App-Verzeichnis die Migration anwenden und prüfen:

    supabase db push
    npm run typecheck
    npm run lint
    npm run build

## Bereits falsch gespeicherte Karten reparieren

Nach Deployment den betroffenen Purchase Item öffnen, den korrekten Katalogtreffer erneut suchen und einmal **„Treffer übernehmen“ → Speichern** ausführen. Die neue DB-Logik übernimmt die korrigierte Species auch in verknüpfte Inventory Units, sofern dort noch der alte geerbte Wert steht.
'''


def resolve_app_root(root: Path) -> Path:
    # The repository contains historical copies/patches. Prefer the canonical
    # poketracker-pwa folder explicitly so we never modify a backup by accident.
    nested = root / 'poketracker-pwa'
    if (nested / 'lib' / 'card-catalog-server.ts').exists():
        return nested
    if (root / 'lib' / 'card-catalog-server.ts').exists():
        return root
    candidates = [
        p.parent.parent
        for p in root.rglob('card-catalog-server.ts')
        if '.git' not in p.parts and 'node_modules' not in p.parts and 'broken' not in str(p).lower()
    ]
    unique = []
    for candidate in candidates:
        if candidate not in unique:
            unique.append(candidate)
    if len(unique) != 1:
        details = '\n'.join(f'  - {p}' for p in unique) or '  (keine)'
        raise RuntimeError(f'CardCargo-App-Root ist nicht eindeutig:\n{details}')
    return unique[0]


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f'Replacement "{label}" erwartet genau 1 Treffer, gefunden: {count}. Keine Datei wurde geschrieben.')
    return text.replace(old, new, 1)


def find_purchase_manager(app_root: Path) -> Path:
    needle = 'itemName: candidate.englishName || candidate.name || current.itemName,'
    matches = []
    for pattern in ('*.tsx', '*.ts'):
        for path in app_root.rglob(pattern):
            if '.git' in path.parts or 'node_modules' in path.parts:
                continue
            try:
                text = path.read_text(encoding='utf-8')
            except Exception:
                continue
            if needle in text:
                matches.append(path)
    if len(matches) != 1:
        details = '\n'.join(f'  - {p}' for p in matches) or '  (keine)'
        raise RuntimeError('Purchase-Item-Datei mit der alten Treffer-Übernahme ist nicht eindeutig:\n' + details)
    return matches[0]


def backup(path: Path) -> None:
    bak = path.with_name(path.name + '.bak-catalog-fix')
    if not bak.exists():
        shutil.copy2(path, bak)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument('repo', type=Path, help='Pfad zum CardCargo-Repository')
    args = parser.parse_args()
    root = args.repo.expanduser().resolve()
    if not root.exists():
        raise RuntimeError(f'Repository-Pfad existiert nicht: {root}')

    app_root = resolve_app_root(root)
    server = app_root / 'lib' / 'card-catalog-server.ts'
    manager = find_purchase_manager(app_root)

    server_original = server.read_text(encoding='utf-8')
    manager_original = manager.read_text(encoding='utf-8')

    # Validate every expected old fragment first in memory. No partial writes.
    server_new = replace_once(server_original, OLD_RESOLVER, NEW_RESOLVER, 'English resolver')
    for old, new, label in REPLACEMENTS:
        server_new = replace_once(server_new, old, new, label)

    manager_new = replace_once(
        manager_original,
        '      itemName: candidate.englishName || candidate.name || current.itemName,',
        '      itemName: candidate.name || current.itemName,',
        'localized card name on Treffer übernehmen',
    )

    migration_dir = app_root / 'supabase' / 'migrations'
    if not migration_dir.exists():
        raise RuntimeError(f'Migrationsverzeichnis nicht gefunden: {migration_dir}')

    if (migration_dir / '0018_inventory_species_language_bulk.sql').exists() or any(migration_dir.glob('0018_*.sql')):
        migration_path = migration_dir / '0019_catalog_english_name_integrity.sql'
    else:
        migration_path = migration_dir / '0018_catalog_english_name_integrity.sql'

    if migration_path.exists() and migration_path.read_text(encoding='utf-8') != MIGRATION:
        raise RuntimeError(f'Migration existiert bereits mit anderem Inhalt: {migration_path}')

    backup(server)
    backup(manager)
    server.write_text(server_new, encoding='utf-8')
    manager.write_text(manager_new, encoding='utf-8')
    migration_path.write_text(MIGRATION, encoding='utf-8')

    print('CardCargo-Katalogfix erfolgreich angewendet:')
    print(f'  Server:    {server}')
    print(f'  UI:        {manager}')
    print(f'  Migration: {migration_path}')
    print('\nNächste Schritte: supabase db push, typecheck, lint, build.')
    return 0


if __name__ == '__main__':
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f'FEHLER: {exc}', file=sys.stderr)
        raise SystemExit(1)
