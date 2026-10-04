#!/usr/bin/env python3
from __future__ import annotations
import argparse
from pathlib import Path
import re
import shutil
import sys

NEW_RESOLVER = "async function resolveEnglishPokemonNames(\n  dexId: number | null,\n  suffix: string | null | undefined,\n  cache: Map<string, { pokemonNameEn: string | null; englishName: string | null }>,\n) {\n  if (!dexId) return { pokemonNameEn: null, englishName: null }\n\n  // The full English card name also depends on the suffix (ex, V, GX, ...),\n  // so a dexId-only cache can leak a name from another card form.\n  const cacheKey = `${dexId}:${normalizedText(suffix)}`\n  const cached = cache.get(cacheKey)\n  if (cached) return cached\n\n  // PokeAPI is the authoritative fallback for the species identity. This keeps\n  // pokemonNameEn stable even when an English TCGdex card lookup is incomplete.\n  const speciesByDexId = await resolvePokemonSpeciesNames([dexId])\n  const speciesEnglish = speciesByDexId.get(dexId)?.english?.trim() || null\n\n  try {\n    // IMPORTANT: TCGdex's default filter is a contains/lax filter. Without eq:\n    // dexId=9 can also match values such as 89, which previously made\n    // Blastoise (#9) resolve to Muk (#89). Always request strict equality.\n    const params = new URLSearchParams({ dexId: `eq:${dexId}` })\n    const briefs = await fetchJson<TcgDexBrief[]>(\n      `https://api.tcgdex.net/v2/en/cards?${params.toString()}`,\n      undefined,\n      { attempts: 1, timeoutMs: 10_000 },\n    )\n\n    const names = [...new Set(briefs.map((brief) => brief.name.trim()).filter(Boolean))]\n    const speciesCandidates = [...new Set(names.map(stripPokemonCardSuffix).filter(Boolean))]\n      .sort((a, b) => a.length - b.length || a.localeCompare(b))\n    const pokemonNameEn = speciesEnglish ?? speciesCandidates[0] ?? null\n\n    const wantedSuffix = normalizedText(suffix)\n    const matchingSuffixNames = wantedSuffix\n      ? names\n          .filter((name) => normalizedText(name).endsWith(wantedSuffix))\n          .sort((a, b) => a.length - b.length || a.localeCompare(b))\n      : []\n    const englishName =\n      matchingSuffixNames[0] ??\n      (pokemonNameEn ? appendSuffix(pokemonNameEn, suffix) : null)\n\n    const resolved = { pokemonNameEn, englishName }\n    cache.set(cacheKey, resolved)\n    return resolved\n  } catch {\n    // A failed TCGdex enrichment must not erase a species that PokeAPI already\n    // resolved successfully (e.g. Japanese Mew -> Mew).\n    const fallback = {\n      pokemonNameEn: speciesEnglish,\n      englishName: speciesEnglish ? appendSuffix(speciesEnglish, suffix) : null,\n    }\n    cache.set(cacheKey, fallback)\n    return fallback\n  }\n}"
MIGRATION = "-- CardCargo catalog English-name integrity fix\n-- Fixes species propagation after correcting TCGdex catalog matches.\n\nbegin;\n\n-- pokemon_name_en is the explicit species identity and is more authoritative\n-- than a full catalog card name stored in catalog_snapshot. Rebuild species\n-- wherever a trustworthy English species value is already present.\nupdate public.purchase_items\nset pokemon_species = public.derive_inventory_pokemon_species(\n  item_name,\n  pokemon_name_en\n)\nwhere nullif(btrim(pokemon_name_en), '') is not null\n  and pokemon_species is distinct from public.derive_inventory_pokemon_species(\n    item_name,\n    pokemon_name_en\n  );\n\ncreate or replace function public.cardcargo_set_purchase_item_species()\nreturns trigger\nlanguage plpgsql\nset search_path = ''\nas $$\nbegin\n  if nullif(btrim(new.pokemon_name_en), '') is not null then\n    new.pokemon_species := public.derive_inventory_pokemon_species(\n      new.item_name,\n      new.pokemon_name_en\n    );\n  end if;\n  return new;\nend;\n$$;\n\ndrop trigger if exists cardcargo_set_purchase_item_species_trigger\n  on public.purchase_items;\ncreate trigger cardcargo_set_purchase_item_species_trigger\nbefore insert or update of item_name, pokemon_name_en\non public.purchase_items\nfor each row\nexecute function public.cardcargo_set_purchase_item_species();\n\n-- If a catalog correction changes the inherited English Pokemon identity,\n-- update linked inventory rows only when they still contain inherited/empty/\n-- non-English metadata. Manually customized English species are preserved.\ncreate or replace function public.cardcargo_sync_inventory_species_from_purchase_item()\nreturns trigger\nlanguage plpgsql\nset search_path = ''\nas $$\ndeclare\n  v_old_species text[];\n  v_new_species text[];\nbegin\n  if nullif(btrim(new.pokemon_name_en), '') is null then\n    return new;\n  end if;\n\n  v_old_species := public.derive_inventory_pokemon_species(\n    old.item_name,\n    old.pokemon_name_en\n  );\n  v_new_species := public.derive_inventory_pokemon_species(\n    new.item_name,\n    new.pokemon_name_en\n  );\n\n  update public.inventory_units iu\n  set\n    pokemon_name_en = case\n      when iu.pokemon_name_en is null\n        or iu.pokemon_name_en = old.pokemon_name_en\n        then new.pokemon_name_en\n      else iu.pokemon_name_en\n    end,\n    pokemon_species = case\n      when coalesce(array_length(iu.pokemon_species, 1), 0) = 0\n        or iu.pokemon_species = v_old_species\n        or not exists (\n          select 1\n          from unnest(coalesce(iu.pokemon_species, '{}'::text[])) as species(value)\n          where value ~ '[A-Za-z]'\n        )\n        then v_new_species\n      else iu.pokemon_species\n    end\n  where iu.purchase_item_id = new.id;\n\n  return new;\nend;\n$$;\n\ndrop trigger if exists cardcargo_sync_inventory_species_from_purchase_item_trigger\n  on public.purchase_items;\ncreate trigger cardcargo_sync_inventory_species_from_purchase_item_trigger\nafter update of item_name, pokemon_name_en\non public.purchase_items\nfor each row\nwhen (\n  old.item_name is distinct from new.item_name\n  or old.pokemon_name_en is distinct from new.pokemon_name_en\n)\nexecute function public.cardcargo_sync_inventory_species_from_purchase_item();\n\n-- New Inventory Units created from a Purchase Item should trust the explicit\n-- pokemon_name_en value instead of a potentially stale catalog_snapshot.\ncreate or replace function public.cardcargo_normalize_new_inventory_species()\nreturns trigger\nlanguage plpgsql\nset search_path = ''\nas $$\ndeclare\n  v_item_name text;\n  v_pokemon_name_en text;\n  v_species text[];\nbegin\n  if new.purchase_item_id is null then\n    return new;\n  end if;\n\n  select pi.item_name, pi.pokemon_name_en\n  into v_item_name, v_pokemon_name_en\n  from public.purchase_items pi\n  where pi.id = new.purchase_item_id;\n\n  if nullif(btrim(v_pokemon_name_en), '') is null then\n    return new;\n  end if;\n\n  v_species := public.derive_inventory_pokemon_species(\n    v_item_name,\n    v_pokemon_name_en\n  );\n\n  new.pokemon_name_en := v_pokemon_name_en;\n  new.pokemon_species := v_species;\n  return new;\nend;\n$$;\n\ndrop trigger if exists cardcargo_normalize_new_inventory_species_trigger\n  on public.inventory_units;\ncreate trigger cardcargo_normalize_new_inventory_species_trigger\nbefore insert\non public.inventory_units\nfor each row\nexecute function public.cardcargo_normalize_new_inventory_species();\n\nnotify pgrst, 'reload schema';\n\ncommit;\n"

def resolve_app_root(root: Path) -> Path:
    nested = root / 'poketracker-pwa'
    if (nested / 'lib' / 'card-catalog-server.ts').exists(): return nested
    if (root / 'lib' / 'card-catalog-server.ts').exists(): return root
    candidates = []
    for p in root.rglob('card-catalog-server.ts'):
        if '.git' in p.parts or 'node_modules' in p.parts or 'broken' in str(p).lower(): continue
        candidate = p.parent.parent
        if candidate not in candidates: candidates.append(candidate)
    if len(candidates) != 1:
        details = '\n'.join(f'  - {p}' for p in candidates) or '  (keine)'
        raise RuntimeError(f'CardCargo-App-Root ist nicht eindeutig:\n{details}')
    return candidates[0]

def backup(path: Path) -> None:
    bak = path.with_name(path.name + '.bak-catalog-fix-v2')
    if not bak.exists(): shutil.copy2(path, bak)

def replace_function_by_markers(text: str) -> tuple[str, str]:
    start_marker = 'async function resolveEnglishPokemonNames('
    end_marker = '\nasync function fetchTcgdexSet('
    start = text.find(start_marker)
    end = text.find(end_marker, start if start >= 0 else 0)
    if start < 0 or end < 0:
        if 'dexId: `eq:${dexId}`' in text and 'const cacheKey = `${dexId}:${normalizedText(suffix)}`' in text:
            return text, 'bereits vorhanden'
        raise RuntimeError('English resolver konnte nicht ueber Funktionsmarker gefunden werden.')
    current = text[start:end].strip()
    if current == NEW_RESOLVER.strip(): return text, 'bereits vorhanden'
    return text[:start] + NEW_RESOLVER.rstrip() + text[end:], 'ersetzt'

def regex_sub_once(text: str, pattern: str, repl, label: str, already: str | None = None) -> tuple[str, str]:
    if already and already in text: return text, 'bereits vorhanden'
    new_text, count = re.subn(pattern, repl, text, count=1, flags=re.MULTILINE)
    if count != 1: raise RuntimeError(f'{label}: erwarteter Codeanker nicht gefunden.')
    return new_text, 'geaendert'

def apply_server_changes(text: str) -> tuple[str, list[str]]:
    log = []
    text, status = replace_function_by_markers(text); log.append(f'English resolver: {status}')
    text, status = regex_sub_once(text, r"^(\s*)let crossLanguageNameMode: CrossLanguageNamePlan\['mode'\] \| null = null\s*$", lambda m: m.group(0)+'\n'+m.group(1)+'let crossLanguageDexIds: number[] = []', 'cross-language dexId state', 'let crossLanguageDexIds: number[] = []'); log.append(f'cross-language dexId state: {status}')
    text, status = regex_sub_once(text, r"^(\s*)crossLanguageNameMode = plan\.mode\s*$", lambda m: m.group(0)+'\n'+m.group(1)+'crossLanguageDexIds = plan.dexIds', 'preserve cross-language dexIds', 'crossLanguageDexIds = plan.dexIds'); log.append(f'preserve cross-language dexIds: {status}')
    if re.search(r"const englishNameCache = new Map<\s*string,", text): log.append('suffix-aware English-name cache: bereits vorhanden')
    else:
        text, status = regex_sub_once(text, r"const englishNameCache = new Map<\s*number,", 'const englishNameCache = new Map<\n    string,', 'suffix-aware English-name cache'); log.append(f'suffix-aware English-name cache: {status}')
    if 'const detailDexId =' in text: log.append('dexId fallback: bereits vorhanden')
    else:
        def dex_repl(m):
            i=m.group(1)
            return f"{i}const detailDexId =\n{i}  detail?.dexId?.find((value) => Number.isInteger(value) && value > 0) ?? null\n{i}const dexId =\n{i}  detailDexId ??\n{i}  (crossLanguageDexIds.length === 1 ? crossLanguageDexIds[0] : null)"
        text, status = regex_sub_once(text, r"^(\s*)const dexId\s*=\s*detail\?\.dexId\?\.\[0\]\s*\?\?\s*null\s*$", dex_repl, 'dexId fallback'); log.append(f'dexId fallback: {status}')
    if "crossLanguageEnglishName && crossLanguageDexIds.length === 1" in text: log.append('trusted cross-language Pokemon fallback: bereits vorhanden')
    else:
        text, status = regex_sub_once(text, r"\} else if \(detail\?\.category === 'Pokemon' && dexId\) \{", "} else if (\n        dexId &&\n        (detail?.category === 'Pokemon' ||\n          (crossLanguageEnglishName && crossLanguageDexIds.length === 1))\n      ) {", 'trusted cross-language Pokemon fallback'); log.append(f'trusted cross-language Pokemon fallback: {status}')
    if 'When the search itself contained a supported English card-name' in text: log.append('English card-name modifiers: bereits vorhanden')
    else:
        def mod_repl(m):
            i=m.group(1)
            return m.group(0)+f"\n\n{i}// When the search itself contained a supported English card-name\n{i}// modifier (Shining, Radiant, ...), preserve that full English card\n{i}// name while pokemonNameEn remains the bare species.\n{i}if (\n{i}  crossLanguageNameMode === 'card-name' &&\n{i}  crossLanguageDexIds.length === 1 &&\n{i}  knownEnglishCardNameModifier(name)\n{i}) {{\n{i}  englishName = appendSuffix(name, detail?.suffix)\n{i}}}"
        text, status = regex_sub_once(text, r"^(\s*)englishName = resolved\.englishName\s*$", mod_repl, 'English card-name modifiers'); log.append(f'English card-name modifiers: {status}')
    if 'resolvedDexId: dexId' in text: log.append('catalog diagnostics: bereits vorhanden')
    else:
        def diag_repl(m):
            i=m.group(1)
            return m.group(0)+f"\n{i}resolvedDexId: dexId,\n{i}dexIdSource: detailDexId ? 'tcgdex' : dexId ? 'cross-language' : null,"
        text, status = regex_sub_once(text, r"^(\s*)dexId: detail\.dexId \?\? \[\],\s*$", diag_repl, 'catalog diagnostics'); log.append(f'catalog diagnostics: {status}')
    return text, log

def find_and_fix_purchase_manager(app_root: Path):
    old_re = re.compile(r"itemName:\s*candidate\.englishName\s*\|\|\s*candidate\.name\s*\|\|\s*current\.itemName,")
    new_re = re.compile(r"itemName:\s*candidate\.name\s*\|\|\s*current\.itemName,")
    old_matches=[]; new_matches=[]
    for pattern in ('*.tsx','*.ts'):
        for path in app_root.rglob(pattern):
            if '.git' in path.parts or 'node_modules' in path.parts: continue
            try: text=path.read_text(encoding='utf-8')
            except Exception: continue
            if old_re.search(text): old_matches.append((path,text))
            elif new_re.search(text): new_matches.append((path,text))
    if len(old_matches)==1:
        path,text=old_matches[0]; fixed,count=old_re.subn('itemName: candidate.name || current.itemName,',text,count=1)
        return path,fixed,'geaendert'
    if len(old_matches)>1: raise RuntimeError('Mehrere Dateien enthalten die alte Treffer-uebernehmen-Logik.')
    if new_matches: return new_matches[0][0],None,'bereits vorhanden'
    raise RuntimeError('Purchase-Item-Datei fuer Treffer uebernehmen konnte nicht gefunden werden.')

def choose_migration_path(migration_dir: Path) -> Path:
    for path in migration_dir.glob('*_catalog_english_name_integrity.sql'):
        try:
            if path.read_text(encoding='utf-8') == MIGRATION: return path
        except Exception: pass
    numbers=[]
    for path in migration_dir.glob('*.sql'):
        m=re.match(r'^(\d{4})_',path.name)
        if m: numbers.append(int(m.group(1)))
    return migration_dir / f'{max(numbers, default=17)+1:04d}_catalog_english_name_integrity.sql'

def main() -> int:
    parser=argparse.ArgumentParser(); parser.add_argument('repo',type=Path); args=parser.parse_args()
    root=args.repo.expanduser().resolve()
    if not root.exists(): raise RuntimeError(f'Repository-Pfad existiert nicht: {root}')
    app_root=resolve_app_root(root); server=app_root/'lib'/'card-catalog-server.ts'
    original=server.read_text(encoding='utf-8'); server_new,log=apply_server_changes(original)
    manager_path,manager_new,manager_status=find_and_fix_purchase_manager(app_root)
    migration_dir=app_root/'supabase'/'migrations'
    if not migration_dir.exists(): raise RuntimeError(f'Migrationsverzeichnis nicht gefunden: {migration_dir}')
    migration_path=choose_migration_path(migration_dir); migration_existing=migration_path.exists()
    if migration_existing and migration_path.read_text(encoding='utf-8') != MIGRATION: raise RuntimeError(f'Migration existiert bereits mit anderem Inhalt: {migration_path}')
    changed=False
    if server_new != original: backup(server); server.write_text(server_new,encoding='utf-8'); changed=True
    if manager_path and manager_new is not None: backup(manager_path); manager_path.write_text(manager_new,encoding='utf-8'); changed=True
    if not migration_existing: migration_path.write_text(MIGRATION,encoding='utf-8'); changed=True
    print('CardCargo-Katalogfix v2 erfolgreich geprueft/angewendet:')
    print(f'  App-Root:  {app_root}')
    print(f'  Server:    {server}')
    for entry in log: print(f'    - {entry}')
    print(f'  UI:        {manager_path} ({manager_status})')
    print(f'  Migration: {migration_path} ({"bereits vorhanden" if migration_existing else "neu"})')
    print(f'  Ergebnis:  {"Dateien geaendert" if changed else "Patch war bereits vollstaendig vorhanden"}')
    return 0

if __name__=='__main__':
    try: raise SystemExit(main())
    except Exception as exc:
        print(f'FEHLER: {exc}',file=sys.stderr); raise SystemExit(1)
