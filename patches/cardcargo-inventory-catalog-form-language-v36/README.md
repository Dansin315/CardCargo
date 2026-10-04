# CardCargo Inventory Catalog Form/Language Fix v36

Behebt den Hydration-/Nested-Form-Fehler im manuellen Inventar-Kartenkatalog.

Änderungen:
- Kein verschachteltes `<form>` mehr.
- Kartenkatalog ist beim Öffnen von `+ Einzelkarte hinzufügen` sofort sichtbar.
- Enter in Name/Nummer/Setcode/Sprache startet `Katalog durchsuchen` und speichert nicht versehentlich das äußere Inventarformular.
- Katalogsprache ist auswählbar und aktualisiert zugleich die Sprache der neuen Inventarkarte.
- Sprachen: Koreanisch, Japanisch, Englisch, Deutsch, Französisch, Spanisch, Italienisch, Portugiesisch, Traditional/Simplified Chinese, Indonesisch, Thai, Niederländisch, Polnisch, Russisch.

## Anwenden

```bash
cd "$HOME/CardCargo/poketracker-pwa"

bash \
  "$HOME/CardCargo/patches/cardcargo-inventory-catalog-form-language-v36/apply.sh" \
  "$HOME/CardCargo/poketracker-pwa"
```

Danach:

```bash
npm run typecheck
npm run lint
npm run build
```

Keine Supabase-Migration erforderlich.
