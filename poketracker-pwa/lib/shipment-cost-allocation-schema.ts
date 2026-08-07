import { z } from 'zod'
import { shipmentCostAllocationMethods } from '@/lib/shipment-cost-allocation'

const amount = z
  .number({ error: 'Allokationsbetrag muss eine Zahl sein.' })
  .finite()
  .min(0, 'Allokationsbetrag darf nicht negativ sein.')
  .max(100_000_000, 'Allokationsbetrag ist zu groß.')

export const shipmentCostAllocationInputSchema = z.object({
  shippingMethod: z.enum(shipmentCostAllocationMethods),
  forwardingMethod: z.enum(shipmentCostAllocationMethods),
  importMethod: z.enum(shipmentCostAllocationMethods),
  allocations: z
    .array(
      z.object({
        purchaseId: z.string().uuid('Ungültige Einkauf-ID.'),
        warehousePackageId: z.string().uuid('Ungültige OLAEET-Paket-ID.'),
        internationalShippingAmount: amount,
        forwardingFeeAmount: amount,
        importTaxAmount: amount,
      }),
    )
    .min(1, 'Es muss mindestens ein Einkauf verteilt werden.')
    .max(1000),
})

export type ShipmentCostAllocationInput = z.infer<
  typeof shipmentCostAllocationInputSchema
>
