# CardCargo v96 - OLAEET shipment UX, package images and archive downloads

This patch is based on the rendered shipment detail view supplied by the user.
It fixes the duplicated/empty legacy shipment sections and makes the imported
OLAEET shipment data the canonical visual source on the detail page.

## Shipment header summary

The old top-right block showed:

- Gesamtgewicht: -
- Sendungskosten: 0 KRW

v96 leaves the legacy fields in source for compatibility, hides only those
legacy values, and inserts an OLAEET-aware summary that reads the persisted
extraction:

- Internationale Sendungsnummer: SHP-...
- Sendungskosten: total_payment from OLAEET

The existing Edit/Delete actions stay in the same block. The block is restyled
to the v93 AnyDB-inspired spacing, border and alignment system.

## Duplicate shipment sections removed

The standard detail page already gets a complete OLAEET panel from v94/v95.
v96 removes the stale lower sections:

- Kostenübersicht
- Enthaltene OLAEET-Pakete
- Bilder aus enthaltenen Paketen und Einkäufen

The old `Pakete: 0` row in `Sendungsangaben` is removed as well. Package data
and images now live in the canonical OLAEET panel.

## Package linking and package images

The detail API resolves packages in this order:

1. `warehouse_packages.shipment_id`
2. `olaeet_shipment_package_links`
3. OLAEET Storage Number (`external_package_id` / `STR-...`)
4. domestic tracking number

This means already stored packages can still be found even when an older
legacy relation was not populated.

For every resolved warehouse package v96 looks for:

- archived package images;
- image URLs/paths stored directly on the package record;
- Bunjang purchase images belonging to purchases linked with that package.

The apply script scans the current local CardCargo source and generates the
actual image table/link table/storage bucket candidates used by the project.
Default fallbacks are included as well.

## Cardmarket-style hover preview

Each OLAEET package row gets a small camera icon. Hovering or focusing the icon
shows the first archived image in a floating preview, similar to the reference
screenshot supplied by the user.

The STR number itself links directly to the CardCargo OLAEET package detail
page when a stored package record is available.

## Package image gallery

Below the OLAEET package list v96 shows package images grouped by Storage
Number. This gallery includes archived OLAEET package images and linked
Bunjang purchase images, while avoiding the old empty legacy image section.

## Archived image downloads

Download controls are intentionally enabled only on:

- Bunjang purchase detail pages (`/purchases/[id]` when the page is Bunjang);
- OLAEET warehouse package detail pages (`/warehouse-packages/[id]`).

Each archived image gets a download button, and the archive panel gets an
`Alle Bilder herunterladen` button.

No download controls are added to shipment detail pages or inventory views.

## Import persistence compatibility

The OLAEET shipment importer is extended with additional legacy cost aliases,
including international shipping and service-fee columns. This improves
compatibility with the older CardCargo shipment schema while the visible
shipment header reads `total_payment` directly from the canonical extraction.

## Apply

```bash
cd "$HOME/CardCargo/poketracker-pwa"

bash \
  "$HOME/CardCargo/patches/cardcargo-olaeet-shipment-ux-images-v96/apply.sh" \
  "$HOME/CardCargo/poketracker-pwa"
```

Then:

```bash
rm -rf .next
npm run typecheck
npm run lint
npm run build
```

No new Supabase migration is required beyond the v94 persistence migration.
If v94 SQL has not been applied yet, it is still required.
