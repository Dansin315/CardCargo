# Validation

Expected after applying patch and migration:

1. `npm run typecheck`
2. `npm run lint`
3. `npm run test`
4. `npm run build`

Manual checks:

- Open a shipment with linked OLAEET packages and Bunjang purchases.
- Use "Kosten verteilen".
- Recalculate default methods.
- Verify shipping totals exactly equal shipment shipping amount.
- Save and reopen the shipment.
- Change a source shipment cost and confirm saved allocation rows disappear until recalculated.
- Change a used package weight and confirm saved allocations are invalidated.
