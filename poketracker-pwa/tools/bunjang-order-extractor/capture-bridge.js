(() => {
  const SOURCE = 'cardcargo-bunjang-network-v67'
  const STORAGE_KEY = 'cardcargoBunjangNetworkCaptureV75'
  const pending = new Map()
  let flushTimer = null

  function plausibleId(value) {
    const text = String(value ?? '').trim()
    if (!/^\d{6,12}$/.test(text)) return null

    const number = Number(text)
    if (!Number.isSafeInteger(number) || number < 100000) {
      return null
    }

    return text
  }

  function cleanText(value) {
    const text = String(value ?? '')
      .replace(/\u00a0/g, ' ')
      .replace(/[ \t]+/g, ' ')
      .trim()

    return text || null
  }

  function parseDate(value) {
    if (value == null) return null

    if (typeof value === 'number') {
      if (value > 1_000_000_000_000 && value < 9_999_999_999_999) {
        const date = new Date(value)
        if (Number.isFinite(date.getTime())) {
          return [
            date.getFullYear(),
            String(date.getMonth() + 1).padStart(2, '0'),
            String(date.getDate()).padStart(2, '0'),
          ].join('-')
        }
      }

      return null
    }

    const text = cleanText(value)
    if (!text) return null

    let match = text.match(
      /(\d{4})[-./](\d{1,2})[-./](\d{1,2})/,
    )

    if (match) {
      return `${match[1]}-${String(match[2]).padStart(2, '0')}-${String(
        match[3],
      ).padStart(2, '0')}`
    }

    match = text.match(
      /(\d{2,4})년\s*(\d{1,2})월\s*(\d{1,2})일/,
    )

    if (match) {
      const year =
        match[1].length === 2 ? `20${match[1]}` : match[1]

      return `${year}-${String(match[2]).padStart(2, '0')}-${String(
        match[3],
      ).padStart(2, '0')}`
    }

    match = text.match(/\b(20\d{2})(\d{2})(\d{2})\b/)

    if (match) {
      return `${match[1]}-${match[2]}-${match[3]}`
    }

    const parsed = new Date(text)
    if (Number.isFinite(parsed.getTime()) && /[T:]/.test(text)) {
      return [
        parsed.getFullYear(),
        String(parsed.getMonth() + 1).padStart(2, '0'),
        String(parsed.getDate()).padStart(2, '0'),
      ].join('-')
    }

    return null
  }

  function parseMoney(value) {
    if (value == null) return null

    if (typeof value === 'number') {
      return Number.isFinite(value) && value >= 0 ? value : null
    }

    const text = String(value)
    const digits = text.replace(/[^\d]/g, '')
    if (!digits) return null

    const parsed = Number(digits)
    return Number.isFinite(parsed) ? parsed : null
  }

  function flatten(
    value,
    prefix = '',
    depth = 0,
    out = [],
    seen = new WeakSet(),
  ) {
    if (depth > 3 || value == null) return out

    if (typeof value !== 'object') {
      out.push({
        path: prefix,
        key: prefix.split('.').at(-1) || '',
        value,
      })
      return out
    }

    if (seen.has(value)) return out
    seen.add(value)

    if (Array.isArray(value)) {
      for (let index = 0; index < Math.min(value.length, 30); index += 1) {
        flatten(
          value[index],
          `${prefix}[${index}]`,
          depth + 1,
          out,
          seen,
        )
      }
      return out
    }

    let entries
    try {
      entries = Object.entries(value).slice(0, 180)
    } catch {
      return out
    }

    for (const [key, child] of entries) {
      const path = prefix ? `${prefix}.${key}` : key

      if (
        child == null ||
        typeof child === 'string' ||
        typeof child === 'number' ||
        typeof child === 'boolean'
      ) {
        out.push({
          path,
          key,
          value: child,
        })
      } else {
        flatten(child, path, depth + 1, out, seen)
      }
    }

    return out
  }

  function routeId(entries) {
    for (const entry of entries) {
      if (typeof entry.value !== 'string') continue

      const match = entry.value.match(
        /\/purchases\/(\d{6,12})/i,
      )

      if (match?.[1]) return match[1]
    }

    return null
  }

  function valueByPath(entries, patterns) {
    for (const pattern of patterns) {
      const exact = entries.find((entry) =>
        pattern.test(entry.path),
      )

      if (exact && exact.value != null) {
        return exact.value
      }
    }

    return null
  }

  function dateFromEntries(entries) {
    const paths = [
      /(?:^|\.)(?:purchasedAt|purchaseDate|purchaseAt)$/i,
      /(?:^|\.)(?:orderedAt|orderDate|orderAt)$/i,
      /(?:^|\.)(?:paymentDate|paidAt)$/i,
      /(?:^|\.)(?:createdAt|createdDate)$/i,
    ]

    for (const pattern of paths) {
      for (const entry of entries) {
        if (!pattern.test(entry.path)) continue

        const date = parseDate(entry.value)
        if (date) return date
      }
    }

    return null
  }

  function idFromEntries(entries) {
    const route = routeId(entries)
    if (route) {
      return {
        orderId: route,
        confidence: 120,
        evidence: 'purchases-route',
      }
    }

    const purchaseId = valueByPath(entries, [
      /(?:^|\.)(?:purchaseId|purchaseID|purchaseNo|purchaseNumber)$/i,
    ])

    const parsedPurchaseId = plausibleId(purchaseId)
    if (parsedPurchaseId) {
      return {
        orderId: parsedPurchaseId,
        confidence: 105,
        evidence: 'purchase-id-field',
      }
    }

    const orderId = valueByPath(entries, [
      /(?:^|\.)(?:orderId|orderID|orderNo|orderNumber)$/i,
    ])

    const parsedOrderId = plausibleId(orderId)
    if (parsedOrderId) {
      return {
        orderId: parsedOrderId,
        confidence: 85,
        evidence: 'order-id-field',
      }
    }

    return null
  }

  function summaryFromObject(object) {
    if (!object || typeof object !== 'object' || Array.isArray(object)) {
      return null
    }

    const entries = flatten(object)
    const id = idFromEntries(entries)

    if (!id) return null

    const purchasedAt = dateFromEntries(entries)

    const title = cleanText(
      valueByPath(entries, [
        /(?:^|\.)(?:title|productTitle|productName|itemName|goodsName)$/i,
      ]),
    )

    const sellerName = cleanText(
      valueByPath(entries, [
        /(?:^|\.)(?:sellerName|sellerNickname|shopName|storeName)$/i,
        /(?:^|\.)(?:seller|shop|store)\.(?:name|nickname)$/i,
      ]),
    )

    const productAmount = parseMoney(
      valueByPath(entries, [
        /(?:^|\.)(?:productAmount|productPrice|itemAmount|itemPrice|salePrice)$/i,
        /(?:^|\.)(?:price)$/i,
      ]),
    )

    const domesticShippingAmount = parseMoney(
      valueByPath(entries, [
        /(?:^|\.)(?:shippingAmount|shippingFee|deliveryFee|deliveryAmount)$/i,
      ]),
    )

    const status = cleanText(
      valueByPath(entries, [
        /(?:^|\.)(?:orderStatus|tradeStatus|purchaseStatus|statusName)$/i,
        /(?:^|\.)(?:status)$/i,
      ]),
    )

    const imageUrl = cleanText(
      valueByPath(entries, [
        /(?:^|\.)(?:thumbnailUrl|imageUrl|productImageUrl|mainImageUrl)$/i,
        /(?:^|\.)(?:thumbnail|image)$/i,
      ]),
    )

    const listingId = cleanText(
      valueByPath(entries, [
        /(?:^|\.)(?:productId|listingId|itemId)$/i,
      ]),
    )

    const fieldCount = [
      purchasedAt,
      title,
      sellerName,
      productAmount,
      status,
      imageUrl,
    ].filter((value) => value !== null && value !== undefined).length

    return {
      ...id,
      summaryScore: id.confidence + fieldCount * 10,
      summary: {
        purchasedAt,
        title,
        sellerName,
        productAmount,
        domesticShippingAmount,
        status,
        imageUrl,
        listingId,
      },
    }
  }

  function collectObjects(
    value,
    out,
    seen = new WeakSet(),
    depth = 0,
  ) {
    if (
      value == null ||
      typeof value !== 'object' ||
      depth > 12 ||
      seen.has(value)
    ) {
      return
    }

    seen.add(value)

    if (!Array.isArray(value)) {
      const candidate = summaryFromObject(value)
      if (candidate) out.push(candidate)
    }

    const children = Array.isArray(value)
      ? value.slice(0, 4000)
      : Object.values(value).slice(0, 4000)

    for (const child of children) {
      if (child && typeof child === 'object') {
        collectObjects(child, out, seen, depth + 1)
      }
    }
  }

  function collectRouteOnlyCandidates(body) {
    const found = []

    for (const match of String(body || '').matchAll(
      /\/purchases\/(\d{6,12})/gi,
    )) {
      found.push({
        orderId: match[1],
        confidence: 120,
        evidence: 'purchases-route-text',
        summaryScore: 120,
        summary: {
          purchasedAt: null,
          title: null,
          sellerName: null,
          productAmount: null,
          domesticShippingAmount: null,
          status: null,
          imageUrl: null,
          listingId: null,
        },
      })
    }

    return found
  }

  function mergeCandidate(map, candidate) {
    const existing = map.get(candidate.orderId)

    if (!existing) {
      map.set(candidate.orderId, candidate)
      return
    }

    const preferred =
      Number(candidate.summaryScore || 0) >
      Number(existing.summaryScore || 0)
        ? candidate
        : existing

    const other = preferred === candidate ? existing : candidate

    map.set(candidate.orderId, {
      ...other,
      ...preferred,
      confidence: Math.max(
        Number(existing.confidence || 0),
        Number(candidate.confidence || 0),
      ),
      summaryScore: Math.max(
        Number(existing.summaryScore || 0),
        Number(candidate.summaryScore || 0),
      ),
      summary: {
        ...(other.summary || {}),
        ...(preferred.summary || {}),
        purchasedAt:
          preferred.summary?.purchasedAt ||
          other.summary?.purchasedAt ||
          null,
        title:
          preferred.summary?.title ||
          other.summary?.title ||
          null,
        sellerName:
          preferred.summary?.sellerName ||
          other.summary?.sellerName ||
          null,
        productAmount:
          preferred.summary?.productAmount ??
          other.summary?.productAmount ??
          null,
        domesticShippingAmount:
          preferred.summary?.domesticShippingAmount ??
          other.summary?.domesticShippingAmount ??
          null,
        status:
          preferred.summary?.status ||
          other.summary?.status ||
          null,
        imageUrl:
          preferred.summary?.imageUrl ||
          other.summary?.imageUrl ||
          null,
        listingId:
          preferred.summary?.listingId ||
          other.summary?.listingId ||
          null,
      },
    })
  }

  function extractCandidates(body) {
    const map = new Map()

    for (const candidate of collectRouteOnlyCandidates(body)) {
      mergeCandidate(map, candidate)
    }

    try {
      const parsed = JSON.parse(body)
      const objects = []
      collectObjects(parsed, objects)

      for (const candidate of objects) {
        mergeCandidate(map, candidate)
      }
    } catch {
      // Non-JSON response: route extraction above is still useful.
    }

    return [...map.values()]
  }

  async function flush() {
    flushTimer = null
    if (!pending.size) return

    const batch = [...pending.values()]
    pending.clear()

    const stored = await chrome.storage.local.get(STORAGE_KEY)
    const current =
      stored?.[STORAGE_KEY] &&
      typeof stored[STORAGE_KEY] === 'object'
        ? stored[STORAGE_KEY]
        : { orders: {} }

    const orders =
      current.orders && typeof current.orders === 'object'
        ? current.orders
        : {}

    for (const candidate of batch) {
      const previous = orders[candidate.orderId] || {}
      const previousSummary = previous.summary || {}
      const nextSummary = candidate.summary || {}

      const candidateBetter =
        Number(candidate.summaryScore || 0) >=
        Number(previous.summaryScore || 0)

      orders[candidate.orderId] = {
        ...previous,
        orderId: candidate.orderId,
        confidence: Math.max(
          Number(previous.confidence || 0),
          Number(candidate.confidence || 0),
        ),
        evidence: candidateBetter
          ? candidate.evidence
          : previous.evidence || candidate.evidence,
        summaryScore: Math.max(
          Number(previous.summaryScore || 0),
          Number(candidate.summaryScore || 0),
        ),
        summary: {
          ...previousSummary,
          ...nextSummary,
          purchasedAt:
            nextSummary.purchasedAt ||
            previousSummary.purchasedAt ||
            null,
          title:
            nextSummary.title ||
            previousSummary.title ||
            null,
          sellerName:
            nextSummary.sellerName ||
            previousSummary.sellerName ||
            null,
          productAmount:
            nextSummary.productAmount ??
            previousSummary.productAmount ??
            null,
          domesticShippingAmount:
            nextSummary.domesticShippingAmount ??
            previousSummary.domesticShippingAmount ??
            null,
          status:
            nextSummary.status ||
            previousSummary.status ||
            null,
          imageUrl:
            nextSummary.imageUrl ||
            previousSummary.imageUrl ||
            null,
          listingId:
            nextSummary.listingId ||
            previousSummary.listingId ||
            null,
        },
        lastSeenAt: candidate.capturedAt,
        sourceUrl:
          candidate.url ||
          previous.sourceUrl ||
          null,
      }
    }

    await chrome.storage.local.set({
      [STORAGE_KEY]: {
        orders,
        updatedAt: new Date().toISOString(),
      },
    })
  }

  function scheduleFlush() {
    if (flushTimer) return

    flushTimer = setTimeout(() => {
      void flush()
    }, 160)
  }

  window.addEventListener('message', (event) => {
    const data = event.data

    if (
      event.source !== window ||
      !data ||
      data.source !== SOURCE ||
      data.type !== 'response' ||
      typeof data.body !== 'string'
    ) {
      return
    }

    const candidates = extractCandidates(data.body)

    for (const candidate of candidates) {
      const next = {
        ...candidate,
        capturedAt:
          data.capturedAt ||
          new Date().toISOString(),
        url: data.url || '',
      }

      const previous = pending.get(candidate.orderId)

      if (
        !previous ||
        Number(next.summaryScore || 0) >=
          Number(previous.summaryScore || 0)
      ) {
        pending.set(candidate.orderId, next)
      }
    }

    scheduleFlush()
  })

  chrome.runtime.onMessage.addListener(
    (message, _sender, sendResponse) => {
      if (
        message?.type !==
        'cardcargo-bunjang-capture-ping'
      ) {
        return undefined
      }

      sendResponse({
        ok: true,
        version: 75,
      })

      return true
    },
  )

  window.postMessage(
    {
      source: SOURCE,
      type: 'bridge-ready',
    },
    '*',
  )
})()
