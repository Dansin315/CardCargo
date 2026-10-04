(() => {
  const SOURCE = 'cardcargo-bunjang-network-v67'
  const STORAGE_KEY = 'cardcargoBunjangNetworkCaptureV70'
  const pending = new Map()
  let flushTimer = null

  function plausibleId(value) {
    const text = String(value ?? '').trim()
    if (!/^\d{6,12}$/.test(text)) return null
    const number = Number(text)
    if (!Number.isSafeInteger(number) || number < 100000) return null
    return text
  }

  function add(found, value, score, evidence) {
    const id = plausibleId(value)
    if (!id) return
    const previous = found.get(id)
    if (!previous || score > previous.score) {
      found.set(id, { orderId: id, score, evidence })
    }
  }

  function collectRoutes(text, found) {
    for (const match of String(text || '').matchAll(/\/purchases\/(\d{6,12})/gi)) {
      add(found, match[1], 100, 'purchases-route')
    }
  }

  function walk(value, found, seen, keyHint = '', depth = 0) {
    if (depth > 8 || value == null) return

    if (typeof value === 'string') {
      collectRoutes(value, found)
      const key = String(keyHint || '')
      if (/^purchase(?:Id|ID|No|NO|Number|number)$/i.test(key)) {
        add(found, value, 95, key)
      } else if (/^order(?:Id|ID|No|NO|Number|number)$/i.test(key)) {
        add(found, value, 80, key)
      }
      return
    }

    if (typeof value === 'number') {
      const key = String(keyHint || '')
      if (/^purchase(?:Id|ID|No|NO|Number|number)$/i.test(key)) {
        add(found, value, 95, key)
      } else if (/^order(?:Id|ID|No|NO|Number|number)$/i.test(key)) {
        add(found, value, 80, key)
      }
      return
    }

    if (typeof value !== 'object') return
    if (seen.has(value)) return
    seen.add(value)

    if (Array.isArray(value)) {
      for (const child of value.slice(0, 2500)) walk(child, found, seen, keyHint, depth + 1)
      return
    }

    let entries
    try { entries = Object.entries(value).slice(0, 3500) } catch { return }
    for (const [key, child] of entries) walk(child, found, seen, key, depth + 1)
  }

  function extractCandidates(body) {
    const found = new Map()
    collectRoutes(body, found)
    try {
      const parsed = JSON.parse(body)
      walk(parsed, found, new WeakSet())
    } catch {
      // Text/HTML is still covered by route extraction.
    }
    return [...found.values()]
  }

  async function flush() {
    flushTimer = null
    if (!pending.size) return
    const batch = [...pending.values()]
    pending.clear()

    const stored = await chrome.storage.local.get(STORAGE_KEY)
    const current = stored?.[STORAGE_KEY] && typeof stored[STORAGE_KEY] === 'object'
      ? stored[STORAGE_KEY]
      : { orders: {} }
    const orders = current.orders && typeof current.orders === 'object' ? current.orders : {}

    for (const candidate of batch) {
      const previous = orders[candidate.orderId] || {}
      const previousConfidence = Number(previous.confidence || 0)
      orders[candidate.orderId] = {
        ...previous,
        orderId: candidate.orderId,
        confidence: Math.max(previousConfidence, Number(candidate.score || 0)),
        evidence:
          Number(candidate.score || 0) >= previousConfidence
            ? candidate.evidence
            : previous.evidence || null,
        lastSeenAt: candidate.capturedAt,
        sourceUrl: candidate.url || previous.sourceUrl || null,
      }
    }

    await chrome.storage.local.set({
      [STORAGE_KEY]: { orders, updatedAt: new Date().toISOString() },
    })
  }

  function scheduleFlush() {
    if (flushTimer) return
    flushTimer = setTimeout(() => void flush(), 200)
  }

  window.addEventListener('message', (event) => {
    const data = event.data
    if (
      event.source !== window ||
      !data ||
      data.source !== SOURCE ||
      data.type !== 'response' ||
      typeof data.body !== 'string'
    ) return

    const candidates = extractCandidates(data.body)
    if (!candidates.length) return

    for (const candidate of candidates) {
      const next = {
        ...candidate,
        capturedAt: data.capturedAt || new Date().toISOString(),
        url: data.url || '',
      }
      const previous = pending.get(candidate.orderId)
      if (!previous || next.score > previous.score) pending.set(candidate.orderId, next)
    }
    scheduleFlush()
  })

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== 'cardcargo-bunjang-capture-ping') return undefined
    sendResponse({ ok: true, version: 70 })
    return true
  })

  window.postMessage({ source: SOURCE, type: 'bridge-ready' }, '*')
})()
