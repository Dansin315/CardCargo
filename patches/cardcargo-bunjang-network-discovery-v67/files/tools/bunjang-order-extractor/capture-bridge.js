(() => {
  const SOURCE = 'cardcargo-bunjang-network-v67'
  const STORAGE_KEY = 'cardcargoBunjangNetworkCaptureV67'
  const pending = new Map()
  let flushTimer = null

  function plausibleOrderId(value) {
    const text = String(value ?? '').trim()
    if (!/^\d{6,12}$/.test(text)) return null

    const number = Number(text)
    if (!Number.isSafeInteger(number) || number < 100000) return null

    return text
  }

  function collectFromText(text, found) {
    const value = String(text || '')

    for (const match of value.matchAll(/\/purchases\/(\d{6,12})/gi)) {
      const id = plausibleOrderId(match[1])
      if (id) found.add(id)
    }

    for (const match of value.matchAll(
      /"(?:purchase|order)(?:Id|ID|No|NO|Number|number)"\s*:\s*"?(\d{6,12})"?/gi,
    )) {
      const id = plausibleOrderId(match[1])
      if (id) found.add(id)
    }

    for (const match of value.matchAll(
      /"(?:id|no|number)(?:Purchase|Order)"\s*:\s*"?(\d{6,12})"?/gi,
    )) {
      const id = plausibleOrderId(match[1])
      if (id) found.add(id)
    }
  }

  function walk(value, found, seen, keyHint = '', depth = 0) {
    if (depth > 8 || value == null) return

    if (typeof value === 'string') {
      collectFromText(value, found)

      if (
        /(purchase|order).*(id|no|number)|(id|no|number).*(purchase|order)/i.test(
          keyHint,
        )
      ) {
        const id = plausibleOrderId(value)
        if (id) found.add(id)
      }

      return
    }

    if (typeof value === 'number') {
      if (
        /(purchase|order).*(id|no|number)|(id|no|number).*(purchase|order)/i.test(
          keyHint,
        )
      ) {
        const id = plausibleOrderId(value)
        if (id) found.add(id)
      }
      return
    }

    if (typeof value !== 'object') return
    if (seen.has(value)) return
    seen.add(value)

    if (Array.isArray(value)) {
      for (const child of value.slice(0, 2000)) {
        walk(child, found, seen, keyHint, depth + 1)
      }
      return
    }

    let entries
    try {
      entries = Object.entries(value).slice(0, 3000)
    } catch {
      return
    }

    for (const [key, child] of entries) {
      walk(child, found, seen, key, depth + 1)
    }
  }

  function extractOrderIds(body) {
    const found = new Set()
    collectFromText(body, found)

    try {
      const parsed = JSON.parse(body)
      walk(parsed, found, new WeakSet())
    } catch {
      // Some responses are HTML/text; regex discovery still works.
    }

    return [...found]
  }

  async function flush() {
    flushTimer = null
    if (!pending.size) return

    const batch = [...pending.entries()]
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

    for (const [orderId, info] of batch) {
      const previous = orders[orderId] || {}
      orders[orderId] = {
        ...previous,
        orderId,
        lastSeenAt: info.capturedAt,
        sourceUrl: info.url || previous.sourceUrl || null,
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
    }, 250)
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

    const orderIds = extractOrderIds(data.body)
    if (!orderIds.length) return

    for (const orderId of orderIds) {
      pending.set(orderId, {
        capturedAt: data.capturedAt || new Date().toISOString(),
        url: data.url || '',
      })
    }

    scheduleFlush()
  })

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== 'cardcargo-bunjang-capture-ping') {
      return undefined
    }

    sendResponse({
      ok: true,
      version: 67,
    })
    return true
  })

  window.postMessage(
    {
      source: SOURCE,
      type: 'bridge-ready',
    },
    '*',
  )
})()
