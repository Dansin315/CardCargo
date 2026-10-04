# CardCargo v91 - OLAEET Shipment Response Type Fix

v91 behebt die TypeScript-Fehler:

```text
TS2339: Property 'data' does not exist on type 'never'.
```

in:

```text
app/api/shipments/olaeet-import/route.ts
```

## Ursache

Die Save-Funktion verwendet bewusst einen zur Laufzeit erkannten Tabellenamen:

```ts
supabase.from(table as never)
```

Bei der bedingten Insert-/Update-Abfrage kann Supabase/TypeScript den
Rückgabetyp deshalb auf `never` reduzieren. Die Datenbankabfrage selbst ist
nicht das Problem; nur der statische Typ des Response-Objekts ist zu eng.

v91 erweitert ausschließlich die Response-Form auf:

```ts
{
  data: unknown
  error: { message: string } | null
}
```

bevor `response.data` bzw. `response.error` gelesen werden.

Die OLAEET-Extraction, Preview, Save-Logik, Schema-Erkennung und
Paketzuordnung aus v90 bleiben unverändert.

## Anwenden

```bash
cd "$HOME/CardCargo/poketracker-pwa"

bash \
  "$HOME/CardCargo/patches/cardcargo-olaeet-shipment-response-type-fix-v91/apply.sh" \
  "$HOME/CardCargo/poketracker-pwa"
```

Danach:

```bash
rm -rf .next
npm run typecheck
npm run lint
npm run build
```

Keine neue Supabase-Migration erforderlich.
