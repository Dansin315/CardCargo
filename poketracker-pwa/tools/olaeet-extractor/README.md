# OLAEET Extractor 2.2 (CardCargo v87)

Shipping extraction now validates OLAEET's own overview count.

For a row rendered as:

```text
27 Items
/
1 Box
SHP-...
```

the exporter stores:

```json
{
  "expectedItemCount": 27,
  "expectedBoxCount": 1,
  "extractionComplete": true
}
```

`extractionComplete` is true only when the number of unique `STR-...` packages
and extracted boxes exactly matches OLAEET's own counts.

Package rows are interpreted as:

```text
category
STR-...
masked recipient
domestic tracking
```

and `Created At` / `Completed At` preserve their time component when available.
