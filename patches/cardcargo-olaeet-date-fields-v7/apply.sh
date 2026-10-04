#!/usr/bin/env bash
set -euo pipefail

TARGET="${1:-}"
if [[ -z "$TARGET" ]]; then
  echo "Usage: $0 /absolute/path/to/poketracker-pwa" >&2
  exit 1
fi

TARGET="$(cd "$TARGET" && pwd)"
SOURCE="$(cd "$(dirname "$0")/files" && pwd)"

required=(
  "components/warehouse-package-form.tsx"
  "lib/warehouse-packages.ts"
  "lib/warehouse-package-schema.ts"
  "tests/warehouse-package-schema.test.ts"
)

for file in "${required[@]}"; do
  if [[ ! -f "$TARGET/$file" ]]; then
    echo "Expected target file is missing: $TARGET/$file" >&2
    echo "Apply OLAEET package module v6 first." >&2
    exit 1
  fi
done

backup="$(mktemp -d /tmp/cardcargo-olaeet-date-v7-backup-XXXXXX)"
for file in "${required[@]}"; do
  mkdir -p "$backup/$(dirname "$file")"
  cp -a "$TARGET/$file" "$backup/$file"
done

mkdir -p "$TARGET/components" "$TARGET/lib" "$TARGET/tests" "$TARGET/supabase/migrations"
cp -a "$SOURCE/components/warehouse-package-form.tsx" "$TARGET/components/warehouse-package-form.tsx"
cp -a "$SOURCE/lib/warehouse-packages.ts" "$TARGET/lib/warehouse-packages.ts"
cp -a "$SOURCE/lib/warehouse-package-schema.ts" "$TARGET/lib/warehouse-package-schema.ts"
cp -a "$SOURCE/tests/warehouse-package-schema.test.ts" "$TARGET/tests/warehouse-package-schema.test.ts"
cp -a "$SOURCE/supabase/migrations/0003_olaeet_date_only_deadline.sql" \
  "$TARGET/supabase/migrations/0003_olaeet_date_only_deadline.sql"

rm -rf "$TARGET/.next"
rm -f "$TARGET/tsconfig.tsbuildinfo"

echo "CardCargo OLAEET date-only fields v7 applied."
echo "Backup of replaced files: $backup"
echo "Next: run supabase/migrations/0003_olaeet_date_only_deadline.sql in Supabase."
