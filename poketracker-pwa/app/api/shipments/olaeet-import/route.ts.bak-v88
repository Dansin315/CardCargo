import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getApiUser } from '@/lib/auth'
import { hasTrustedRequestOrigin } from '@/lib/request-security'
import {
  olaeetShipmentPayloadSchema,
  validateCompleteShipment,
  type OlaeetShipment,
} from '@/lib/olaeet-shipment-import'
import {
  shipmentPackageTableCandidates,
  shipmentTableCandidates,
} from '@/lib/olaeet-shipment-schema.generated'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

type GenericRow = Record<string, unknown>

function asRows(value: unknown): GenericRow[] {
  return Array.isArray(value)
    ? value.filter(
        (entry): entry is GenericRow =>
          Boolean(
            entry &&
              typeof entry === 'object' &&
              !Array.isArray(entry),
          ),
      )
    : []
}

function text(value: unknown) {
  return typeof value === 'string' ? value : null
}

function findColumn(
  columns: Set<string>,
  candidates: string[],
) {
  return candidates.find((candidate) =>
    columns.has(candidate),
  ) ?? null
}

function mapFirst(
  payload: GenericRow,
  columns: Set<string>,
  candidates: string[],
  value: unknown,
) {
  if (value === undefined) return
  const key = findColumn(columns, candidates)
  if (key) payload[key] = value
}

function mergeRawMetadata(
  current: unknown,
  shipment: OlaeetShipment,
  rawPayload: unknown,
) {
  const base =
    current &&
    typeof current === 'object' &&
    !Array.isArray(current)
      ? (current as GenericRow)
      : {}

  return {
    ...base,
    olaeet_shipment: shipment,
    olaeet_extraction: rawPayload,
    olaeet_imported_at: new Date().toISOString(),
  }
}

async function probeTable(
  supabase: Awaited<ReturnType<typeof getApiUser>>['supabase'],
  table: string,
  userId: string,
) {
  const builder = supabase.from(table as never)

  let response = await builder
    .select('*')
    .eq('user_id' as never, userId as never)
    .limit(1)

  if (response.error) {
    response = await supabase
      .from(table as never)
      .select('*')
      .limit(1)
  }

  if (response.error) return null

  const rows = asRows(response.data)
  const sample = rows[0] ?? null
  const columns = new Set(
    sample ? Object.keys(sample) : [],
  )

  return {
    table,
    sample,
    columns,
  }
}

function inferExternalShipmentColumn(
  sample: GenericRow | null,
  columns: Set<string>,
) {
  const known = findColumn(columns, [
    'external_shipment_id',
    'provider_shipment_id',
    'shipment_number',
    'shipment_code',
    'external_id',
    'olaeet_shipment_id',
  ])

  if (known) return known

  if (sample) {
    for (const [key, value] of Object.entries(sample)) {
      if (
        typeof value === 'string' &&
        /^SHP-\d{8}-[A-Z0-9]+$/i.test(value)
      ) {
        return key
      }
    }
  }

  return null
}

async function syncBaseShipment(
  supabase: Awaited<ReturnType<typeof getApiUser>>['supabase'],
  userId: string,
  shipment: OlaeetShipment,
  rawPayload: unknown,
) {
  const warnings: string[] = []

  for (const table of shipmentTableCandidates) {
    if (
      table.includes('package') ||
      table === 'olaeet_shipment_extractions'
    ) {
      continue
    }

    const probe = await probeTable(
      supabase,
      table,
      userId,
    )
    if (!probe) continue

    const externalColumn =
      inferExternalShipmentColumn(
        probe.sample,
        probe.columns,
      )

    if (!externalColumn) {
      warnings.push(
        `${table}: externe SHP-ID-Spalte konnte nicht automatisch erkannt werden.`,
      )
      continue
    }

    const existingResponse = await supabase
      .from(table as never)
      .select('*')
      .eq(
        externalColumn as never,
        shipment.externalShipmentId as never,
      )
      .limit(1)

    if (existingResponse.error) {
      warnings.push(
        `${table}: bestehende Sendung konnte nicht geprüft werden.`,
      )
      continue
    }

    const existing =
      asRows(existingResponse.data)[0] ?? null
    const columns = new Set([
      ...probe.columns,
      ...(existing ? Object.keys(existing) : []),
    ])

    // If the table was empty during probing, the common CardCargo schema is
    // used as a conservative fallback.
    if (!columns.size) {
      for (const key of [
        'user_id',
        'external_shipment_id',
        'provider',
        'provider_status',
        'carrier',
        'tracking_number',
        'total_payment',
        'currency',
        'raw_metadata',
      ]) {
        columns.add(key)
      }
    }

    const payload: GenericRow = {}

    mapFirst(
      payload,
      columns,
      ['user_id'],
      userId,
    )
    mapFirst(
      payload,
      columns,
      [
        externalColumn,
        'external_shipment_id',
        'provider_shipment_id',
        'shipment_number',
      ],
      shipment.externalShipmentId,
    )
    mapFirst(
      payload,
      columns,
      ['provider'],
      'OLAEET',
    )
    mapFirst(
      payload,
      columns,
      ['provider_status', 'status'],
      shipment.providerStatus,
    )
    mapFirst(
      payload,
      columns,
      ['courier', 'carrier', 'shipping_provider'],
      shipment.courier,
    )
    mapFirst(
      payload,
      columns,
      [
        'tracking_number',
        'international_tracking_number',
        'international_tracking',
      ],
      shipment.trackingNumber,
    )
    mapFirst(
      payload,
      columns,
      [
        'total_payment',
        'total_amount',
        'shipping_cost_amount',
        'shipping_amount',
      ],
      shipment.totalPayment,
    )
    mapFirst(
      payload,
      columns,
      [
        'currency',
        'shipping_currency',
        'price_currency',
      ],
      shipment.currency,
    )
    mapFirst(
      payload,
      columns,
      ['payment_transaction_id', 'payment_id'],
      shipment.paymentTransactionId,
    )
    mapFirst(
      payload,
      columns,
      ['package_count', 'item_count'],
      shipment.packages.length,
    )
    mapFirst(
      payload,
      columns,
      ['box_count'],
      shipment.boxes.length,
    )
    mapFirst(
      payload,
      columns,
      ['destination_country', 'country'],
      shipment.address.country,
    )
    mapFirst(
      payload,
      columns,
      ['recipient_name'],
      shipment.address.name,
    )

    if (columns.has('raw_metadata')) {
      payload.raw_metadata = mergeRawMetadata(
        existing?.raw_metadata,
        shipment,
        rawPayload,
      )
    }

    let writeResponse

    if (existing?.id) {
      writeResponse = await supabase
        .from(table as never)
        .update(payload as never)
        .eq('id' as never, existing.id as never)
        .select('*')
        .single()
    } else {
      writeResponse = await supabase
        .from(table as never)
        .insert(payload as never)
        .select('*')
        .single()
    }

    if (writeResponse.error) {
      warnings.push(
        `${table}: ${writeResponse.error.message}`,
      )
      continue
    }

    const row =
      writeResponse.data &&
      typeof writeResponse.data === 'object'
        ? (writeResponse.data as unknown as GenericRow)
        : null

    return {
      table,
      row,
      warnings,
    }
  }

  return {
    table: null,
    row: null,
    warnings: [
      ...warnings,
      'Bestehendes CardCargo-Sendungsmodell konnte nicht automatisch geschrieben werden. ' +
        'Die vollständige OLAEET-Extraction wurde trotzdem separat gespeichert.',
    ],
  }
}

async function replaceExistingPackageLinks(
  supabase: Awaited<ReturnType<typeof getApiUser>>['supabase'],
  userId: string,
  shipmentRow: GenericRow | null,
  matchedPackages: Array<{
    id: string
    externalPackageId: string
  }>,
) {
  if (!shipmentRow?.id || !matchedPackages.length) {
    return {
      table: null,
      linked: 0,
      warning: null as string | null,
    }
  }

  for (const table of shipmentPackageTableCandidates) {
    if (table === 'olaeet_shipment_package_links') {
      continue
    }

    const probe = await probeTable(
      supabase,
      table,
      userId,
    )
    if (!probe) continue

    const columns = probe.columns

    const shipmentColumn =
      findColumn(columns, [
        'shipment_id',
        'international_shipment_id',
        'outbound_shipment_id',
      ]) ||
      [...columns].find(
        (key) =>
          /shipment.*_id$/i.test(key) &&
          !/external/i.test(key),
      ) ||
      null

    const packageColumn =
      findColumn(columns, [
        'warehouse_package_id',
        'package_id',
      ]) ||
      [...columns].find((key) =>
        /warehouse.*package.*_id$/i.test(key),
      ) ||
      null

    if (!shipmentColumn || !packageColumn) {
      continue
    }

    const deleteResponse = await supabase
      .from(table as never)
      .delete()
      .eq(
        shipmentColumn as never,
        shipmentRow.id as never,
      )

    if (deleteResponse.error) continue

    const rows = matchedPackages.map(
      (pkg) =>
        ({
          ...(columns.has('user_id')
            ? { user_id: userId }
            : {}),
          [shipmentColumn]: shipmentRow.id,
          [packageColumn]: pkg.id,
        }) as GenericRow,
    )

    const insertResponse = await supabase
      .from(table as never)
      .insert(rows as never)

    if (!insertResponse.error) {
      return {
        table,
        linked: rows.length,
        warning: null,
      }
    }
  }

  return {
    table: null,
    linked: 0,
    warning:
      'Die vorhandene CardCargo Shipment↔Package-Zwischentabelle konnte nicht automatisch erkannt werden. ' +
      'Die sicheren OLAEET-Linkdaten wurden in der v87-Linktabelle gespeichert.',
  }
}

export async function POST(request: Request) {
  if (!hasTrustedRequestOrigin(request)) {
    return NextResponse.json(
      { error: 'Anfrage von fremder Origin blockiert.' },
      { status: 403 },
    )
  }

  const auth = await getApiUser()
  if (!auth.user) {
    return NextResponse.json(
      { error: auth.error },
      { status: auth.status },
    )
  }

  try {
    const rawPayload = await request.json()
    const parsed =
      olaeetShipmentPayloadSchema.parse(rawPayload)
    const shipment = parsed.shipments[0]

    validateCompleteShipment(shipment)

    const { data: warehousePackages, error: packageError } =
      await auth.supabase
        .from('warehouse_packages')
        .select(
          'id, external_package_id, domestic_tracking_number',
        )
        .eq('user_id', auth.user.id)
        .eq('provider', 'OLAEET')

    if (packageError) {
      throw new Error(packageError.message)
    }

    const byExternal = new Map<
      string,
      { id: string; externalPackageId: string }
    >()
    const byTracking = new Map<
      string,
      Array<{ id: string; externalPackageId: string }>
    >()

    for (const pkg of warehousePackages ?? []) {
      const externalPackageId = String(
        pkg.external_package_id || '',
      ).trim()

      if (externalPackageId) {
        byExternal.set(
          externalPackageId.toUpperCase(),
          {
            id: pkg.id,
            externalPackageId,
          },
        )
      }

      const tracking = String(
        pkg.domestic_tracking_number || '',
      )
        .replace(/\D/g, '')
        .trim()

      if (tracking) {
        const current = byTracking.get(tracking) ?? []
        current.push({
          id: pkg.id,
          externalPackageId,
        })
        byTracking.set(tracking, current)
      }
    }

    const matchedPackages: Array<{
      id: string
      externalPackageId: string
      source: 'external-id' | 'tracking'
    }> = []
    const missingPackages: string[] = []

    for (const extracted of shipment.packages) {
      const exact = byExternal.get(
        extracted.externalPackageId.toUpperCase(),
      )

      if (exact) {
        matchedPackages.push({
          ...exact,
          source: 'external-id',
        })
        continue
      }

      const tracking = String(
        extracted.domesticTrackingNumber || '',
      ).replace(/\D/g, '')

      const trackingMatches = tracking
        ? byTracking.get(tracking) ?? []
        : []

      if (trackingMatches.length === 1) {
        matchedPackages.push({
          ...trackingMatches[0],
          source: 'tracking',
        })
      } else {
        missingPackages.push(
          extracted.externalPackageId,
        )
      }
    }

    // Full extraction sidecar. This is the source of truth for all OLAEET
    // fields that the historical manual shipment model did not expose.
    const sidecarPayload = {
      user_id: auth.user.id,
      external_shipment_id:
        shipment.externalShipmentId,
      provider_status: shipment.providerStatus,
      provider_created_at: shipment.createdAt,
      provider_completed_at: shipment.completedAt,
      courier: shipment.courier,
      tracking_number: shipment.trackingNumber,
      payment_transaction_id:
        shipment.paymentTransactionId,
      shipping_amount: shipment.shippingAmount,
      shipping_fee: shipment.shippingFee,
      additional_fee: shipment.additionalFee,
      insurance_fee: shipment.insuranceFee,
      total_payment: shipment.totalPayment,
      currency: shipment.currency || 'KRW',
      address: shipment.address,
      boxes: shipment.boxes,
      packages: shipment.packages,
      expected_item_count:
        shipment.expectedItemCount,
      expected_box_count:
        shipment.expectedBoxCount,
      extraction_complete:
        shipment.extractionComplete,
      page_url: shipment.pageUrl,
      raw_text: shipment.rawText,
      diagnostics: shipment.diagnostics,
      extracted_at:
        parsed.extractedAt || null,
      raw_payload: rawPayload,
      imported_at: new Date().toISOString(),
    }

    const sidecarWrite = await auth.supabase
      .from(
        'olaeet_shipment_extractions' as never,
      )
      .upsert(sidecarPayload as never, {
        onConflict:
          'user_id,external_shipment_id',
      })
      .select('id')
      .single()

    if (sidecarWrite.error) {
      throw new Error(
        'v87-Datenbanktabellen fehlen oder konnten nicht beschrieben werden. ' +
          'Führe zuerst supabase/manual/v87_olaeet_shipment_extraction.sql aus. ' +
          sidecarWrite.error.message,
      )
    }

    const { error: deleteSidecarLinksError } =
      await auth.supabase
        .from(
          'olaeet_shipment_package_links' as never,
        )
        .delete()
        .eq(
          'user_id' as never,
          auth.user.id as never,
        )
        .eq(
          'external_shipment_id' as never,
          shipment.externalShipmentId as never,
        )

    if (deleteSidecarLinksError) {
      throw new Error(
        deleteSidecarLinksError.message,
      )
    }

    if (matchedPackages.length) {
      const extractedById = new Map(
        shipment.packages.map((entry) => [
          entry.externalPackageId.toUpperCase(),
          entry,
        ]),
      )

      const linkRows = matchedPackages.map(
        (matched) => {
          const extracted =
            extractedById.get(
              matched.externalPackageId.toUpperCase(),
            ) ??
            shipment.packages.find(
              (entry) =>
                String(
                  entry.domesticTrackingNumber || '',
                ).replace(/\D/g, '') &&
                String(
                  entry.domesticTrackingNumber || '',
                ).replace(/\D/g, '') ===
                  String(
                    warehousePackages?.find(
                      (pkg) =>
                        pkg.id === matched.id,
                    )?.domestic_tracking_number ||
                      '',
                  ).replace(/\D/g, ''),
            ) ??
            null

          return {
            user_id: auth.user.id,
            external_shipment_id:
              shipment.externalShipmentId,
            warehouse_package_id: matched.id,
            external_package_id:
              extracted?.externalPackageId ||
              matched.externalPackageId,
            domestic_tracking_number:
              extracted?.domesticTrackingNumber ||
              null,
            item_category:
              extracted?.itemCategory || null,
            recipient_masked:
              extracted?.recipientMasked || null,
            match_method: matched.source,
          }
        },
      )

      const { error: linkError } =
        await auth.supabase
          .from(
            'olaeet_shipment_package_links' as never,
          )
          .insert(linkRows as never)

      if (linkError) {
        throw new Error(linkError.message)
      }
    }

    const baseSync = await syncBaseShipment(
      auth.supabase,
      auth.user.id,
      shipment,
      rawPayload,
    )

    const existingLinkSync =
      await replaceExistingPackageLinks(
        auth.supabase,
        auth.user.id,
        baseSync.row,
        matchedPackages.map((entry) => ({
          id: entry.id,
          externalPackageId:
            entry.externalPackageId,
        })),
      )

    const warnings = [
      ...baseSync.warnings,
      ...(existingLinkSync.warning
        ? [existingLinkSync.warning]
        : []),
    ]

    return NextResponse.json({
      shipment: {
        externalShipmentId:
          shipment.externalShipmentId,
        trackingNumber: shipment.trackingNumber,
        totalPayment: shipment.totalPayment,
        currency: shipment.currency || 'KRW',
        packageCount: shipment.packages.length,
        boxCount: shipment.boxes.length,
      },
      matchedPackages: matchedPackages.length,
      missingPackages,
      baseShipmentTable: baseSync.table,
      existingPackageLinkTable:
        existingLinkSync.table,
      existingPackageLinks:
        existingLinkSync.linked,
      detailsUrl: `/shipments/olaeet/${encodeURIComponent(
        shipment.externalShipmentId,
      )}`,
      warnings,
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error:
            error.issues[0]?.message ||
            'Ungültige OLAEET-Extraction.',
        },
        { status: 422 },
      )
    }

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'OLAEET-Sendung konnte nicht importiert werden.',
      },
      { status: 400 },
    )
  }
}
