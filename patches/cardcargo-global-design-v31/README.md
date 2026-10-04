# CardCargo v31 — Figma design system for the entire app

This is not an embedded copy of the Figma inventory screen.
The supplied Figma Make file is used as the visual design system for CardCargo globally.

## Shared design tokens taken from the Figma source

- Background: `#f5ede0`
- Foreground: `#2a1a0a`
- Card: `#fdf6ec`
- Oak Brown primary: `#7c4f1e`
- Dark Cactus Green secondary: `#2e4f1e`
- Muted beige: `#e8d9c4`
- Muted foreground: `#6b4e30`
- Border: `#d4bb99`
- Green accent: `#3d6b22`
- Success: `#d4edc4 / #2e4f1e`
- Warning: `#fde9c0 / #7c4f1e`
- Danger: `#f5d6d6 / #7a2020`

## App-wide changes

- Replaces the old dark/purple sidebar shell with a cream Figma-style sticky top navigation.
- Active modules use a dark cactus green navigation pill.
- Buttons, panels, inputs, alerts, badges, lists, tables, image galleries and forms are rethemed globally.
- Dashboard stat cards use the same card language as the Figma inventory design.
- Purchases, Bunjang import/edit/detail screens inherit the global theme.
- OLAEET package list/detail/edit/create screens inherit the global theme.
- International shipment list/detail/edit/create screens inherit the global theme.
- Inventory v30 is visually integrated into the global shell rather than appearing as a nested separate app.
- Login screen uses the same palette, typography and rounded-card treatment.
- PWA browser/theme colors are changed from dark charcoal to Figma cream.
- Responsive navigation becomes a horizontal scroll strip on mobile.

## Files replaced

- `components/app-shell.tsx`
- `components/app-navigation.tsx` (new)
- `app/login/page.tsx`
- `app/layout.tsx`
- `app/manifest.ts`

## CSS

`cardcargo-global-v31.css` is appended at the end of `app/globals.css`, so it becomes the final app-wide design layer and overrides styling from older module patches without deleting their functional CSS.

No database migration is required.
