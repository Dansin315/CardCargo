#!/usr/bin/env bash
set -euo pipefail

PATCH_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET="${1:-$(pwd)}"

if [[ ! -f "$TARGET/package.json" || ! -d "$TARGET/app" ]]; then
  echo "Error: target is not the poketracker-pwa project: $TARGET" >&2
  exit 1
fi

BACKUP="/tmp/cardcargo-olaeet-v6-backup-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP"

for path in "components/app-shell.tsx" "app/(app)/purchases/[id]/page.tsx" "app/globals.css"; do
  if [[ -f "$TARGET/$path" ]]; then
    mkdir -p "$BACKUP/$(dirname "$path")"
    cp "$TARGET/$path" "$BACKUP/$path"
  fi
done

cp -a "$PATCH_DIR/files/." "$TARGET/"

python3 - "$TARGET" <<'PY'
from pathlib import Path
import sys

target = Path(sys.argv[1])

app_shell = target / 'components/app-shell.tsx'
text = app_shell.read_text()
old = '''          <span className="nav-disabled" title="Folgt in einem nächsten Ausbauschritt">
            OLAEET-Pakete
          </span>'''
new = '''          <Link href="/warehouse-packages">OLAEET-Pakete</Link>'''
if old in text:
    app_shell.write_text(text.replace(old, new))
elif 'href="/warehouse-packages"' not in text:
    raise SystemExit('Could not update components/app-shell.tsx: expected OLAEET placeholder not found.')

purchase_page = target / 'app/(app)/purchases/[id]/page.tsx'
text = purchase_page.read_text()
import_line = "import { PurchaseWarehousePackages } from '@/components/purchase-warehouse-packages'\n"
if import_line not in text:
    anchor = "import { DeletePurchaseButton } from '@/components/delete-purchase-button'\n"
    if anchor not in text:
        raise SystemExit('Could not update purchase detail page: import anchor not found.')
    text = text.replace(anchor, anchor + import_line)

old_section = '''        <section className="panel next-step-card">
          <span className="eyebrow">Nächster Prozessschritt</span>
          <h2>Mit OLAEET-Paket verknüpfen</h2>
          <p>
            Das Datenmodell enthält bereits Lagerpakete, internationale Sendungen und Inventareinheiten. Die entsprechende Oberfläche folgt nach dem Einkaufsmodul.
          </p>
          <button className="button button-secondary" type="button" disabled>
            OLAEET-Zuordnung folgt
          </button>
        </section>'''
new_section = '''        <PurchaseWarehousePackages purchaseId={purchase.id} />'''
if old_section in text:
    text = text.replace(old_section, new_section)
elif new_section not in text:
    raise SystemExit('Could not update purchase detail page: OLAEET placeholder section not found.')
purchase_page.write_text(text)

css_file = target / 'app/globals.css'
css = css_file.read_text()
marker = '/* BEGIN CardCargo OLAEET packages v6 */'
if marker not in css:
    addition = (Path(__file__).resolve().parent if False else None)
PY

if ! grep -q "BEGIN CardCargo OLAEET packages v6" "$TARGET/app/globals.css"; then
  printf '\n\n' >> "$TARGET/app/globals.css"
  cat "$PATCH_DIR/olaeet-styles.css" >> "$TARGET/app/globals.css"
fi

rm -rf "$TARGET/.next"
rm -f "$TARGET/tsconfig.tsbuildinfo"

echo "CardCargo OLAEET package module v6 applied."
echo "Backup of modified files: $BACKUP"
echo "Next: run supabase/migrations/0002_olaeet_packages.sql in the Supabase SQL Editor."
echo "Then run: npm run typecheck && npm run lint && npm run test && npm run build"
