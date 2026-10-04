# CardCargo v101 – Inventory Hydration Structure Fix

Der v93/v99-Patcher suchte global nach dem ersten `return (` in
`components/inventory-workspace.tsx`. In der aktuellen Datei ist dieses erste
Return der `SearchIcon`, dessen Root ein `<svg>` ist.

Dadurch wurden diese Komponenten versehentlich in das SVG eingefügt:

```tsx
<ConnectedInventoryModel />
<InventoryShipmentFilter />
```

Block-HTML wie `<section>` und `<div>` innerhalb dieses SVG führt beim Browser-
Parsing zu einer anderen DOM-Struktur als React serverseitig erwartet. Das ist
der relevante CardCargo-Anteil der Hydration-Meldung.

v101:

- entfernt alle alten Platzierungen der beiden Inventory-Komponenten;
- entfernt den alten `data-cc-anydb="inventory"` Marker;
- findet gezielt die Funktion `InventoryWorkspace`;
- sucht nur deren **Top-Level `return`**;
- setzt dort genau einen Inventory-Root;
- fügt `ConnectedInventoryModel` und `InventoryShipmentFilter` dort ein;
- bricht ab, falls danach eine dieser Komponenten noch innerhalb eines `<svg>`
  steht.

Die ebenfalls in der Hydration-Diff sichtbaren Attribute
`data-new-gr-c-s-check-loaded` und `data-gr-ext-installed` stammen von der
Grammarly-Browsererweiterung. Sie sind von diesem CardCargo-Strukturfehler
getrennt. Falls nach v101 ausschließlich diese Attribute übrig bleiben, sollte
Grammarly für `localhost` deaktiviert werden, statt weitere App-Markup-Fehler zu
unterdrücken.

## Anwenden

```bash
cd "$HOME/CardCargo/poketracker-pwa"

bash \
  "$HOME/CardCargo/patches/cardcargo-inventory-hydration-structure-fix-v101/apply.sh" \
  "$HOME/CardCargo/poketracker-pwa"
```

Danach:

```bash
rm -rf .next
npm run typecheck
npm run lint
npm run build
```

Keine Supabase-Migration erforderlich.
