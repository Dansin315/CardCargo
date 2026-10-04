#!/usr/bin/env bash
set -euo pipefail

PATCH_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET="${1:-$(pwd)}"

if [[ ! -f "$TARGET/package.json" || ! -d "$TARGET/app" ]]; then
  echo "Error: target is not the CardCargo Next.js project: $TARGET" >&2
  exit 1
fi

if [[ ! -f "$TARGET/supabase/migrations/0008_shipment_images.sql" ]]; then
  echo "Error: Inventory v1 expects the CardCargo OLAEET/shipment image modules through migration 0008." >&2
  exit 1
fi

if [[ ! -f "$TARGET/app/(app)/purchases/[id]/edit/page.tsx" ]]; then
  echo "Error: purchase edit page is missing." >&2
  exit 1
fi

BACKUP="/tmp/cardcargo-inventory-v1-v14-backup-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP"
for file in \
  "components/app-shell.tsx" \
  "app/(app)/purchases/[id]/page.tsx" \
  "app/(app)/purchases/[id]/edit/page.tsx" \
  "app/globals.css" \
  ".env.example"; do
  if [[ -f "$TARGET/$file" ]]; then
    mkdir -p "$BACKUP/$(dirname "$file")"
    cp -a "$TARGET/$file" "$BACKUP/$file"
  fi
done

cp -a "$PATCH_DIR/files/." "$TARGET/"

python3 - "$TARGET" <<'PY'
from pathlib import Path
import sys

target = Path(sys.argv[1])

# Enable inventory navigation.
app_shell = target / 'components/app-shell.tsx'
text = app_shell.read_text()
if 'href="/inventory"' not in text:
    old = '''          <span className="nav-disabled" title="Folgt in einem nächsten Ausbauschritt">
            Inventar
          </span>'''
    new = '''          <Link href="/inventory">Inventar</Link>'''
    if old not in text:
        raise SystemExit('Could not enable inventory navigation: expected placeholder not found.')
    text = text.replace(old, new)
    app_shell.write_text(text)

# Purchase detail: add optional Purchase Items summary without changing the import/create flow.
purchase_page = target / 'app/(app)/purchases/[id]/page.tsx'
text = purchase_page.read_text()
import_line = "import { PurchaseItemsSummary } from '@/components/purchase-items-summary'\n"
if import_line not in text:
    anchor = "import { PurchaseWarehousePackages } from '@/components/purchase-warehouse-packages'\n"
    if anchor in text:
        text = text.replace(anchor, anchor + import_line)
    else:
        anchor = "import { DeletePurchaseButton } from '@/components/delete-purchase-button'\n"
        if anchor not in text:
            raise SystemExit('Could not patch purchase detail imports.')
        text = text.replace(anchor, anchor + import_line)

component = '      <PurchaseItemsSummary purchaseId={purchase.id} />\n\n'
if component not in text:
    # Prefer placing the summary after the image gallery and before cost allocation/detail grid.
    anchor = '      {shipmentCostAllocation ? ('
    if anchor in text:
        text = text.replace(anchor, component + anchor, 1)
    else:
        anchor = '      <div className="detail-grid">'
        if anchor not in text:
            raise SystemExit('Could not place PurchaseItemsSummary in purchase detail page.')
        text = text.replace(anchor, component + anchor, 1)
purchase_page.write_text(text)

# Purchase edit: Purchase Items are a separate optional section below the existing purchase form.
edit_page = target / 'app/(app)/purchases/[id]/edit/page.tsx'
text = edit_page.read_text()
import_line = "import { PurchaseItemsManager } from '@/components/purchase-items-manager'\n"
if import_line not in text:
    anchor = "import { PurchaseEditForm } from '@/components/purchase-edit-form'\n"
    if anchor not in text:
        raise SystemExit('Could not patch purchase edit imports.')
    text = text.replace(anchor, anchor + import_line)

manager = '''      <PurchaseItemsManager
        purchaseId={purchase.id}
        purchaseCurrency={purchase.price_currency}
        purchaseStatus={purchase.status}
      />'''
if manager not in text:
    anchor = '      <PurchaseEditForm purchase={purchase} userId={user.id} images={images} />'
    if anchor not in text:
        raise SystemExit('Could not place PurchaseItemsManager in purchase edit page.')
    text = text.replace(anchor, anchor + '\n\n' + manager, 1)
edit_page.write_text(text)

# Optional secondary catalog provider key. TCGdex itself needs no key.
env_file = target / '.env.example'
if env_file.exists():
    env = env_file.read_text()
    marker = '# Inventory v1: optional Pokémon TCG API fallback'
    if marker not in env:
        if env and not env.endswith('\n'):
            env += '\n'
        env += f'''\n{marker}\n# TCGdex is used first and requires no key. Leave this blank to use the fallback unauthenticated.\nPOKEMON_TCG_API_KEY=\n'''
        env_file.write_text(env)
PY

if ! grep -q "BEGIN CardCargo Inventory v1 v14" "$TARGET/app/globals.css"; then
  printf '\n\n' >> "$TARGET/app/globals.css"
  cat "$PATCH_DIR/inventory-v1-styles.css" >> "$TARGET/app/globals.css"
fi

rm -rf "$TARGET/.next"
rm -f "$TARGET/tsconfig.tsbuildinfo"

echo "CardCargo Inventory v1 v14 applied."
echo "Backup of modified files: $BACKUP"
echo "Next: run supabase/migrations/0011_inventory_v1.sql in Supabase."
echo "Then run: npm run typecheck && npm run lint && npm run test && npm run build"
