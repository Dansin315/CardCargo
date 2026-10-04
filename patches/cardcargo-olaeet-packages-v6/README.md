# CardCargo OLAEET package module v6

This patch targets the current public GitHub state of:

`Dansin315/CardCargo/poketracker-pwa`

## Included

- OLAEET package list with status filters
- create, detail, edit, and delete pages
- package-to-purchase assignments
- package data: OLAEET ID, Korean tracking, carrier, sender, status, arrival, inspection, storage dates, weight, dimensions, notes
- purchase detail integration showing linked OLAEET packages
- authenticated same-origin API routes
- Zod validation
- migration `0002_olaeet_packages.sql`
- tests for the package input schema

Deleting a package removes only its assignments. The linked purchases remain. Deletion is blocked when the package is already assigned to an international shipment.

## Install

Keep this patch outside `poketracker-pwa`, for example:

```text
/home/dangu/CardCargo/
├── poketracker-pwa/
└── patches/cardcargo-olaeet-packages-v6/
```

Apply:

```bash
cd "$HOME/CardCargo/poketracker-pwa"

bash "$HOME/CardCargo/patches/cardcargo-olaeet-packages-v6/apply.sh" \
  "$HOME/CardCargo/poketracker-pwa"
```

The script copies the new source files, updates the navigation and purchase detail page, appends scoped CSS, and creates a backup under `/tmp`.

## Required Supabase step

Open Supabase → SQL Editor and run the complete contents of:

```text
supabase/migrations/0002_olaeet_packages.sql
```

Without this migration the new pages cannot read the added fields and the assignment RPC will not exist.

## Validate

```bash
nvm use 22
rm -rf .next
rm -f tsconfig.tsbuildinfo
npm run typecheck
npm run lint
npm run test
npm run build
npm run dev
```

Open:

```text
http://localhost:3000/warehouse-packages
```

## Commit

```bash
git add poketracker-pwa
# If the Git repository root is poketracker-pwa itself, use: git add .
git commit -m "Add OLAEET package management"
git push
```
