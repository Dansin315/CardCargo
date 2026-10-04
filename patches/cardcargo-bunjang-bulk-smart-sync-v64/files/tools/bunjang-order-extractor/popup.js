const smartButton = document.getElementById('smart')
const fullButton = document.getElementById('full')
const resetButton = document.getElementById('reset')
const status = document.getElementById('status')
const summary = document.getElementById('summary')

const STORAGE_KEY = 'cardcargoBunjangSmartSyncV1'
const ORDER_RE = /\/purchases\/(\d+)/i
const MAX_ORDERS = 500
const CHUNK_SIZE = 5

function setBusy(busy) {
  smartButton.disabled = busy
  fullButton.disabled = busy
  resetButton.disabled = busy
}

function renderSummary(entries) {
  summary.replaceChildren()

  for (const [label, value] of entries) {
    const left = document.createElement('span')
    left.textContent = label
    const right = document.createElement('strong')
    right.textContent = String(value)
    summary.append(left, right)
  }

  summary.hidden = entries.length === 0
}

async function getActiveBunjangTab() {
  const [tab] = await chrome.tabs.query({
    active: true,
    currentWindow: true,
  })

  if (!tab?.id || !tab.url) {
    throw new Error('Kein aktiver Tab gefunden.')
  }

  const url = new URL(tab.url)
  if (url.hostname !== 'order.bunjang.co.kr') {
    throw new Error(
      'Bitte zuerst die Bunjang-Kaufübersicht unter order.bunjang.co.kr öffnen.',
    )
  }

  return tab
}

async function readState() {
  const stored = await chrome.storage.local.get(STORAGE_KEY)
  const value = stored?.[STORAGE_KEY]

  if (!value || typeof value !== 'object') {
    return { orders: {} }
  }

  return {
    orders:
      value.orders && typeof value.orders === 'object'
        ? value.orders
        : {},
  }
}

async function writeState(state) {
  await chrome.storage.local.set({
    [STORAGE_KEY]: state,
  })
}

async function scanOrderLinks(tabId) {
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId },
    func: async (maxOrders) => {
      const ORDER_RE_IN_PAGE = /\/purchases\/(\d+)/i

      const sleep = (ms) =>
        new Promise((resolve) => setTimeout(resolve, ms))

      function collect() {
        const found = new Map()

        for (const element of document.querySelectorAll(
          'a[href], [data-href], [data-url]',
        )) {
          const rawValues = [
            element.getAttribute('href'),
            element.getAttribute('data-href'),
            element.getAttribute('data-url'),
          ].filter(Boolean)

          for (const rawValue of rawValues) {
            try {
              const absolute = new URL(rawValue, location.origin).href
              const match = absolute.match(ORDER_RE_IN_PAGE)
              if (match?.[1]) {
                found.set(
                  match[1],
                  `https://order.bunjang.co.kr/purchases/${match[1]}`,
                )
              }
            } catch {
              // Ignore malformed links.
            }
          }
        }

        const html = document.documentElement?.innerHTML || ''
        for (const match of html.matchAll(/\/purchases\/(\d+)/g)) {
          const orderId = match[1]
          if (orderId) {
            found.set(
              orderId,
              `https://order.bunjang.co.kr/purchases/${orderId}`,
            )
          }
        }

        const current = location.href.match(ORDER_RE_IN_PAGE)
        if (current?.[1]) {
          found.set(
            current[1],
            `https://order.bunjang.co.kr/purchases/${current[1]}`,
          )
        }

        return found
      }

      function clickMoreButtons() {
        const labels = [
          '더보기',
          '더 보기',
          '더 불러오기',
          'more',
          'load more',
        ]

        let clicked = false
        for (const button of document.querySelectorAll(
          'button, [role="button"]',
        )) {
          const text = String(
            button.innerText || button.textContent || '',
          ).trim().toLowerCase()

          if (!text) continue
          if (!labels.some((label) => text.includes(label.toLowerCase()))) {
            continue
          }

          const rect = button.getBoundingClientRect()
          if (rect.width <= 0 || rect.height <= 0) continue

          try {
            button.click()
            clicked = true
          } catch {
            // Ignore.
          }
        }

        return clicked
      }

      const initialY = window.scrollY
      let stableRounds = 0
      let lastCount = collect().size

      for (let round = 0; round < 80; round += 1) {
        if (lastCount >= maxOrders) break

        clickMoreButtons()
        window.scrollTo({
          top: document.documentElement.scrollHeight,
          behavior: 'auto',
        })

        await sleep(700)

        const nextCount = collect().size
        const atBottom =
          window.innerHeight + window.scrollY >=
          document.documentElement.scrollHeight - 20

        if (nextCount === lastCount && atBottom) {
          stableRounds += 1
        } else {
          stableRounds = 0
        }

        lastCount = nextCount

        if (stableRounds >= 4) break
      }

      const found = collect()

      window.scrollTo({
        top: initialY,
        behavior: 'auto',
      })

      return [...found.entries()]
        .slice(0, maxOrders)
        .map(([orderId, orderUrl]) => ({
          orderId,
          orderUrl,
        }))
    },
    args: [MAX_ORDERS],
  })

  return Array.isArray(result) ? result : []
}

async function fetchOrderChunk(tabId, orders) {
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId },
    func: async (targets) => {
      function textFromDocument(doc) {
        return String(
          doc.body?.innerText || doc.body?.textContent || '',
        )
          .replace(/\u00a0/g, ' ')
          .trim()
      }

      function extrasFromDocument(doc) {
        const productUrls = [
          ...doc.querySelectorAll('a[href]'),
        ]
          .map((anchor) => anchor.href)
          .filter((href) => /\/products?\/\d+/i.test(href))
          .slice(0, 12)

        const imageUrls = [...doc.querySelectorAll('img')]
          .map((img) => img.currentSrc || img.src || '')
          .filter((src) => /^https?:\/\//i.test(src))
          .slice(0, 12)

        return {
          productUrls,
          imageUrls,
        }
      }

      async function fetchOne(target) {
        try {
          const currentOrderMatch = location.href.match(
            /\/purchases\/(\d+)/i,
          )

          if (currentOrderMatch?.[1] === target.orderId) {
            return {
              orderId: target.orderId,
              orderUrl: target.orderUrl,
              text: textFromDocument(document),
              ...extrasFromDocument(document),
              warning: null,
            }
          }

          const response = await fetch(target.orderUrl, {
            credentials: 'include',
            cache: 'no-store',
          })

          if (!response.ok) {
            return {
              orderId: target.orderId,
              orderUrl: target.orderUrl,
              text: '',
              productUrls: [],
              imageUrls: [],
              warning: `Detailseite HTTP ${response.status}`,
            }
          }

          const html = await response.text()
          const doc = new DOMParser().parseFromString(
            html,
            'text/html',
          )

          const text = textFromDocument(doc)
          return {
            orderId: target.orderId,
            orderUrl: target.orderUrl,
            text,
            ...extrasFromDocument(doc),
            warning:
              text.includes('주문번호') ||
              text.includes('운송장')
                ? null
                : 'Detailseite enthielt noch keine gerenderten Bestelldaten.',
          }
        } catch (error) {
          return {
            orderId: target.orderId,
            orderUrl: target.orderUrl,
            text: '',
            productUrls: [],
            imageUrls: [],
            warning:
              error instanceof Error
                ? error.message
                : 'Bestelldetail konnte nicht geladen werden.',
          }
        }
      }

      return Promise.all(targets.map(fetchOne))
    },
    args: [orders],
  })

  return Array.isArray(result) ? result : []
}

function trackingFound(text) {
  const value = String(text || '')
  if (!value.includes('운송장')) return false

  const normalized = value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

  const labelIndex = normalized.findIndex((line) =>
    line.startsWith('운송장'),
  )

  if (labelIndex < 0) return false

  for (
    let index = labelIndex;
    index <= Math.min(labelIndex + 4, normalized.length - 1);
    index += 1
  ) {
    const compact = normalized[index].replace(/[\s-]/g, '')
    if (/\d{8,16}/.test(compact)) {
      return true
    }
  }

  return false
}

async function runSync(mode) {
  setBusy(true)
  summary.hidden = true

  try {
    const tab = await getActiveBunjangTab()

    status.textContent =
      'Scanne Kaufübersicht und lade bei Bedarf automatisch weitere Bestellungen …'

    const discovered = await scanOrderLinks(tab.id)
    if (!discovered.length) {
      throw new Error(
        'Keine Bunjang-Bestellungen gefunden. Scrolle die Kaufübersicht einmal manuell an und versuche es erneut.',
      )
    }

    const state = await readState()
    const knownOrders = state.orders || {}

    const targets =
      mode === 'full'
        ? discovered
        : discovered.filter(({ orderId }) => {
            const known = knownOrders[orderId]
            return !known || known.trackingFound !== true
          })

    const skippedComplete =
      discovered.length - targets.length

    renderSummary([
      ['Bestellungen gefunden', discovered.length],
      ['Zu prüfen', targets.length],
      ['Bereits mit Tracking', skippedComplete],
    ])

    if (!targets.length) {
      status.textContent =
        'Smart Sync abgeschlossen: Alle gefundenen Bestellungen besitzen laut lokalem Sync-Stand bereits Trackingdaten.'
      return
    }

    const orders = []
    let completed = 0

    for (
      let offset = 0;
      offset < targets.length;
      offset += CHUNK_SIZE
    ) {
      const chunk = targets.slice(
        offset,
        offset + CHUNK_SIZE,
      )

      status.textContent =
        `Lade Bestelldetails …\n` +
        `${completed}/${targets.length} abgeschlossen`

      const chunkResults = await fetchOrderChunk(
        tab.id,
        chunk,
      )

      orders.push(...chunkResults)
      completed += chunk.length

      const now = new Date().toISOString()
      for (const order of chunkResults) {
        const hasTracking = trackingFound(order.text)
        knownOrders[order.orderId] = {
          trackingFound: hasTracking,
          lastCheckedAt: now,
          lastWarning: order.warning || null,
        }
      }

      await writeState({
        orders: knownOrders,
      })
    }

    const withTracking = orders.filter((order) =>
      trackingFound(order.text),
    ).length
    const withoutTracking = orders.filter(
      (order) =>
        !trackingFound(order.text) &&
        !order.warning,
    ).length
    const errors = orders.filter(
      (order) => Boolean(order.warning),
    ).length

    const payload = {
      source: 'cardcargo-bunjang-order-extractor',
      version: 3,
      mode,
      capturedAt: new Date().toISOString(),
      pageUrl: tab.url,
      discovery: {
        found: discovered.length,
        requested: targets.length,
        skippedComplete,
      },
      orders,
    }

    await navigator.clipboard.writeText(
      JSON.stringify(payload, null, 2),
    )

    status.textContent =
      'Batch-Sync vorbereitet. Das gesamte JSON wurde einmalig in die Zwischenablage kopiert.\n' +
      'Jetzt in CardCargo → Bunjang Bestellungen synchronisieren → Aus Zwischenablage einlesen.'

    renderSummary([
      ['Historie gefunden', discovered.length],
      ['Detailseiten geladen', orders.length],
      ['Mit Tracking', withTracking],
      ['Noch ohne Tracking', withoutTracking],
      ['Fehler', errors],
      ['Beim Smart Sync übersprungen', skippedComplete],
    ])
  } catch (error) {
    status.textContent =
      error instanceof Error
        ? error.message
        : 'Bunjang Bulk Sync fehlgeschlagen.'
  } finally {
    setBusy(false)
  }
}

smartButton.addEventListener('click', () => {
  void runSync('smart')
})

fullButton.addEventListener('click', () => {
  void runSync('full')
})

resetButton.addEventListener('click', async () => {
  const confirmed = confirm(
    'Lokalen Bunjang-Sync-Stand wirklich zurücksetzen?\n\n' +
      'Beim nächsten Smart Sync werden danach wieder alle gefundenen Bestellungen geprüft.',
  )

  if (!confirmed) return

  await chrome.storage.local.remove(STORAGE_KEY)
  status.textContent =
    'Lokaler Sync-Stand wurde zurückgesetzt.'
  renderSummary([])
})
