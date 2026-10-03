import Link from 'next/link'
import type { Metadata } from 'next'
import { PurchaseListWorkspace } from '@/components/purchase-list-workspace'
import {
  purchaseSortKeys,
  type PurchaseSortKey,
} from '@/lib/purchase-sorting'
import { requireUser } from '@/lib/auth'
import { purchaseStatusLabels } from '@/lib/format'
import { addPurchaseThumbnails } from '@/lib/purchases'
import type {
  PurchaseRow,
  PurchaseStatus,
} from '@/lib/types'

export const metadata: Metadata = { title: 'Einkäufe' }
export const dynamic = 'force-dynamic'

const PAGE_SIZE = 10
const purchaseStatusKeys = new Set<PurchaseStatus>(
  Object.keys(
    purchaseStatusLabels,
  ) as PurchaseStatus[],
)

function validDate(value: string | undefined) {
  return value &&
    /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? value
    : ''
}

function normalizeSearch(value: unknown) {
  return String(value ?? '')
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

function valueContainsSearch(
  value: unknown,
  needle: string,
  depth = 0,
  seen = new WeakSet<object>(),
): boolean {
  if (value == null || depth > 8) return false

  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return normalizeSearch(value).includes(needle)
  }

  if (typeof value !== 'object') return false

  if (seen.has(value)) return false
  seen.add(value)

  if (Array.isArray(value)) {
    return value.some((entry) =>
      valueContainsSearch(
        entry,
        needle,
        depth + 1,
        seen,
      ),
    )
  }

  return Object.entries(
    value as Record<string, unknown>,
  ).some(
    ([key, entry]) =>
      normalizeSearch(key).includes(needle) ||
      valueContainsSearch(
        entry,
        needle,
        depth + 1,
        seen,
      ),
  )
}

export default async function PurchasesPage({
  searchParams,
}: {
  searchParams: Promise<{
    deleted?: string
    cleanup?: string
    page?: string
    sort?: string
    status?: string
    dateFrom?: string
    dateTo?: string
    q?: string
  }>
}) {
  const query = await searchParams

  const cleanupWarnings = Math.max(
    0,
    Number.parseInt(query.cleanup || '0', 10) || 0,
  )

  const requestedSort = String(
    query.sort || 'date_desc',
  ) as PurchaseSortKey
  const sort: PurchaseSortKey =
    purchaseSortKeys.has(requestedSort)
      ? requestedSort
      : 'date_desc'

  const requestedStatus = String(
    query.status || '',
  ) as PurchaseStatus
  const statusFilter: PurchaseStatus | '' =
    purchaseStatusKeys.has(requestedStatus)
      ? requestedStatus
      : ''

  const dateFrom = validDate(query.dateFrom)
  const dateTo = validDate(query.dateTo)
  const searchQuery = String(query.q || '')
    .trim()
    .slice(0, 160)

  const hasFilters = Boolean(
    searchQuery ||
      statusFilter ||
      dateFrom ||
      dateTo,
  )

  const { supabase } = await requireUser()

  const { count: allCount } = await supabase
    .from('purchases')
    .select('id', {
      count: 'exact',
      head: true,
    })

  const allTotalCount = allCount ?? 0
  let matchedSearchIds: string[] | null = null

  if (searchQuery) {
    const needle = normalizeSearch(searchQuery)

    let searchablePurchasesQuery = supabase
      .from('purchases')
      .select(
        'id, title, description, seller_name, source_listing_id, bunjang_order_id, domestic_tracking_number, domestic_carrier, listing_url, canonical_url, raw_metadata, status, purchased_at',
      )

    if (statusFilter) {
      searchablePurchasesQuery =
        searchablePurchasesQuery.eq(
          'status',
          statusFilter,
        )
    }

    if (dateFrom) {
      searchablePurchasesQuery =
        searchablePurchasesQuery.gte(
          'purchased_at',
          dateFrom,
        )
    }

    if (dateTo) {
      searchablePurchasesQuery =
        searchablePurchasesQuery.lte(
          'purchased_at',
          dateTo,
        )
    }

    const {
      data: searchablePurchases,
      error: searchablePurchasesError,
    } = await searchablePurchasesQuery

    if (searchablePurchasesError) {
      throw new Error(
        searchablePurchasesError.message,
      )
    }

    const eligibleIds = new Set(
      (searchablePurchases ?? []).map(
        (purchase) => String(purchase.id),
      ),
    )

    const matches = new Set<string>()

    for (const purchase of searchablePurchases ?? []) {
      if (
        valueContainsSearch(
          purchase,
          needle,
        )
      ) {
        matches.add(String(purchase.id))
      }
    }

    // purchase_items is deliberately read with `*` here. CardCargo's item
    // model has evolved over time and different card/import fields may live
    // in different columns or JSON metadata. Recursive matching therefore
    // finds an added individual card by any textual card field without
    // coupling this page to one historical schema version.
    const {
      data: purchaseItems,
      error: purchaseItemsError,
    } = await supabase
      .from('purchase_items')
      .select('*')
      .not('purchase_id', 'is', null)

    if (!purchaseItemsError) {
      for (const item of purchaseItems ?? []) {
        const purchaseId =
          item &&
          typeof item === 'object' &&
          'purchase_id' in item
            ? String(
                (
                  item as Record<
                    string,
                    unknown
                  >
                ).purchase_id || '',
              )
            : ''

        if (
          purchaseId &&
          eligibleIds.has(purchaseId) &&
          valueContainsSearch(
            item,
            needle,
          )
        ) {
          matches.add(purchaseId)
        }
      }
    }

    matchedSearchIds = [...matches]
  }

  let totalCount = allTotalCount

  if (hasFilters) {
    if (searchQuery) {
      totalCount =
        matchedSearchIds?.length ?? 0
    } else {
      let countQuery = supabase
        .from('purchases')
        .select('id', {
          count: 'exact',
          head: true,
        })

      if (statusFilter) {
        countQuery = countQuery.eq(
          'status',
          statusFilter,
        )
      }
      if (dateFrom) {
        countQuery = countQuery.gte(
          'purchased_at',
          dateFrom,
        )
      }
      if (dateTo) {
        countQuery = countQuery.lte(
          'purchased_at',
          dateTo,
        )
      }

      const { count } = await countQuery
      totalCount = count ?? 0
    }
  }

  const totalPages = Math.max(
    1,
    Math.ceil(totalCount / PAGE_SIZE),
  )

  const requestedPage = Number.parseInt(
    query.page || '1',
    10,
  )

  const page = Math.min(
    totalPages,
    Math.max(
      1,
      Number.isFinite(requestedPage)
        ? requestedPage
        : 1,
    ),
  )

  const offset = (page - 1) * PAGE_SIZE

  let purchaseQuery = supabase
    .from('purchases')
    .select(
      'id, source, source_listing_id, listing_url, canonical_url, title, description, seller_name, price_amount, price_currency, domestic_shipping_amount, domestic_carrier, domestic_tracking_number, service_fee_amount, purchased_at, status, created_at, updated_at, purchase_images(id, storage_path, source_url, original_filename, mime_type, byte_size, position, kind)',
    )

  if (statusFilter) {
    purchaseQuery = purchaseQuery.eq(
      'status',
      statusFilter,
    )
  }
  if (dateFrom) {
    purchaseQuery = purchaseQuery.gte(
      'purchased_at',
      dateFrom,
    )
  }
  if (dateTo) {
    purchaseQuery = purchaseQuery.lte(
      'purchased_at',
      dateTo,
    )
  }

  if (
    searchQuery &&
    matchedSearchIds &&
    matchedSearchIds.length
  ) {
    purchaseQuery = purchaseQuery.in(
      'id',
      matchedSearchIds,
    )
  }

  switch (sort) {
    case 'date_asc':
      purchaseQuery = purchaseQuery
        .order('purchased_at', {
          ascending: true,
          nullsFirst: false,
        })
        .order('created_at', {
          ascending: true,
        })
      break

    case 'price_desc':
      purchaseQuery = purchaseQuery
        .order('price_amount', {
          ascending: false,
          nullsFirst: false,
        })
        .order('created_at', {
          ascending: false,
        })
      break

    case 'price_asc':
      purchaseQuery = purchaseQuery
        .order('price_amount', {
          ascending: true,
          nullsFirst: false,
        })
        .order('created_at', {
          ascending: false,
        })
      break

    case 'created_desc':
      purchaseQuery = purchaseQuery.order(
        'created_at',
        { ascending: false },
      )
      break

    case 'created_asc':
      purchaseQuery = purchaseQuery.order(
        'created_at',
        { ascending: true },
      )
      break

    case 'updated_desc':
      purchaseQuery = purchaseQuery
        .order('updated_at', {
          ascending: false,
        })
        .order('created_at', {
          ascending: false,
        })
      break

    case 'seller_asc':
      purchaseQuery = purchaseQuery
        .order('seller_name', {
          ascending: true,
          nullsFirst: false,
        })
        .order('created_at', {
          ascending: false,
        })
      break

    case 'seller_desc':
      purchaseQuery = purchaseQuery
        .order('seller_name', {
          ascending: false,
          nullsFirst: false,
        })
        .order('created_at', {
          ascending: false,
        })
      break

    case 'title_asc':
      purchaseQuery = purchaseQuery
        .order('title', {
          ascending: true,
        })
        .order('created_at', {
          ascending: false,
        })
      break

    case 'title_desc':
      purchaseQuery = purchaseQuery
        .order('title', {
          ascending: false,
        })
        .order('created_at', {
          ascending: false,
        })
      break

    case 'date_desc':
    default:
      purchaseQuery = purchaseQuery
        .order('purchased_at', {
          ascending: false,
          nullsFirst: false,
        })
        .order('created_at', {
          ascending: false,
        })
      break
  }

  const shouldLoadPurchases =
    totalCount > 0 &&
    !(
      searchQuery &&
      matchedSearchIds &&
      matchedSearchIds.length === 0
    )

  const { data } = shouldLoadPurchases
    ? await purchaseQuery.range(
        offset,
        offset + PAGE_SIZE - 1,
      )
    : { data: [] }

  const purchases = await addPurchaseThumbnails(
    supabase,
    (data ?? []) as unknown as PurchaseRow[],
  )

  return (
    <div className="page-stack">
      <header className="page-header">
        <div>
          <span className="eyebrow">
            Beschaffung
          </span>
          <h1>Einkäufe</h1>
          <p>
            Einkäufe, Einzelkarten und
            Sendungsdaten zentral verwalten.
          </p>
        </div>

        <Link
          className="button button-primary"
          href="/purchases/bunjang-import"
        >
          Bunjang Einkäufe importieren
        </Link>
      </header>

      {query.deleted === '1' ? (
        <div className="alert alert-success">
          Der Einkauf wurde erfolgreich
          gelöscht.
        </div>
      ) : null}

      {cleanupWarnings > 0 ? (
        <div className="alert alert-warning">
          Der Datensatz wurde gelöscht, aber
          mindestens eine Bilddatei konnte
          nicht automatisch aus dem Storage
          entfernt werden.
        </div>
      ) : null}

      <section className="panel">
        <PurchaseListWorkspace
          purchases={purchases}
          page={page}
          totalPages={totalPages}
          totalCount={totalCount}
          allTotalCount={allTotalCount}
          sort={sort}
          statusFilter={statusFilter}
          dateFrom={dateFrom}
          dateTo={dateTo}
          searchQuery={searchQuery}
        />
      </section>
    </div>
  )
}
