#!/usr/bin/env bash
set -euo pipefail

APP_ROOT="${1:-}"
if [[ -z "$APP_ROOT" ]]; then
  echo "FEHLER: App-Root fehlt."
  echo "Aufruf: bash apply.sh /pfad/zu/poketracker-pwa"
  exit 2
fi

TARGET="$APP_ROOT/lib/card-catalog-server.ts"
if [[ ! -f "$TARGET" ]]; then
  echo "FEHLER: Datei nicht gefunden: $TARGET"
  exit 2
fi

OLD='          detail.suffix,'
NEW='          detail?.suffix ?? extractPokemonCardSuffix(detail?.name ?? brief.name),'

if grep -Fq "$NEW" "$TARGET"; then
  echo "OK: Null-safe suffix fix ist bereits vorhanden. Keine Aenderung noetig."
  exit 0
fi

COUNT=$(grep -Fc "$OLD" "$TARGET" || true)
if [[ "$COUNT" -ne 1 ]]; then
  echo "FEHLER: Erwartet genau 1 Treffer fuer die problematische Zeile, gefunden: $COUNT."
  echo "Keine Datei wurde geschrieben."
  echo "Bitte sende die Ausgabe von:"
  echo "  grep -n -C 8 'resolveEnglishPokemonNames' \"$TARGET\""
  exit 1
fi

BACKUP="$TARGET.bak-null-detail-fix-v33"
cp "$TARGET" "$BACKUP"

python3 - "$TARGET" "$OLD" "$NEW" <<'PY'
from pathlib import Path
import sys
path = Path(sys.argv[1])
old = sys.argv[2]
new = sys.argv[3]
text = path.read_text(encoding='utf-8')
count = text.count(old)
if count != 1:
    raise SystemExit(f'FEHLER: Vor dem Schreiben wurden {count} Treffer gefunden; erwartet 1.')
path.write_text(text.replace(old, new, 1), encoding='utf-8')
PY

echo "OK: TypeScript-Nullfehler in card-catalog-server.ts behoben."
echo "Backup: $BACKUP"
echo
echo "Geaendert:"
grep -n -C 2 -F "$NEW" "$TARGET" || true
