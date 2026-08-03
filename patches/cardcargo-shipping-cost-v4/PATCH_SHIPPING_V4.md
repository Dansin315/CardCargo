# CardCargo Shipping Cost Patch v4

This patch adds automatic import and storage of Korean domestic shipping fees from Bunjang.

- Bunjang API values such as `shippingFee`, `deliveryFee`, nested `{ fee: ... }`, and explicit free-shipping flags are mapped.
- The import form shows an editable `Versandkosten in Korea` field.
- The value is stored in the existing `purchases.domestic_shipping_amount` column.
- Purchase details show item price, Korean shipping, and their subtotal.
- No Supabase migration is required because the initial schema already contains the column.
