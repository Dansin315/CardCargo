import Link from 'next/link'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { requireUser } from '@/lib/auth'

export const metadata: Metadata = {
  title: 'OLAEET Sendungsdetails',
}
export const dynamic = 'force-dynamic'

type Row = {
  external_shipment_id: string
  provider_status: string | null
  provider_created_at: string | null
  provider_completed_at: string | null
  courier: string | null
  tracking_number: string | null
  payment_transaction_id: string | null
  shipping_amount: number | null
  shipping_fee: number | null
  additional_fee: number | null
  insurance_fee: number | null
  total_payment: number | null
  currency: string
  address: Record<string, unknown>
  boxes: Array<Record<string, unknown>>
  packages: Array<Record<string, unknown>>
  expected_item_count: number | null
  expected_box_count: number | null
  extraction_complete: boolean
  page_url: string | null
}

function money(
  amount: number | null,
  currency: string,
) {
  if (amount === null) return '–'
  return `${new Intl.NumberFormat('de-DE').format(
    amount,
  )} ${currency}`
}

function value(
  object: Record<string, unknown>,
  key: string,
) {
  const result = object[key]
  return result === null ||
    result === undefined ||
    result === ''
    ? '–'
    : String(result)
}

export default async function OlaeetShipmentDetailsPage({
  params,
}: {
  params: Promise<{
    externalShipmentId: string
  }>
}) {
  const { externalShipmentId } = await params
  const { supabase, user } = await requireUser()

  const { data, error } = await supabase
    .from(
      'olaeet_shipment_extractions' as never,
    )
    .select('*')
    .eq(
      'user_id' as never,
      user.id as never,
    )
    .eq(
      'external_shipment_id' as never,
      decodeURIComponent(
        externalShipmentId,
      ) as never,
    )
    .maybeSingle()

  if (error || !data) notFound()

  const shipment =
    data as unknown as Row

  const { data: links } = await supabase
    .from(
      'olaeet_shipment_package_links' as never,
    )
    .select(
      'external_package_id, domestic_tracking_number, item_category, recipient_masked, match_method, warehouse_package_id',
    )
    .eq(
      'user_id' as never,
      user.id as never,
    )
    .eq(
      'external_shipment_id' as never,
      shipment.external_shipment_id as never,
    )
    .order(
      'external_package_id' as never,
      { ascending: true } as never,
    )

  const linkRows = Array.isArray(links)
    ? (links as unknown as Array<
        Record<string, unknown>
      >)
    : []

  return (
    <div className="page-stack">
      <div className="breadcrumb-row">
        <Link href="/shipments">
          ← Sendungen
        </Link>
        <span>
          {shipment.external_shipment_id}
        </span>
      </div>

      <header className="page-header compact">
        <div>
          <span className="eyebrow">
            OLAEET Extraction
          </span>
          <h1>
            {shipment.external_shipment_id}
          </h1>
          <p>
            {shipment.provider_status || 'Status –'} ·{' '}
            {shipment.courier || 'Courier –'} ·{' '}
            {shipment.tracking_number ||
              'Tracking –'}
          </p>
        </div>
      </header>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Sendung</h2>
            <p>
              Vollständige, direkt aus OLAEET
              gespeicherte Shipping-Daten.
            </p>
          </div>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns:
              'repeat(auto-fit, minmax(180px, 1fr))',
            gap: 12,
          }}
        >
          <div>
            <small>Created At</small>
            <br />
            <strong>
              {shipment.provider_created_at || '–'}
            </strong>
          </div>
          <div>
            <small>Completed At</small>
            <br />
            <strong>
              {shipment.provider_completed_at ||
                '–'}
            </strong>
          </div>
          <div>
            <small>Payment ID</small>
            <br />
            <strong>
              {shipment.payment_transaction_id ||
                '–'}
            </strong>
          </div>
          <div>
            <small>Pakete</small>
            <br />
            <strong>
              {shipment.packages.length}/
              {shipment.expected_item_count ?? '?'}
            </strong>
          </div>
          <div>
            <small>Boxen</small>
            <br />
            <strong>
              {shipment.boxes.length}/
              {shipment.expected_box_count ?? '?'}
            </strong>
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Kosten</h2>
          </div>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns:
              'repeat(auto-fit, minmax(180px, 1fr))',
            gap: 12,
          }}
        >
          <div>
            <small>Shipping Amount</small>
            <br />
            <strong>
              {money(
                shipment.shipping_amount,
                shipment.currency,
              )}
            </strong>
          </div>
          <div>
            <small>Shipping Fee</small>
            <br />
            <strong>
              {money(
                shipment.shipping_fee,
                shipment.currency,
              )}
            </strong>
          </div>
          <div>
            <small>Additional Fee</small>
            <br />
            <strong>
              {money(
                shipment.additional_fee,
                shipment.currency,
              )}
            </strong>
          </div>
          <div>
            <small>Insurance Fee</small>
            <br />
            <strong>
              {money(
                shipment.insurance_fee,
                shipment.currency,
              )}
            </strong>
          </div>
          <div>
            <small>Total Payment</small>
            <br />
            <strong>
              {money(
                shipment.total_payment,
                shipment.currency,
              )}
            </strong>
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Empfänger</h2>
          </div>
        </div>

        <div>
          <strong>
            {value(shipment.address, 'name')}
          </strong>
          <br />
          {value(
            shipment.address,
            'addressLine1',
          )}
          <br />
          {value(shipment.address, 'zipCode')}{' '}
          {value(shipment.address, 'city')}
          <br />
          {value(shipment.address, 'country')}
          <br />
          {value(shipment.address, 'contact')}
        </div>
      </section>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>
              OLAEET-Pakete ({linkRows.length})
            </h2>
            <p>
              Automatisch mit vorhandenen
              CardCargo-Warehouse-Paketen
              abgeglichen.
            </p>
          </div>
        </div>

        <div
          style={{
            display: 'grid',
            gap: 8,
          }}
        >
          {linkRows.map((pkg) => (
            <article
              key={String(
                pkg.external_package_id,
              )}
              style={{
                display: 'grid',
                gridTemplateColumns:
                  'minmax(0, 1fr) minmax(160px, auto)',
                gap: 12,
                padding: 12,
                border:
                  '1px solid var(--border, #ddd)',
                borderRadius: 12,
              }}
            >
              <div>
                <strong>
                  {String(
                    pkg.external_package_id,
                  )}
                </strong>
                <div style={{ opacity: 0.72 }}>
                  {String(
                    pkg.item_category || '–',
                  )}{' '}
                  ·{' '}
                  {String(
                    pkg.recipient_masked || '–',
                  )}
                </div>
              </div>
              <div
                style={{
                  textAlign: 'right',
                }}
              >
                <strong>
                  {String(
                    pkg.domestic_tracking_number ||
                      '–',
                  )}
                </strong>
                <div
                  style={{
                    opacity: 0.62,
                    fontSize: 12,
                  }}
                >
                  {String(
                    pkg.match_method || '–',
                  )}
                </div>
              </div>
            </article>
          ))}

          {!linkRows.length ? (
            <div className="alert alert-warning">
              Keine CardCargo-Pakete wurden
              verknüpft.
            </div>
          ) : null}
        </div>
      </section>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Boxen</h2>
          </div>
        </div>

        <pre
          style={{
            whiteSpace: 'pre-wrap',
            overflowWrap: 'anywhere',
          }}
        >
          {JSON.stringify(
            shipment.boxes,
            null,
            2,
          )}
        </pre>
      </section>
    </div>
  )
}
