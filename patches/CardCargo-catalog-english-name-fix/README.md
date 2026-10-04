# CardCargo – Fix für falsche englische Pokémon-Namen

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
