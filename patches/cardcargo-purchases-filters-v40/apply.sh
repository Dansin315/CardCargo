#!/usr/bin/env bash
set -euo pipefail

APP_ROOT="${1:-$(pwd)}"
PATCH_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PAGE="$APP_ROOT/app/(app)/purchases/page.tsx"
WORKSPACE="$APP_ROOT/components/purchase-list-workspace.tsx"
CSS="$APP_ROOT/app/globals.css"

for file in "$PAGE" "$WORKSPACE" "$CSS"; do
  if [ ! -f "$file" ]; then
    echo "FEHLER: Datei nicht gefunden: $file" >&2
    exit 1
  fi
done

if ! grep -q "purchaseSortKeys" "$PAGE"; then
  echo "FEHLER: v39-Sortierstand wurde in purchases/page.tsx nicht erkannt." >&2
  echo "Bitte zuerst v38 und v39 anwenden bzw. den aktuellen Stand prüfen." >&2
  exit 1
fi

if ! grep -q "purchaseSortOptions" "$WORKSPACE"; then
  echo "FEHLER: v39-Sortierstand wurde in purchase-list-workspace.tsx nicht erkannt." >&2
  exit 1
fi

cp -n "$PAGE" "$PAGE.bak-purchase-filters-v40" || true
cp -n "$WORKSPACE" "$WORKSPACE.bak-purchase-filters-v40" || true
cp -n "$CSS" "$CSS.bak-purchase-filters-v40" || true

cp "$PATCH_DIR/files/app/(app)/purchases/page.tsx" "$PAGE"
cp "$PATCH_DIR/files/components/purchase-list-workspace.tsx" "$WORKSPACE"

CSS_MARKER='/* BEGIN CardCargo purchase filters v40 */'
if ! grep -Fq "$CSS_MARKER" "$CSS"; then
  cat >> "$CSS" <<'CSS'

/* BEGIN CardCargo purchase filters v40 */
.purchase-filter-bar {
  display: grid;
  grid-template-columns: minmax(180px, 1fr) minmax(160px, .8fr) minmax(160px, .8fr) auto;
  gap: 12px;
  align-items: end;
  padding: 14px;
  border: 1px solid var(--border);
  border-radius: 16px;
  background: var(--surface-soft);
}
.purchase-filter-control {
  display: grid;
  gap: 5px;
}
.purchase-filter-control > span {
  color: var(--muted);
  font-size: .72rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: .06em;
}
.purchase-filter-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}
.purchase-filter-empty {
  padding-block: 30px;
}
@media (max-width: 900px) {
  .purchase-filter-bar {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .purchase-filter-actions {
    grid-column: 1 / -1;
  }
}
@media (max-width: 560px) {
  .purchase-filter-bar {
    grid-template-columns: 1fr;
  }
  .purchase-filter-actions {
    grid-column: auto;
  }
  .purchase-filter-actions .button {
    flex: 1 1 auto;
  }
}
/* END CardCargo purchase filters v40 */
CSS
fi

echo "CardCargo purchase filters v40 erfolgreich angewendet."
echo "Neu:"
echo "  - Statusfilter"
echo "  - Kaufdatum von/bis"
echo "  - Filter bleiben bei Sortierung und Pagination erhalten"
echo "  - Zurücksetzen-Funktion"
echo "  - Trefferzahl zeigt gefiltert/gesamt"
echo
echo "Backups:"
echo "  $PAGE.bak-purchase-filters-v40"
echo "  $WORKSPACE.bak-purchase-filters-v40"
echo "  $CSS.bak-purchase-filters-v40"
echo
echo "Naechste Schritte:"
echo "  npm run typecheck"
echo "  npm run lint"
echo "  npm run build"
