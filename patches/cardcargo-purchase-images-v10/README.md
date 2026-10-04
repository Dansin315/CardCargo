# CardCargo purchase image management v10

This patch adds image management to already saved Bunjang purchases.

## Features

- Add up to 12 new images per edit and keep up to 24 images per purchase.
- Supported files: JPEG, PNG, WebP and GIF, up to 6 MB each.
- Categorize new images as general, chat/negotiation, condition/detail,
  receipt/payment or shipping/tracking.
- Remove manually uploaded purchase images while protecting automatically
  archived Bunjang listing images.
- Keep at least one archived image per purchase.
- Dynamically show all current purchase images in assigned OLAEET packages.
  Removing the purchase-to-package assignment immediately removes those images
  from the OLAEET package view without deleting the purchase images themselves.
- No image copies are created for the OLAEET relationship.

## Installation

```bash
bash /path/to/cardcargo-purchase-images-v10/apply.sh \
  "$HOME/CardCargo/poketracker-pwa"
```

Then run `supabase/migrations/0006_purchase_image_categories.sql` in the
Supabase SQL Editor and validate locally.
