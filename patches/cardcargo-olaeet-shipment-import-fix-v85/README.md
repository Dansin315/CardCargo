# CardCargo – OLAEET Shipment Import Fix v85

v85 repairs the TypeScript parse error introduced by v84 in:

```text
app/(app)/shipments/new/page.tsx
```

## Cause

v84 searched for the last line beginning with `import` and inserted the new
OLAEET importer after that line. If that line was the first line of a
multiline import, the result could become:

```tsx
import {
import { OlaeetShipmentExtractionImporter } from '@/components/olaeet-shipment-extraction-importer'
  ...
} from '...'
```

TypeScript then reports:

```text
Parsing error: Identifier expected
```

## Fix

v85:

1. removes any misplaced copy of the OLAEET importer import;
2. restores the interrupted multiline import;
3. inserts the OLAEET importer at a safe top-level module position;
4. preserves a leading `'use client'` directive if one exists;
5. leaves the shipment extraction/import logic unchanged.

## Apply

```bash
cd "$HOME/CardCargo/poketracker-pwa"

bash \
  "$HOME/CardCargo/patches/cardcargo-olaeet-shipment-import-fix-v85/apply.sh" \
  "$HOME/CardCargo/poketracker-pwa"
```

Then:

```bash
rm -rf .next
npm run typecheck
npm run lint
npm run build
```

No Supabase migration is required.
