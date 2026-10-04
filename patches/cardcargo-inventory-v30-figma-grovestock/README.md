# CardCargo Inventory v30 — Figma GroveStock redesign

This patch adapts the supplied Figma Make design `Design inventory system layout`
to CardCargo's real inventory model.

Design adopted from the Figma file:
- oak brown + dark cactus green palette;
- cream background and rounded cards;
- four KPI cards;
- rounded left filter/sort panel;
- large scrollable inventory table;
- compact status pills;
- alternating table rows and selection state;
- responsive stacking on smaller screens.

Figma functionality adapted to CardCargo:
- general search across card name, English Pokémon name, set, set code, number,
  language, grading, storage and source;
- Language filter;
- Expansion -> Set / Erweiterung;
- Rarity -> TCGdex rarity from the saved purchase-item catalog snapshot;
- Min. Condition -> Mindestzustand with real quality threshold behavior;
- Status filter using CardCargo inventory statuses;
- comment search -> inventory `notes`;
- Cost Range -> `allocated_total_cost`;
- Sort By -> name, set, costs and creation date;
- multi-select;
- select-all for visible rows;
- CSV export for filtered rows or selected rows;
- bulk delete with confirmation and owner/RLS protection.

Useful CardCargo additions:
- card reference thumbnail where a Purchase Item has a catalog image;
- source column linking back to the Bunjang purchase or OLAEET package;
- optional Grading and Lagerort filters under `Weitere Filter`;
- currency-safe footer: totals are grouped by currency instead of summing KRW/EUR;
- existing `Noch nicht übernommen` workflow remains available below the table;
- OLAEET bonus Purchase Items from v26 are supported.

Files:
- `app/(app)/inventory/page.tsx`
- `components/inventory-workspace.tsx`
- `app/api/inventory/units/route.ts`
- scoped CSS appended to `app/globals.css`

No database migration is required.
The patch assumes the existing inventory migrations through the current v26/v29 state.
