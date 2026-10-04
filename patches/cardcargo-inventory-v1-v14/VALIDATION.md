# Validation checklist

1. Apply patch to CardCargo through shipment images v12 (cost allocation v13 is compatible but not required).
2. Run migration `0011_inventory_v1.sql`.
3. `npm run typecheck`
4. `npm run lint`
5. `npm run test`
6. `npm run build`
7. Open an existing Bunjang purchase and confirm it still works with zero Purchase Items.
8. Open Purchase → Edit and add a manual card.
9. Search TCGdex using name/number and choose a reference result.
10. Save, re-edit and remove catalog reference if desired.
11. Create all remaining physical inventory units manually.
12. Open `/inventory` and verify the created units appear.
