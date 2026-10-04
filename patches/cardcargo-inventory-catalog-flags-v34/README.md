# CardCargo inventory catalog + SVG flags v34

Änderungen:
- Kartenkatalog im Dialog „Einzelkarte zum Inventar hinzufügen“.
- Nutzt serverseitig dieselbe `searchCardCatalog()`-Logik wie CardCargo.
- Beim Übernehmen werden Name, englischer Pokémon-Name/Species, Set, Setcode, Kartennummer und Seltenheit übernommen.
- Die physische Sprache wird nicht durch die Katalogsprache überschrieben.
- Inventartabelle zeigt lokale SVG-Landesflaggen statt KR/JP/EN/etc.; unbekannte Werte bleiben als Text sichtbar.
- Keine externen Flaggenbilder und keine neue npm-Abhängigkeit.

Anwendung:

```bash
cd "$HOME/CardCargo/poketracker-pwa"

bash \
  "$HOME/CardCargo/patches/cardcargo-inventory-catalog-flags-v34/apply.sh" \
  "$HOME/CardCargo/poketracker-pwa"
```

Danach:

```bash
npm run typecheck
npm run lint
npm run build
```

Keine Supabase-Migration nötig.
