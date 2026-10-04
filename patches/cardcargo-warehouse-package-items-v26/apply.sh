#!/usr/bin/env bash
set -euo pipefail

PATCH_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET="${1:-$(pwd)}"

if [[ ! -f "$TARGET/package.json" || ! -d "$TARGET/app" ]]; then
  echo "Error: target is not the CardCargo Next.js project: $TARGET" >&2
  exit 1
fi

if [[ ! -f "$TARGET/supabase/migrations/0012_inventory_setcode_english_names.sql" ]]; then
  echo "Error: v26 expects Inventory v16 / migration 0012." >&2
  exit 1
fi

PACKAGE_PAGE="$TARGET/app/(app)/warehouse-packages/[id]/page.tsx"
if [[ ! -f "$PACKAGE_PAGE" ]]; then
  echo "Error: OLAEET package detail page is missing." >&2
  exit 1
fi

BACKUP="/tmp/cardcargo-warehouse-package-items-v26-backup-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP"

for file in \
  "components/purchase-items-manager.tsx" \
  "components/purchase-items-summary.tsx" \
  "lib/purchase-items.ts" \
  "app/api/purchases/[id]/items/route.ts" \
  "app/(app)/warehouse-packages/[id]/page.tsx"; do
  if [[ -f "$TARGET/$file" ]]; then
    mkdir -p "$BACKUP/$(dirname "$file")"
    cp -a "$TARGET/$file" "$BACKUP/$file"
  fi
done

cp -a "$PATCH_DIR/files/." "$TARGET/"

python3 - "$PACKAGE_PAGE" <<'PY'
from pathlib import Path
import sys

page = Path(sys.argv[1])
text = page.read_text()

import_line = "import { PurchaseItemsManager } from '@/components/purchase-items-manager'\n"
if import_line not in text:
    anchors = [
        "import { DeleteWarehousePackageButton } from '@/components/delete-warehouse-package-button'\n",
        "import { purchaseImageCategoryLabels } from '@/lib/purchase-image-categories'\n",
    ]
    for anchor in anchors:
        if anchor in text:
            text = text.replace(anchor, anchor + import_line, 1)
            break
    else:
        raise SystemExit('Could not add PurchaseItemsManager import to warehouse package page.')

manager = '''      <PurchaseItemsManager
        warehousePackageId={id}
        purchaseCurrency="KRW"
        purchaseStatus={warehousePackage.status}
      />

'''

if manager not in text:
    anchors = [
        '      {warehousePackage.notes ? (',
        '      <section className="panel shipment-link-panel">',
    ]
    for anchor in anchors:
        if anchor in text:
            text = text.replace(anchor, manager + anchor, 1)
            break
    else:
        raise SystemExit('Could not place PurchaseItemsManager on warehouse package detail page.')

page.write_text(text)
PY

rm -rf "$TARGET/.next"
rm -f "$TARGET/tsconfig.tsbuildinfo"

echo "CardCargo v26 OLAEET-linked Purchase Items applied."
echo "Backup of replaced/modified files: $BACKUP"
echo "Next: run supabase/migrations/0015_warehouse_package_purchase_items.sql in Supabase."
echo "Then run: npx next typegen && npm run typecheck && npm run lint && npm run test && npm run build"
