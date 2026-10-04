# CardCargo Bunjang multiline parser fix v55

Behebt die reale Bunjang-DOM-Struktur:

```text
판매자
상점78913406호

거래방법
일반택배(선불)

운송장
GS25편의점택배
365130860232
```

v54 erwartete diese Werte teilweise in derselben `innerText`-Zeile.
v55 unterstützt sowohl Einzeilen- als auch Mehrzeilenformate.

## Anwenden

```bash
cd "$HOME/CardCargo/poketracker-pwa"

bash \
  "$HOME/CardCargo/patches/cardcargo-bunjang-multiline-parser-fix-v55/apply.sh" \
  "$HOME/CardCargo/poketracker-pwa"
```

Danach:

```bash
npm run typecheck
npm run lint
npm run build
```

Keine Supabase-Migration erforderlich.
