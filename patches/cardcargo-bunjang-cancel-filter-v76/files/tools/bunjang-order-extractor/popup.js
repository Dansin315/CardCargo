const smartButton = document.getElementById('smart')
const fullButton = document.getElementById('full')
const pauseButton = document.getElementById('pause')
const stopButton = document.getElementById('stop')
const resetButton = document.getElementById('reset')
const exportPartialButton = document.getElementById('exportPartial')
const dateFromInput = document.getElementById('dateFrom')
const dateToInput = document.getElementById('dateTo')
const last7Button = document.getElementById('last7')
const slowFallbackInput = document.getElementById('slowFallback')
const status = document.getElementById('status')
const summary = document.getElementById('summary')

const SYNC_KEY = 'cardcargoBunjangSmartSyncV1'
const CAPTURE_KEY = 'cardcargoBunjangNetworkCaptureV75'
const PARTIAL_EXPORT_KEY = 'cardcargoBunjangPartialExportV70'
const MAX_SCROLL_ROUNDS = 80
const DETAIL_RENDER_TIMEOUT = 12000
const DATE_FILTER_KEY = 'cardcargoBunjangDateFilterV72'

let running = false
let paused = false
let stopRequested = false

let currentRun = {
  mode: null,
  tab: null,
  discovered: [],
  targets: [],
  skipped: 0,
  orders: [],
  outsideRange: 0,
  checkedDetails: 0,
}

let lastExportPayload = null
let currentDateRange = {
  from: null,
  to: null,
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}




function normalizedOrderStatus(value) {
  return String(value || '')
    .normalize('NFKC')
    .replace(/\s+/g, '')
    .trim()
}

function isFinalCancelledStatus(value) {
  const status = normalizedOrderStatus(value)
  if (!status) return false

  // Final cancellation/refund states only. A mere request such as
  // "취소 요청" is intentionally NOT treated as completed cancellation.
  return (
    status.includes('거래취소완료') ||
    status.includes('주문취소완료') ||
    status.includes('결제취소완료') ||
    status.includes('취소처리완료') ||
    status.includes('환불완료') ||
    status.includes('환불처리완료') ||
    status === '거래취소' ||
    status === '주문취소' ||
    status === '결제취소' ||
    status === '취소완료'
  )
}

function localIsoDate(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function defaultLast7Days() {
  const today = new Date()
  const from = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate() - 6,
  )

  return {
    from: localIsoDate(from),
    to: localIsoDate(today),
  }
}

function normalizeDateValue(value) {
  const text = String(value || '').trim()
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null
}

function compareIsoDates(left, right) {
  return String(left).localeCompare(String(right))
}

function inDateRange(date, range = currentDateRange) {
  if (!date) return false

  const normalized = normalizeDateValue(date)
  if (!normalized) return false

  if (range.from && compareIsoDates(normalized, range.from) < 0) {
    return false
  }

  if (range.to && compareIsoDates(normalized, range.to) > 0) {
    return false
  }

  return true
}

function validateDateRange() {
  const from = normalizeDateValue(dateFromInput.value)
  const to = normalizeDateValue(dateToInput.value)

  if (!from || !to) {
    throw new Error('Bitte ein gültiges Von- und Bis-Datum auswählen.')
  }

  if (compareIsoDates(from, to) > 0) {
    throw new Error('Das Von-Datum darf nicht nach dem Bis-Datum liegen.')
  }

  return { from, to }
}

async function saveDateRange(range) {
  currentDateRange = range

  await chrome.storage.local.set({
    [DATE_FILTER_KEY]: range,
  })
}

async function initializeDateRange() {
  const stored = await chrome.storage.local.get(DATE_FILTER_KEY)
  const saved = stored?.[DATE_FILTER_KEY]

  const range =
    saved &&
    normalizeDateValue(saved.from) &&
    normalizeDateValue(saved.to)
      ? {
          from: saved.from,
          to: saved.to,
        }
      : defaultLast7Days()

  dateFromInput.value = range.from
  dateToInput.value = range.to
  currentDateRange = range
}

async function visibleOverviewDates(tabId) {
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      const text = String(
        document.body?.innerText || document.body?.textContent || '',
      )

      const found = new Set()

      for (const match of text.matchAll(
        /(\d{2,4})년\s*(\d{1,2})월\s*(\d{1,2})일/g,
      )) {
        let year = match[1]
        if (year.length === 2) year = `20${year}`

        found.add(
          `${year}-${String(match[2]).padStart(2, '0')}-${String(match[3]).padStart(2, '0')}`,
        )
      }

      return [...found]
    },
  })

  return Array.isArray(result) ? result : []
}

function summarizeOrders(orders) {
  const trackingCount = orders.filter(
    (order) => order?.extracted?.domesticTrackingNumber,
  ).length
  const priceCount = orders.filter(
    (order) => order?.extracted?.productAmount !== null,
  ).length
  const dateCount = orders.filter(
    (order) => Boolean(order?.extracted?.purchasedAt),
  ).length
  const shippingCount = orders.filter(
    (order) => order?.extracted?.domesticShippingAmount !== null,
  ).length
  const sellerCount = orders.filter(
    (order) => Boolean(order?.extracted?.sellerName),
  ).length
  const errors = orders.filter(
    (order) => Boolean(order?.warning),
  ).length

  return {
    trackingCount,
    priceCount,
    dateCount,
    shippingCount,
    sellerCount,
    errors,
  }
}

function makeExportPayload(reason) {
  if (!currentRun.orders.length || !currentRun.tab) return null

  return {
    source: 'cardcargo-bunjang-order-extractor',
    version: 4.7,
    mode: currentRun.mode,
    partialExport: reason !== 'complete',
    exportReason: reason,
    stoppedEarly: reason === 'stop',
    pausedAtExport: reason === 'pause',
    capturedAt: new Date().toISOString(),
    pageUrl: currentRun.tab.url,
    dateRange: {
      from: currentDateRange.from,
      to: currentDateRange.to,
    },
    discovery: {
      ordersFound: currentRun.discovered.length,
      requested: currentRun.targets.length,
      skippedComplete: currentRun.skipped,
      exportedSoFar: currentRun.orders.length,
    },
    orders: currentRun.orders,
  }
}

async function exportCurrentProgress(reason) {
  let payload = await persistPartialProgress(reason)

  if (!payload) {
    const stored = await chrome.storage.local.get(PARTIAL_EXPORT_KEY)
    const previous = stored?.[PARTIAL_EXPORT_KEY]
    if (previous && Array.isArray(previous.orders) && previous.orders.length) {
      payload = {
        ...previous,
        partialExport: true,
        exportReason: reason,
        stoppedEarly: reason === 'stop',
        pausedAtExport: reason === 'pause',
        capturedAt: new Date().toISOString(),
      }
    }
  }

  if (!payload) return { copied: false, count: 0 }

  await navigator.clipboard.writeText(JSON.stringify(payload, null, 2))
  lastExportPayload = payload
  exportPartialButton.disabled = false

  const stats = summarizeOrders(payload.orders)
  renderSummary([
    ['Exportierte Bestellungen', payload.orders.length],
    ['Warenwert erkannt', stats.priceCount],
    ['Kaufdatum erkannt', stats.dateCount],
    ['Versandkosten erkannt', stats.shippingCount],
    ['Verkäufer erkannt', stats.sellerCount],
    ['Tracking erkannt', stats.trackingCount],
    ['Fehler', stats.errors],
  ])

  return { copied: true, count: payload.orders.length }
}

function setRunState(next) {
  running = next
  smartButton.disabled = next
  fullButton.disabled = next
  resetButton.disabled = next
  exportPartialButton.disabled = next || !lastExportPayload
  pauseButton.disabled = !next
  stopButton.disabled = !next

  if (!next) {
    paused = false
    stopRequested = false
    pauseButton.textContent = 'Pausieren'
  }
}

function renderSummary(rows) {
  summary.replaceChildren()

  for (const [label, value] of rows) {
    const left = document.createElement('span')
    left.textContent = label
    const right = document.createElement('strong')
    right.textContent = String(value)
    summary.append(left, right)
  }

  summary.hidden = rows.length === 0
}

async function waitWhilePaused(phase) {
  while (paused && !stopRequested) {
    status.textContent =
      `Pausiert.\n${phase}\nMit „Fortsetzen“ geht es an derselben Stelle weiter.`
    await sleep(150)
  }
  return !stopRequested
}

async function activeTab() {
  const [tab] = await chrome.tabs.query({
    active: true,
    currentWindow: true,
  })

  if (!tab?.id || !tab.url) {
    throw new Error('Kein aktiver Tab gefunden.')
  }

  if (new URL(tab.url).hostname !== 'order.bunjang.co.kr') {
    throw new Error('Bitte die Bunjang-Kaufübersicht öffnen.')
  }

  return tab
}

async function waitForTabComplete(tabId, timeout = 15000) {
  const started = Date.now()

  while (Date.now() - started < timeout) {
    if (stopRequested) return
    const tab = await chrome.tabs.get(tabId)
    if (tab.status === 'complete') return
    await sleep(120)
  }
}

async function ensureCaptureBridge(tab) {
  try {
    const result = await chrome.tabs.sendMessage(tab.id, {
      type: 'cardcargo-bunjang-capture-ping',
    })
    if (result?.ok) return
  } catch {
    // Reload below.
  }

  status.textContent =
    'Aktiviere den Netzwerk-Extractor …\nDie Bunjang-Seite wird einmal neu geladen.'

  await chrome.tabs.reload(tab.id)
  await waitForTabComplete(tab.id)
  await sleep(1000)
}

async function readSyncState() {
  const stored = await chrome.storage.local.get(SYNC_KEY)
  const value = stored?.[SYNC_KEY]

  return {
    orders:
      value?.orders && typeof value.orders === 'object'
        ? value.orders
        : {},
  }
}

async function writeSyncState(state) {
  await chrome.storage.local.set({ [SYNC_KEY]: state })
}

async function capturedOrders() {
  const [captureStored, syncStored] =
    await Promise.all([
      chrome.storage.local.get(CAPTURE_KEY),
      chrome.storage.local.get(SYNC_KEY),
    ])

  const capture = captureStored?.[CAPTURE_KEY]
  const sync = syncStored?.[SYNC_KEY]

  const map =
    capture?.orders &&
    typeof capture.orders === 'object'
      ? capture.orders
      : {}

  const syncOrders =
    sync?.orders &&
    typeof sync.orders === 'object'
      ? sync.orders
      : {}

  return Object.values(map)
    .filter((candidate) => {
      const id = String(
        candidate?.orderId || '',
      )

      if (!/^\d{6,12}$/.test(id)) {
        return false
      }

      if (
        syncOrders[id]?.invalidCandidate === true
      ) {
        return false
      }

      return (
        Number(candidate?.confidence || 0) >= 80
      )
    })
    .map((candidate) => {
      const orderId = String(candidate.orderId)
      const known = syncOrders[orderId] || {}
      const networkSummary =
        candidate.summary || {}

      return {
        orderId,
        orderUrl:
          `https://order.bunjang.co.kr/purchases/${orderId}`,
        confidence:
          Number(candidate.confidence || 0),
        evidence:
          candidate.evidence || null,
        summary: {
          purchasedAt:
            networkSummary.purchasedAt ||
            known.purchasedAt ||
            null,
          title:
            networkSummary.title ||
            known.title ||
            null,
          sellerName:
            networkSummary.sellerName ||
            known.sellerName ||
            null,
          productAmount:
            networkSummary.productAmount ??
            known.productAmount ??
            null,
          domesticShippingAmount:
            networkSummary.domesticShippingAmount ??
            known.domesticShippingAmount ??
            null,
          status:
            networkSummary.status ||
            null,
          imageUrl:
            networkSummary.imageUrl ||
            null,
          listingId:
            networkSummary.listingId ||
            null,
        },
      }
    })
    .sort((a, b) => {
      const left =
        a.summary?.purchasedAt || ''
      const right =
        b.summary?.purchasedAt || ''

      if (left !== right) {
        return right.localeCompare(left)
      }

      return (
        Number(b.confidence || 0) -
        Number(a.confidence || 0)
      )
    })
}
async function directDomOrders(tabId) {
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      const found = new Set()
      const html = document.documentElement?.innerHTML || ''

      for (const match of html.matchAll(/\/purchases\/(\d{6,12})/g)) {
        if (match?.[1]) found.add(match[1])
      }

      return [...found]
    },
  })

  return (Array.isArray(result) ? result : []).map((orderId) => ({
    orderId,
    orderUrl: `https://order.bunjang.co.kr/purchases/${orderId}`,
    confidence: 100,
    evidence: 'dom-purchases-route',
  }))
}

async function scrollOneStep(tabId) {
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId },
    func: async () => {
      const labels = ['더보기', '더 보기', '더 불러오기', 'more', 'load more']

      for (const button of document.querySelectorAll(
        'button, [role="button"]',
      )) {
        const text = String(
          button.innerText || button.textContent || '',
        )
          .trim()
          .toLowerCase()

        if (
          text &&
          labels.some((label) => text.includes(label.toLowerCase()))
        ) {
          const rect = button.getBoundingClientRect()
          if (rect.width > 0 && rect.height > 0) {
            try {
              button.click()
            } catch {
              // Ignore.
            }
          }
        }
      }

      window.scrollTo({
        top: document.documentElement.scrollHeight,
        behavior: 'auto',
      })

      await new Promise((resolve) => setTimeout(resolve, 700))

      return {
        height: document.documentElement.scrollHeight,
        y: window.scrollY,
      }
    },
  })

  return result || {}
}


async function collectOverviewPurchaseCards(tabId, range) {
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId },
    func: (dateFrom, dateTo) => {
      const STATUS_RE =
        /(거래\s*완료|배송\s*완료|배송\s*중|결제\s*완료|배송\s*준비|구매\s*완료|구매확정)/
      const PRICE_RE = /\d[\d,.]*\s*원/
      const DATE_RE = /(\d{2,4})년\s*(\d{1,2})월\s*(\d{1,2})일/

      function clean(value) {
        return String(value || '')
          .replace(/\u00a0/g, ' ')
          .replace(/[ \t]+/g, ' ')
          .replace(/\n{3,}/g, '\n\n')
          .trim()
      }

      function isoDate(match) {
        if (!match) return null
        let year = match[1]
        if (year.length === 2) year = `20${year}`
        return `${year}-${String(match[2]).padStart(2, '0')}-${String(
          match[3],
        ).padStart(2, '0')}`
      }

      function inRange(date) {
        if (!date) return false
        return date >= dateFrom && date <= dateTo
      }

      function hash(value) {
        let result = 0x811c9dc5
        const text = String(value || '')

        for (let index = 0; index < text.length; index += 1) {
          result ^= text.charCodeAt(index)
          result = Math.imul(result, 0x01000193)
        }

        return (result >>> 0).toString(16).padStart(8, '0')
      }

      function rectTop(element) {
        const rect = element.getBoundingClientRect()
        return rect.top + window.scrollY
      }

      const dateMarkers = []

      for (const element of document.querySelectorAll('body *')) {
        if (element.children.length > 4) continue

        const text = clean(element.innerText || element.textContent || '')
        const match = text.match(DATE_RE)

        if (!match || text.length > 80) continue

        const date = isoDate(match)
        if (!date) continue

        const rect = element.getBoundingClientRect()
        if (rect.width <= 0 || rect.height <= 0) continue

        dateMarkers.push({
          date,
          top: rectTop(element),
        })
      }

      dateMarkers.sort((a, b) => a.top - b.top)

      function dateForElement(element) {
        const ownText = clean(element.innerText || element.textContent || '')
        const ownMatch = ownText.match(DATE_RE)

        if (ownMatch) {
          const ownDate = isoDate(ownMatch)
          if (ownDate) return ownDate
        }

        const top = rectTop(element)
        let selected = null

        for (const marker of dateMarkers) {
          if (marker.top <= top + 8) {
            selected = marker.date
          } else {
            break
          }
        }

        return selected
      }

      function imageUrl(element) {
        const image = element.querySelector('img')
        return String(
          image?.currentSrc ||
            image?.src ||
            image?.getAttribute?.('src') ||
            '',
        )
      }

      const raw = []

      for (const element of document.querySelectorAll(
        'article, li, a, button, div',
      )) {
        const rect = element.getBoundingClientRect()
        if (rect.width < 120 || rect.height < 45) continue

        const text = clean(element.innerText || element.textContent || '')

        if (
          text.length < 12 ||
          text.length > 1400 ||
          !STATUS_RE.test(text) ||
          !PRICE_RE.test(text)
        ) {
          continue
        }

        const date = dateForElement(element)
        if (!inRange(date)) continue

        raw.push({
          element,
          text,
          date,
          area: rect.width * rect.height,
        })
      }

      // Keep the smallest meaningful DOM element for each purchase. This
      // avoids v65/v66's 209 nested "cards" for a much smaller real list.
      const minimal = raw.filter((candidate) => {
        return !raw.some(
          (other) =>
            other !== candidate &&
            candidate.element.contains(other.element) &&
            other.area < candidate.area * 0.9,
        )
      })

      minimal.sort(
        (a, b) =>
          rectTop(a.element) - rectTop(b.element) ||
          a.area - b.area,
      )

      const occurrence = new Map()

      return minimal.map((candidate) => {
        const image = imageUrl(candidate.element)
        const normalized = candidate.text
          .normalize('NFKC')
          .toLocaleLowerCase()
          .replace(/\s+/g, '')
        const base = hash(
          `${candidate.date}|${normalized}|${image.split('?')[0]}`,
        )
        const count = occurrence.get(base) || 0
        occurrence.set(base, count + 1)

        return {
          cardKey: `${base}:${count}`,
          date: candidate.date,
          text: candidate.text,
          imageUrl: image || null,
        }
      })
    },
    args: [range.from, range.to],
  })

  return Array.isArray(result) ? result : []
}

async function resolveOverviewCardOrderId(
  overviewUrl,
  card,
) {
  const worker = await chrome.tabs.create({
    url: overviewUrl,
    active: false,
  })

  if (!worker.id) return null

  try {
    await waitForTabComplete(worker.id)

    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: worker.id },
      func: async (targetKey, targetDate) => {
        const STATUS_RE =
          /(거래\s*완료|배송\s*완료|배송\s*중|결제\s*완료|배송\s*준비|구매\s*완료|구매확정)/
        const PRICE_RE = /\d[\d,.]*\s*원/
        const DATE_RE = /(\d{2,4})년\s*(\d{1,2})월\s*(\d{1,2})일/

        function clean(value) {
          return String(value || '')
            .replace(/\u00a0/g, ' ')
            .replace(/[ \t]+/g, ' ')
            .replace(/\n{3,}/g, '\n\n')
            .trim()
        }

        function isoDate(match) {
          if (!match) return null
          let year = match[1]
          if (year.length === 2) year = `20${year}`
          return `${year}-${String(match[2]).padStart(2, '0')}-${String(
            match[3],
          ).padStart(2, '0')}`
        }

        function hash(value) {
          let result = 0x811c9dc5
          const text = String(value || '')

          for (let index = 0; index < text.length; index += 1) {
            result ^= text.charCodeAt(index)
            result = Math.imul(result, 0x01000193)
          }

          return (result >>> 0).toString(16).padStart(8, '0')
        }

        function top(element) {
          return element.getBoundingClientRect().top + window.scrollY
        }

        function dateMarkers() {
          const values = []

          for (const element of document.querySelectorAll('body *')) {
            if (element.children.length > 4) continue
            const text = clean(element.innerText || element.textContent || '')
            const match = text.match(DATE_RE)
            if (!match || text.length > 80) continue

            const date = isoDate(match)
            const rect = element.getBoundingClientRect()
            if (!date || rect.width <= 0 || rect.height <= 0) continue

            values.push({ date, top: top(element) })
          }

          return values.sort((a, b) => a.top - b.top)
        }

        function cards() {
          const markers = dateMarkers()
          const raw = []

          function dateFor(element) {
            const own = clean(element.innerText || element.textContent || '')
            const ownMatch = own.match(DATE_RE)
            if (ownMatch) {
              const date = isoDate(ownMatch)
              if (date) return date
            }

            const y = top(element)
            let selected = null

            for (const marker of markers) {
              if (marker.top <= y + 8) selected = marker.date
              else break
            }

            return selected
          }

          for (const element of document.querySelectorAll(
            'article, li, a, button, div',
          )) {
            const rect = element.getBoundingClientRect()
            if (rect.width < 120 || rect.height < 45) continue

            const text = clean(element.innerText || element.textContent || '')
            if (
              text.length < 12 ||
              text.length > 1400 ||
              !STATUS_RE.test(text) ||
              !PRICE_RE.test(text)
            ) {
              continue
            }

            const date = dateFor(element)
            if (date !== targetDate) continue

            raw.push({
              element,
              text,
              date,
              area: rect.width * rect.height,
            })
          }

          const minimal = raw.filter((candidate) => {
            return !raw.some(
              (other) =>
                other !== candidate &&
                candidate.element.contains(other.element) &&
                other.area < candidate.area * 0.9,
            )
          })

          minimal.sort(
            (a, b) =>
              top(a.element) - top(b.element) ||
              a.area - b.area,
          )

          const occurrence = new Map()

          return minimal.map((candidate) => {
            const image = candidate.element.querySelector('img')
            const imageUrl = String(
              image?.currentSrc ||
                image?.src ||
                image?.getAttribute?.('src') ||
                '',
            )
            const normalized = candidate.text
              .normalize('NFKC')
              .toLocaleLowerCase()
              .replace(/\s+/g, '')
            const base = hash(
              `${candidate.date}|${normalized}|${imageUrl.split('?')[0]}`,
            )
            const count = occurrence.get(base) || 0
            occurrence.set(base, count + 1)

            return {
              element: candidate.element,
              cardKey: `${base}:${count}`,
            }
          })
        }

        function clickable(root) {
          const descendants = [
            root,
            ...root.querySelectorAll('a[href], button, [role="button"]'),
          ]

          for (const element of descendants) {
            if (
              element.tagName === 'A' ||
              element.tagName === 'BUTTON' ||
              element.getAttribute('role') === 'button' ||
              element.hasAttribute('onclick')
            ) {
              return element
            }

            try {
              if (getComputedStyle(element).cursor === 'pointer') {
                return element
              }
            } catch {
              // Ignore.
            }
          }

          let parent = root.parentElement

          for (let depth = 0; depth < 5 && parent; depth += 1) {
            if (
              parent.tagName === 'A' ||
              parent.tagName === 'BUTTON' ||
              parent.getAttribute('role') === 'button' ||
              parent.hasAttribute('onclick')
            ) {
              return parent
            }

            try {
              if (getComputedStyle(parent).cursor === 'pointer') {
                return parent
              }
            } catch {
              // Ignore.
            }

            parent = parent.parentElement
          }

          return root
        }

        for (let round = 0; round < 50; round += 1) {
          const found = cards().find(
            (candidate) => candidate.cardKey === targetKey,
          )

          if (found) {
            const target = clickable(found.element)
            target.scrollIntoView({
              block: 'center',
              behavior: 'auto',
            })

            await new Promise((resolve) => setTimeout(resolve, 120))

            for (const type of [
              'pointerdown',
              'mousedown',
              'pointerup',
              'mouseup',
              'click',
            ]) {
              target.dispatchEvent(
                new MouseEvent(type, {
                  bubbles: true,
                  cancelable: true,
                  view: window,
                }),
              )
            }

            try {
              target.click()
            } catch {
              // Event dispatch above already attempted navigation.
            }

            return true
          }

          window.scrollTo({
            top: document.documentElement.scrollHeight,
            behavior: 'auto',
          })

          await new Promise((resolve) => setTimeout(resolve, 550))
        }

        return false
      },
      args: [card.cardKey, card.date],
    })

    if (!result) return null

    const started = Date.now()

    while (Date.now() - started < 9000) {
      const tab = await chrome.tabs.get(worker.id)
      const match = String(tab.url || '').match(
        /\/purchases\/(\d{6,12})/,
      )

      if (match?.[1]) {
        return {
          orderId: match[1],
          orderUrl: `https://order.bunjang.co.kr/purchases/${match[1]}`,
          confidence: 120,
          evidence: 'overview-card-click',
        }
      }

      await sleep(120)
    }

    return null
  } finally {
    try {
      await chrome.tabs.remove(worker.id)
    } catch {
      // Ignore.
    }
  }
}

async function resolveOverviewCards(
  overviewUrl,
  cards,
) {
  const resolved = []

  for (let index = 0; index < cards.length; index += 1) {
    if (stopRequested) break

    if (
      !(await waitWhilePaused(
        `Kaufkarten: ${index}/${cards.length} Bestellnummern ermittelt.`,
      ))
    ) {
      break
    }

    status.textContent =
      `Ermittle echte Bestellnummer aus sichtbarer Kaufkarte …\n` +
      `${index + 1}/${cards.length} · ${cards[index].date}`

    const order = await resolveOverviewCardOrderId(
      overviewUrl,
      cards[index],
    )

    if (order) resolved.push(order)
  }

  return resolved
}

async function discoverOrders(
  tabId,
  range,
  overviewUrl,
  slowFallback,
) {
  const byId = new Map()
  let overviewCards = []
  let stableRounds = 0
  let previousSignal = ''
  let boundaryRounds = 0

  async function mergeNetwork() {
    const [network, dom] =
      await Promise.all([
        capturedOrders(),
        directDomOrders(tabId),
      ])

    for (const order of network) {
      const previous =
        byId.get(order.orderId)

      const previousHasDate =
        Boolean(previous?.summary?.purchasedAt)
      const nextHasDate =
        Boolean(order?.summary?.purchasedAt)

      if (
        !previous ||
        nextHasDate ||
        !previousHasDate
      ) {
        byId.set(order.orderId, {
          ...previous,
          ...order,
          summary: {
            ...(previous?.summary || {}),
            ...(order.summary || {}),
          },
        })
      }
    }

    for (const order of dom) {
      const previous =
        byId.get(order.orderId)

      byId.set(order.orderId, {
        ...order,
        ...previous,
        confidence: Math.max(
          Number(previous?.confidence || 0),
          Number(order.confidence || 0),
        ),
        summary:
          previous?.summary || {
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
  }

  function stats() {
    const values = [...byId.values()]

    const datedInRange = values.filter(
      (order) =>
        order?.summary?.purchasedAt &&
        inDateRange(
          order.summary.purchasedAt,
          range,
        ),
    )

    const cancelledInRange = datedInRange.filter(
      (order) =>
        isFinalCancelledStatus(
          order?.summary?.status,
        ),
    )

    const inRange = datedInRange.filter(
      (order) =>
        !isFinalCancelledStatus(
          order?.summary?.status,
        ),
    )

    const unknownDate = values.filter(
      (order) =>
        !order?.summary?.purchasedAt,
    )

    return {
      inRange,
      cancelledInRange,
      unknownDate,
      all: values,
    }
  }

  for (
    let round = 0;
    round < MAX_SCROLL_ROUNDS;
    round += 1
  ) {
    if (stopRequested) break

    if (
      !(await waitWhilePaused(
        'Lese Bunjang-Übersichtsdaten …',
      ))
    ) {
      break
    }

    await mergeNetwork()

    const cards =
      await collectOverviewPurchaseCards(
        tabId,
        range,
      )

    if (
      cards.length >
      overviewCards.length
    ) {
      overviewCards = cards
    }

    const current = stats()

    status.textContent =
      `Schnelle Übersichtserkennung …\n` +
      `${current.inRange.length} API-Summaries im Zeitraum · ` +
      `${overviewCards.length} sichtbare Einkäufe · ` +
      `${current.unknownDate.length} Kandidaten ohne Datum`

    const step =
      await scrollOneStep(tabId)

    await sleep(450)
    await mergeNetwork()

    const after = stats()

    const refreshedCards =
      await collectOverviewPurchaseCards(
        tabId,
        range,
      )

    if (
      refreshedCards.length >
      overviewCards.length
    ) {
      overviewCards = refreshedCards
    }

    const visibleDates =
      await visibleOverviewDates(tabId)

    const oldestVisible =
      visibleDates.length
        ? [...visibleDates].sort()[0]
        : null

    const crossedBoundary =
      Boolean(
        oldestVisible &&
        range.from &&
        compareIsoDates(
          oldestVisible,
          range.from,
        ) < 0,
      )

    const signal = [
      after.inRange.length,
      after.unknownDate.length,
      overviewCards.length,
      step.height || 0,
    ].join(':')

    if (signal === previousSignal) {
      stableRounds += 1
    } else {
      stableRounds = 0
    }

    previousSignal = signal

    if (crossedBoundary) {
      boundaryRounds += 1

      // Give the final API response of the boundary block enough time to
      // arrive, but do not open individual purchases.
      await sleep(700)
      await mergeNetwork()

      if (boundaryRounds >= 2) {
        break
      }
    } else {
      boundaryRounds = 0
    }

    if (stableRounds >= 4) {
      break
    }
  }

  await sleep(500)
  await mergeNetwork()

  const finalCards =
    await collectOverviewPurchaseCards(
      tabId,
      range,
    )

  if (
    finalCards.length >
    overviewCards.length
  ) {
    overviewCards = finalCards
  }

  const finalStats = stats()
  const resultById = new Map()

  // Main path: orders whose date is already known from the overview API or
  // from the local detail cache.
  for (const order of finalStats.inRange) {
    resultById.set(order.orderId, order)
  }

  let fallbackOrders = []

  // The expensive card-opening behavior from v74 is now opt-in only.
  if (
    slowFallback &&
    overviewCards.length >
      resultById.size
  ) {
    status.textContent =
      `Langsamer Fallback aktiviert …\n` +
      `${overviewCards.length} sichtbare Einkäufe werden mit ihren echten URLs abgeglichen.`

    fallbackOrders =
      await resolveOverviewCards(
        overviewUrl,
        overviewCards,
      )

    for (const order of fallbackOrders) {
      if (!resultById.has(order.orderId)) {
        resultById.set(order.orderId, {
          ...order,
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
    }
  }

  return {
    orders: [...resultById.values()],
    overviewCards,
    summaryOrdersInRange:
      finalStats.inRange,
    cancelledSummaryOrders:
      finalStats.cancelledInRange,
    unknownDateCandidates:
      finalStats.unknownDate,
    networkCandidates:
      finalStats.all,
    fallbackOrders,
  }
}
async function waitForRenderedOrder(tabId, orderId) {
  const started = Date.now()
  let coreSeenAt = null
  let lastKey = ''
  let stableSamples = 0

  while (Date.now() - started < DETAIL_RENDER_TIMEOUT) {
    if (stopRequested) {
      return { status: 'stopped' }
    }

    if (
      !(await waitWhilePaused(
        `Warte auf vollständige Bestellung #${orderId} …`,
      ))
    ) {
      return { status: 'stopped' }
    }

    try {
      const [{ result }] =
        await chrome.scripting.executeScript({
          target: { tabId },
          func: (expectedOrderId) => {
            const text = String(
              document.body?.innerText ||
                document.body?.textContent ||
                '',
            )
              .replace(/\u00a0/g, ' ')
              .trim()

            const invalid =
              text.includes(
                '주문정보를 조회 할 수 없습니다',
              ) ||
              text.includes(
                '주문정보를 조회할 수 없습니다',
              ) ||
              text.includes(
                '주문 정보를 조회 할 수 없습니다',
              ) ||
              text.includes(
                '주문 정보를 조회할 수 없습니다',
              )

            if (invalid) {
              return {
                status: 'invalid',
                textLength: text.length,
              }
            }

            const core =
              text.includes(
                `주문번호 ${expectedOrderId}`,
              ) ||
              (
                text.includes('주문번호') &&
                text.includes('판매자') &&
                text.includes('결제정보')
              )

            const transactionInfo =
              text.includes('거래정보') &&
              text.includes('거래방법')

            const trackingLabel =
              text.includes('운송장')

            let trackingNumber = null

            if (trackingLabel) {
              const lines = text
                .split(/\r?\n/)
                .map((line) => line.trim())
                .filter(Boolean)

              const index = lines.findIndex(
                (line) =>
                  line.startsWith('운송장'),
              )

              for (
                let offset = 0;
                index >= 0 &&
                offset <= 5 &&
                index + offset < lines.length;
                offset += 1
              ) {
                const compact = lines[
                  index + offset
                ].replace(/[\s-]/g, '')

                if (
                  /^[A-Z0-9]{8,32}$/i.test(
                    compact,
                  ) &&
                  /\d{6,}/.test(compact)
                ) {
                  trackingNumber = compact
                  break
                }
              }
            }

            return {
              status: core ? 'core' : 'waiting',
              textLength: text.length,
              transactionInfo,
              trackingLabel,
              trackingNumber,
              key: [
                text.length,
                transactionInfo ? 1 : 0,
                trackingLabel ? 1 : 0,
                trackingNumber || '',
              ].join(':'),
            }
          },
          args: [orderId],
        })

      if (result?.status === 'invalid') {
        return result
      }

      if (result?.status === 'core') {
        if (coreSeenAt === null) {
          coreSeenAt = Date.now()
        }

        if (result.key === lastKey) {
          stableSamples += 1
        } else {
          lastKey = result.key
          stableSamples = 1
        }

        const coreAge =
          Date.now() - coreSeenAt

        // If a tracking label appears, explicitly wait for the block to settle.
        if (
          result.trackingLabel &&
          stableSamples >= 3 &&
          coreAge >= 900
        ) {
          return {
            status: 'valid',
            renderWaitMs:
              Date.now() - started,
            transactionInfo:
              result.transactionInfo,
            trackingLabel:
              result.trackingLabel,
            trackingNumber:
              result.trackingNumber,
          }
        }

        // Some orders legitimately have no tracking label. Only conclude that
        // after the transaction block is stable for substantially longer.
        if (
          result.transactionInfo &&
          stableSamples >= 5 &&
          coreAge >= 2200
        ) {
          return {
            status: 'valid',
            renderWaitMs:
              Date.now() - started,
            transactionInfo:
              result.transactionInfo,
            trackingLabel:
              result.trackingLabel,
            trackingNumber:
              result.trackingNumber,
          }
        }
      }
    } catch {
      // Tab may still be navigating/rendering.
    }

    await sleep(220)
  }

  return {
    status: 'timeout',
    renderWaitMs: Date.now() - started,
  }
}

async function extractRenderedDetail(tabId, order) {
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId },
    func: (expectedOrderId, orderUrl) => {
      function lines(value) {
        return String(value || '')
          .replace(/\u00a0/g, ' ')
          .split(/\r?\n/)
          .map((line) => line.replace(/[ \t]+/g, ' ').trim())
          .filter(Boolean)
      }

      function afterLabel(all, label) {
        const index = all.findIndex(
          (line) =>
            line === label ||
            line.startsWith(`${label} `) ||
            line.startsWith(`${label}:`) ||
            line.startsWith(`${label}：`),
        )

        if (index < 0) return null

        const inline = all[index]
          .slice(label.length)
          .trim()
          .replace(/^[:：]\s*/, '')

        return inline || all[index + 1] || null
      }

      function won(value) {
        if (!value) return null
        const parsed = Number(String(value).replace(/[^\d]/g, ''))
        return Number.isFinite(parsed) ? parsed : null
      }

      function tracking(all) {
        const index = all.findIndex((line) => line.startsWith('운송장'))
        if (index < 0) return { carrier: null, trackingNumber: null }

        const inline = all[index]
          .slice('운송장'.length)
          .trim()
          .replace(/^[:：]\s*/, '')

        if (inline) {
          const match = inline.match(/^(.+?)\s+([A-Z0-9 -]{8,32})$/i)
          if (match?.[2]) {
            return {
              carrier: match[1].trim(),
              trackingNumber: match[2].replace(/[\s-]/g, ''),
            }
          }
        }

        const carrier = inline || all[index + 1] || null

        for (let offset = inline ? 1 : 2; offset <= 4; offset += 1) {
          const candidate = all[index + offset]
          if (!candidate) continue

          const compact = candidate.replace(/[\s-]/g, '')
          if (/^[A-Z0-9]{8,32}$/i.test(compact) && /\d{6,}/.test(compact)) {
            return {
              carrier:
                offset > 1
                  ? all[index + offset - 1] || carrier
                  : carrier,
              trackingNumber: compact,
            }
          }
        }

        return { carrier, trackingNumber: null }
      }

      function orderDateTime(text) {
        const normalized = text.replace(/\s+/g, ' ')
        const match = normalized.match(
          new RegExp(
            `주문번호\\s*${expectedOrderId}\\s*(\\d{2,4})년\\s*(\\d{1,2})월\\s*(\\d{1,2})일\\s*(\\d{1,2}):(\\d{2})`,
          ),
        )

        if (!match) return { purchasedAt: null, orderedAt: null }

        const year = match[1].length === 2 ? `20${match[1]}` : match[1]
        const month = match[2].padStart(2, '0')
        const day = match[3].padStart(2, '0')
        const hour = match[4].padStart(2, '0')
        const minute = match[5].padStart(2, '0')

        return {
          purchasedAt: `${year}-${month}-${day}`,
          orderedAt: `${year}-${month}-${day}T${hour}:${minute}:00+09:00`,
        }
      }

      function amountAfter(all, label) {
        return won(afterLabel(all, label))
      }

      function orderStatusFrom(all) {
        const orderIndex = all.findIndex((line) =>
          line.includes(`주문번호 ${expectedOrderId}`),
        )

        const start = orderIndex >= 0 ? orderIndex : 0
        const window = all.slice(start, start + 35)

        const finalPatterns = [
          /거래\s*취소\s*완료/,
          /주문\s*취소\s*완료/,
          /결제\s*취소\s*완료/,
          /취소\s*처리\s*완료/,
          /환불\s*완료/,
          /환불\s*처리\s*완료/,
          /^거래\s*취소$/,
          /^주문\s*취소$/,
          /^결제\s*취소$/,
          /^취소\s*완료$/,
        ]

        for (const line of window) {
          if (
            finalPatterns.some((pattern) =>
              pattern.test(line),
            )
          ) {
            return {
              status: line,
              cancelled: true,
            }
          }
        }

        const normalPatterns = [
          /^거래\s*완료$/,
          /^배송\s*완료$/,
          /^배송\s*중$/,
          /^결제\s*완료$/,
          /^배송\s*준비$/,
          /^구매\s*완료$/,
          /^구매확정$/,
          /^취소\s*요청\s*보냄$/,
        ]

        for (const line of window) {
          if (
            normalPatterns.some((pattern) =>
              pattern.test(line),
            )
          ) {
            return {
              status: line,
              cancelled: false,
            }
          }
        }

        return {
          status: null,
          cancelled: false,
        }
      }

      function titleFrom(all) {
        const orderIndex = all.findIndex((line) =>
          line.includes(`주문번호 ${expectedOrderId}`),
        )

        const window = all.slice(
          orderIndex >= 0 ? orderIndex + 1 : 0,
          (orderIndex >= 0 ? orderIndex + 1 : 0) + 16,
        )

        const priceIndex = window.findIndex((line) =>
          /^[+]?[\d,.]+\s*원$/.test(line),
        )

        if (priceIndex <= 0) return null

        const statuses = new Set([
          '거래 완료',
          '배송 완료',
          '배송 중',
          '거래 취소 완료',
          '취소 요청 보냄',
          '결제 완료',
          '배송 준비',
        ])

        for (let i = priceIndex - 1; i >= 0; i -= 1) {
          const candidate = window[i]
          if (
            !statuses.has(candidate) &&
            !/배송 조회|결제정보|주문 상세/.test(candidate) &&
            !/^주문번호\s/.test(candidate)
          ) {
            return candidate
          }
        }

        return null
      }

      const rawText = String(
        document.body?.innerText || document.body?.textContent || '',
      )
        .replace(/\u00a0/g, ' ')
        .trim()

      const all = lines(rawText)
      const dates = orderDateTime(rawText)
      const shipment = tracking(all)
      const orderStatus = orderStatusFrom(all)

      const productUrls = [...document.querySelectorAll('a[href]')]
        .map((anchor) => anchor.href)
        .filter((href) => /\/products?\/\d+/i.test(href))
        .slice(0, 12)

      const imageUrls = [...document.querySelectorAll('img')]
        .map((img) => img.currentSrc || img.src || '')
        .filter((src) => /^https?:\/\//i.test(src))
        .slice(0, 12)

      return {
        orderId: expectedOrderId,
        orderUrl,
        text: rawText,
        productUrls,
        imageUrls,
        warning: rawText.includes('주문번호')
          ? null
          : 'Gerenderte Detailseite enthielt keine erwarteten Bestelldaten.',
        cancelled: orderStatus.cancelled,
        cancelledStatus: orderStatus.status,
        diagnostics: {
          transactionInfoFound:
            rawText.includes('거래정보') &&
            rawText.includes('거래방법'),
          trackingLabelFound:
            rawText.includes('운송장'),
          trackingNumberFound:
            Boolean(shipment.trackingNumber),
          cancelledOrder:
            orderStatus.cancelled,
          orderStatus:
            orderStatus.status,
        },
        extracted: {
          title: titleFrom(all),
          sellerName: afterLabel(all, '판매자'),
          purchasedAt: dates.purchasedAt,
          orderedAt: dates.orderedAt,
          productAmount: amountAfter(all, '상품금액'),
          domesticShippingAmount: amountAfter(all, '배송비'),
          totalAmount: amountAfter(all, '총 결제금액'),
          transactionMethod: afterLabel(all, '거래방법'),
          domesticCarrier: shipment.carrier,
          domesticTrackingNumber: shipment.trackingNumber,
        },
      }
    },
    args: [order.orderId, order.orderUrl],
  })

  return result
}


function exportableOrders(orders) {
  return (orders || []).filter(
    (order) =>
      order &&
      order.invalidCandidate !== true &&
      order.cancelled !== true &&
      !isFinalCancelledStatus(
        order.cancelledStatus,
      ) &&
      inDateRange(order?.extracted?.purchasedAt) &&
      typeof order.text === 'string' &&
      order.text.includes('주문번호') &&
      (
        order.extracted?.productAmount !== null ||
        order.extracted?.purchasedAt ||
        order.extracted?.sellerName ||
        order.extracted?.domesticTrackingNumber
      ),
  )
}

async function persistPartialProgress(reason = 'checkpoint') {
  const orders = exportableOrders(currentRun.orders)
  if (!orders.length || !currentRun.tab) return null

  const payload = {
    source: 'cardcargo-bunjang-order-extractor',
    version: 4.7,
    mode: currentRun.mode,
    partialExport: reason !== 'complete',
    exportReason: reason,
    stoppedEarly: reason === 'stop',
    pausedAtExport: reason === 'pause',
    capturedAt: new Date().toISOString(),
    pageUrl: currentRun.tab.url,
    dateRange: {
      from: currentDateRange.from,
      to: currentDateRange.to,
    },
    discovery: {
      ordersFound: currentRun.discovered.length,
      requested: currentRun.targets.length,
      skippedComplete: currentRun.skipped,
      exportedSoFar: orders.length,
      checkedDetails: currentRun.checkedDetails,
      outsideRange: currentRun.outsideRange,
      overviewCardsInRange:
        currentRun.overviewCardsInRange,
      cardResolvedOrders:
        currentRun.cardResolvedOrders,
      unresolvedOverviewCards:
        currentRun.unresolvedOverviewCards,
      networkCandidates:
        currentRun.networkCandidates,
      summaryOrdersInRange:
        currentRun.summaryOrdersInRange,
      unknownDateCandidates:
        currentRun.unknownDateCandidates,
      slowFallbackUsed:
        currentRun.slowFallbackUsed,
      cancelledFromSummary:
        currentRun.cancelledFromSummary,
      cancelledFromDetail:
        currentRun.cancelledFromDetail,
    },
    orders,
  }

  await chrome.storage.local.set({ [PARTIAL_EXPORT_KEY]: payload })
  lastExportPayload = payload
  exportPartialButton.disabled = false
  return payload
}

async function restorePersistentExport() {
  const stored = await chrome.storage.local.get(PARTIAL_EXPORT_KEY)
  const payload = stored?.[PARTIAL_EXPORT_KEY]

  if (payload && Array.isArray(payload.orders) && payload.orders.length) {
    lastExportPayload = payload
    exportPartialButton.disabled = false
    return payload
  }
  return null
}

async function loadRenderedDetails(targets, syncState) {
  const results = []

  if (!targets.length) return results

  const worker = await chrome.tabs.create({
    url: targets[0].orderUrl,
    active: false,
  })

  if (!worker.id) {
    throw new Error('Hilfs-Tab für Bestelldetails konnte nicht erstellt werden.')
  }

  try {
    for (let index = 0; index < targets.length; index += 1) {
      if (stopRequested) break
      if (
        !(await waitWhilePaused(
          `Bestelldetails: ${index}/${targets.length} geladen.`,
        ))
      ) {
        break
      }

      const order = targets[index]

      status.textContent =
        `Lade gerenderte Bestelldetailseite …\n` +
        `${index + 1}/${targets.length} · Order #${order.orderId}`

      if (index > 0) {
        await chrome.tabs.update(worker.id, {
          url: order.orderUrl,
          active: false,
        })
      }

      await waitForTabComplete(worker.id)
      const rendered = await waitForRenderedOrder(worker.id, order.orderId)

      if (rendered.status === 'stopped') break

      if (rendered.status === 'invalid') {
        syncState.orders[order.orderId] = {
          trackingFound: false,
          invalidCandidate: true,
          lastCheckedAt: new Date().toISOString(),
          lastWarning: 'Netzwerk-Kandidat ist keine gültige Bunjang-Bestelldetailseite.',
        }
        await writeSyncState(syncState)
        status.textContent =
          `Ungültigen Netzwerk-Kandidaten #${order.orderId} übersprungen.\n` +
          'Suche mit der nächsten Bestellnummer weiter …'
        continue
      }

      let detail

      if (rendered.status !== 'valid') {
        detail = {
          orderId: order.orderId,
          orderUrl: order.orderUrl,
          text: '',
          productUrls: [],
          imageUrls: [],
          warning: 'Bestelldetailseite wurde nicht rechtzeitig vollständig gerendert.',
          invalidCandidate: false,
          diagnostics: {
            transactionInfoFound: false,
            trackingLabelFound: false,
            trackingNumberFound: false,
          },
          extracted: {
            title: null,
            sellerName: null,
            purchasedAt: null,
            orderedAt: null,
            productAmount: null,
            domesticShippingAmount: null,
            totalAmount: null,
            transactionMethod: null,
            domesticCarrier: null,
            domesticTrackingNumber: null,
          },
        }
      } else {
        detail = await extractRenderedDetail(
          worker.id,
          order,
        )

        detail = {
          ...detail,
          diagnostics: {
            ...(detail?.diagnostics || {}),
            renderWaitMs:
              rendered.renderWaitMs || null,
            trackingLabelAtReady:
              Boolean(rendered.trackingLabel),
            trackingNumberAtReady:
              Boolean(rendered.trackingNumber),
          },
        }
      }

      const purchasedAt = detail?.extracted?.purchasedAt

      if (rendered.status === 'valid') {
        currentRun.checkedDetails += 1
      }

      if (
        detail?.cancelled === true ||
        isFinalCancelledStatus(
          detail?.cancelledStatus,
        )
      ) {
        currentRun.cancelledFromDetail += 1

        syncState.orders[order.orderId] = {
          ...(syncState.orders[order.orderId] || {}),
          trackingFound: Boolean(
            detail?.extracted?.domesticTrackingNumber,
          ),
          invalidCandidate: false,
          cancelled: true,
          cancelledStatus:
            detail?.cancelledStatus ||
            order?.summary?.status ||
            null,
          purchasedAt:
            detail?.extracted?.purchasedAt ||
            order?.summary?.purchasedAt ||
            null,
          title:
            detail?.extracted?.title ||
            order?.summary?.title ||
            null,
          sellerName:
            detail?.extracted?.sellerName ||
            order?.summary?.sellerName ||
            null,
          productAmount:
            detail?.extracted?.productAmount ??
            order?.summary?.productAmount ??
            null,
          lastCheckedAt:
            new Date().toISOString(),
          lastWarning:
            'Final stornierte/erstattete Bunjang-Bestellung; nicht exportiert.',
        }

        await writeSyncState(syncState)

        status.textContent =
          `Order #${order.orderId} ist ${detail?.cancelledStatus || 'storniert/erstattet'} und wird nicht exportiert.`

        continue
      }

      if (
        rendered.status === 'valid' &&
        purchasedAt &&
        !inDateRange(purchasedAt)
      ) {
        currentRun.outsideRange += 1
        syncState.orders[order.orderId] = {
          trackingFound: Boolean(
            detail?.extracted?.domesticTrackingNumber,
          ),
          invalidCandidate: false,
          purchasedAt,
          title:
            detail?.extracted?.title ||
            null,
          sellerName:
            detail?.extracted?.sellerName ||
            null,
          productAmount:
            detail?.extracted?.productAmount ??
            null,
          domesticShippingAmount:
            detail?.extracted?.domesticShippingAmount ??
            null,
          domesticCarrier:
            detail?.extracted?.domesticCarrier ||
            null,
          domesticTrackingNumber:
            detail?.extracted?.domesticTrackingNumber ||
            null,
          lastCheckedAt:
            new Date().toISOString(),
          lastWarning:
            `Außerhalb des ausgewählten Zeitraums (${currentDateRange.from} bis ${currentDateRange.to}).`,
        }

        await writeSyncState(syncState)

        status.textContent =
          `Order #${order.orderId} liegt am ${purchasedAt} außerhalb des gewählten Zeitraums und wird nicht exportiert.`

        continue
      }

      results.push(detail)
      currentRun.orders = [...results]

      syncState.orders[order.orderId] = {
        trackingFound: Boolean(
          detail?.extracted?.domesticTrackingNumber,
        ),
        invalidCandidate: false,
        cancelled: false,
        cancelledStatus:
          detail?.cancelledStatus ||
          order?.summary?.status ||
          null,
        purchasedAt:
          detail?.extracted?.purchasedAt ||
          null,
        title:
          detail?.extracted?.title ||
          null,
        sellerName:
          detail?.extracted?.sellerName ||
          null,
        productAmount:
          detail?.extracted?.productAmount ??
          null,
        domesticShippingAmount:
          detail?.extracted?.domesticShippingAmount ??
          null,
        domesticCarrier:
          detail?.extracted?.domesticCarrier ||
          null,
        domesticTrackingNumber:
          detail?.extracted?.domesticTrackingNumber ||
          null,
        lastCheckedAt:
          new Date().toISOString(),
        lastWarning:
          detail?.warning || null,
      }

      await Promise.all([
        writeSyncState(syncState),
        persistPartialProgress('checkpoint'),
      ])
    }
  } finally {
    try {
      await chrome.tabs.remove(worker.id)
    } catch {
      // Ignore.
    }
  }

  return results
}

async function run(mode) {
  setRunState(true)
  summary.hidden = true

  try {
    const range = validateDateRange()
    await saveDateRange(range)

    const tab = await activeTab()

    currentRun = {
      mode,
      tab,
      discovered: [],
      targets: [],
      skipped: 0,
      orders: [],
      outsideRange: 0,
      checkedDetails: 0,
      overviewCardsInRange: 0,
      cardResolvedOrders: 0,
      unresolvedOverviewCards: 0,
      networkCandidates: 0,
      summaryOrdersInRange: 0,
      unknownDateCandidates: 0,
      cancelledFromSummary: 0,
      cancelledFromDetail: 0,
      slowFallbackUsed: false,
    }

    lastExportPayload = null
    exportPartialButton.disabled = true

    await ensureCaptureBridge(tab)

    const syncState = await readSyncState()

    status.textContent =
      `Ermittle Bunjang-Bestellungen im Zeitraum ${range.from} bis ${range.to} …`

    const slowFallback =
      Boolean(slowFallbackInput.checked)

    const discovery = await discoverOrders(
      tab.id,
      range,
      tab.url,
      slowFallback,
    )
    const discovered = discovery.orders

    currentRun.discovered = discovered
    currentRun.overviewCardsInRange =
      discovery.overviewCards.length
    currentRun.cardResolvedOrders =
      discovery.fallbackOrders.length
    currentRun.unresolvedOverviewCards =
      Math.max(
        0,
        discovery.overviewCards.length -
          discovery.summaryOrdersInRange.length -
          discovery.fallbackOrders.length,
      )
    currentRun.networkCandidates =
      discovery.networkCandidates.length
    currentRun.summaryOrdersInRange =
      discovery.summaryOrdersInRange.length
    currentRun.unknownDateCandidates =
      discovery.unknownDateCandidates.length
    currentRun.cancelledFromSummary =
      discovery.cancelledSummaryOrders.length
    currentRun.slowFallbackUsed =
      slowFallback

    for (const order of discovery.cancelledSummaryOrders) {
      const known = syncState.orders[order.orderId] || {}

      syncState.orders[order.orderId] = {
        ...known,
        cancelled: true,
        cancelledStatus:
          order?.summary?.status ||
          known.cancelledStatus ||
          null,
        purchasedAt:
          order?.summary?.purchasedAt ||
          known.purchasedAt ||
          null,
        title:
          order?.summary?.title ||
          known.title ||
          null,
        sellerName:
          order?.summary?.sellerName ||
          known.sellerName ||
          null,
        productAmount:
          order?.summary?.productAmount ??
          known.productAmount ??
          null,
        lastCheckedAt:
          new Date().toISOString(),
        lastWarning:
          'Final stornierte/erstattete Bunjang-Bestellung; nicht exportiert.',
      }
    }

    if (discovery.cancelledSummaryOrders.length) {
      await writeSyncState(syncState)
    }

    if (!discovered.length) {
      throw new Error(
        'Keine Bunjang-Bestellung mit bekanntem Kaufdatum wurde im gewählten Zeitraum gefunden. Falls sichtbare Käufe fehlen, aktiviere einmalig den langsamen Karten-Fallback.',
      )
    }

    const validDiscovered = discovered.filter(
      (order) => {
        const known = syncState.orders[order.orderId]

        return (
          known?.invalidCandidate !== true &&
          known?.cancelled !== true &&
          !isFinalCancelledStatus(
            order?.summary?.status,
          )
        )
      },
    )

    const targets =
      mode === 'full'
        ? validDiscovered
        : validDiscovered.filter((order) => {
            const known = syncState.orders[order.orderId]
            return (
              !known ||
              (known.trackingFound !== true && known.invalidCandidate !== true)
            )
          })

    const skipped = discovered.length - targets.length
    currentRun.targets = targets
    currentRun.skipped = skipped

    renderSummary([
      [
        'Sichtbare Einkäufe im Zeitraum',
        currentRun.overviewCardsInRange,
      ],
      [
        'API-Summaries im Zeitraum',
        currentRun.summaryOrdersInRange,
      ],
      [
        'Kandidaten ohne Übersichtsdatum',
        currentRun.unknownDateCandidates,
      ],
      [
        'Langsamer Fallback',
        currentRun.slowFallbackUsed
          ? 'aktiv'
          : 'aus',
      ],
      [
        'Storniert/erstattet übersprungen',
        currentRun.cancelledFromSummary,
      ],
      ['Detailseiten zu laden', targets.length],
      ['Bereits mit Tracking', skipped],
    ])

    if (stopRequested) return

    if (!targets.length) {
      status.textContent =
        'Smart Sync abgeschlossen: Alle erkannten Bestellungen besitzen bereits Trackingdaten.'
      return
    }

    const orders = await loadRenderedDetails(targets, syncState)

    currentRun.orders = [...orders]

    if (orders.length) {
      await exportCurrentProgress(
        stopRequested ? 'stop' : 'complete',
      )
    }

    const stats = summarizeOrders(orders)

    const transactionInfoCount =
      orders.filter(
        (order) =>
          order?.diagnostics
            ?.transactionInfoFound,
      ).length

    const trackingLabelCount =
      orders.filter(
        (order) =>
          order?.diagnostics
            ?.trackingLabelFound,
      ).length

    renderSummary([
      [
        'Sichtbare Einkäufe im Zeitraum',
        currentRun.overviewCardsInRange,
      ],
      [
        'API-Summaries im Zeitraum',
        currentRun.summaryOrdersInRange,
      ],
      [
        'Kandidaten ohne Übersichtsdatum',
        currentRun.unknownDateCandidates,
      ],
      [
        'Per Fallback aufgelöst',
        currentRun.cardResolvedOrders,
      ],
      ['Detailseiten geprüft', currentRun.checkedDetails],
      ['Außerhalb Zeitraum', currentRun.outsideRange],
      [
        'Storniert/erstattet übersprungen',
        currentRun.cancelledFromSummary +
          currentRun.cancelledFromDetail,
      ],
      ['Bestellungen im Zeitraum', orders.length],
      ['Warenwert erkannt', stats.priceCount],
      ['Kaufdatum erkannt', stats.dateCount],
      ['Versandkosten erkannt', stats.shippingCount],
      ['Verkäufer erkannt', stats.sellerCount],
      ['Versandblock gefunden', transactionInfoCount],
      ['Tracking-Label gefunden', trackingLabelCount],
      ['Trackingnummer erkannt', stats.trackingCount],
      ['Fehler', stats.errors],
    ])

    status.textContent = stopRequested
      ? orders.length
        ? `${orders.length} bereits geladene Bestellung(en) wurden als Teil-Batch kopiert.`
        : 'Sync beendet.'
      : 'Detail-Batch vorbereitet. In CardCargo einmal „Aus Zwischenablage einlesen“ verwenden.'
  } catch (error) {
    status.textContent =
      error instanceof Error
        ? error.message
        : 'Bunjang Detail Sync fehlgeschlagen.'
  } finally {
    setRunState(false)
  }
}

smartButton.addEventListener('click', () => void run('smart'))
fullButton.addEventListener('click', () => void run('full'))

pauseButton.addEventListener('click', async () => {
  if (!running) return

  if (paused) {
    paused = false
    pauseButton.textContent = 'Pausieren'
    status.textContent = 'Sync wird fortgesetzt …'
    return
  }

  paused = true
  pauseButton.textContent = 'Fortsetzen'

  try {
    const exported = await exportCurrentProgress('pause')

    status.textContent = exported.copied
      ? `Pausiert. ${exported.count} bereits vollständig gelesene Bestellung(en) wurden sofort ausgewertet und in die Zwischenablage kopiert.\nDu kannst den Teil-Batch jetzt in CardCargo importieren oder später „Fortsetzen“ klicken.`
      : 'Pausiert. Es wurde bisher noch keine Bestelldetailseite vollständig gelesen; deshalb gibt es noch keinen Teil-Batch zum Export.'
  } catch (error) {
    status.textContent =
      error instanceof Error
        ? `Pausiert, aber Zwischenexport fehlgeschlagen: ${error.message}`
        : 'Pausiert, aber Zwischenexport fehlgeschlagen.'
  }
})

stopButton.addEventListener('click', async () => {
  if (!running) return

  stopRequested = true
  paused = false
  pauseButton.textContent = 'Pausieren'

  try {
    const exported = await exportCurrentProgress('stop')

    status.textContent = exported.copied
      ? `Beenden angefordert. ${exported.count} bereits vollständig gelesene Bestellung(en) wurden sofort ausgewertet und in die Zwischenablage kopiert.\nDer aktuell laufende kleine Schritt wird noch sauber beendet; danach stoppt der Sync.`
      : 'Beenden angefordert. Es wurde bisher noch keine Bestelldetailseite vollständig gelesen. Der aktuelle kleine Schritt wird beendet; danach stoppt der Sync.'
  } catch (error) {
    status.textContent =
      error instanceof Error
        ? `Beenden angefordert, aber Zwischenexport fehlgeschlagen: ${error.message}`
        : 'Beenden angefordert, aber Zwischenexport fehlgeschlagen.'
  }
})


exportPartialButton.addEventListener('click', async () => {
  if (!lastExportPayload) return

  try {
    await navigator.clipboard.writeText(
      JSON.stringify(lastExportPayload, null, 2),
    )

    status.textContent =
      `${lastExportPayload.orders.length} Bestellung(en) wurden erneut als Teil-Batch in die Zwischenablage kopiert.`
  } catch (error) {
    status.textContent =
      error instanceof Error
        ? error.message
        : 'Teil-Batch konnte nicht erneut kopiert werden.'
  }
})


last7Button.addEventListener('click', async () => {
  const range = defaultLast7Days()

  dateFromInput.value = range.from
  dateToInput.value = range.to
  await saveDateRange(range)

  status.textContent =
    `Zeitraum auf die letzten 7 Tage gesetzt: ${range.from} bis ${range.to}.`
})

dateFromInput.addEventListener('change', async () => {
  try {
    const range = validateDateRange()
    await saveDateRange(range)
  } catch (error) {
    status.textContent =
      error instanceof Error ? error.message : 'Ungültiger Zeitraum.'
  }
})

dateToInput.addEventListener('change', async () => {
  try {
    const range = validateDateRange()
    await saveDateRange(range)
  } catch (error) {
    status.textContent =
      error instanceof Error ? error.message : 'Ungültiger Zeitraum.'
  }
})

resetButton.addEventListener('click', async () => {
  if (
    !confirm(
      'Lokalen Sync- und Netzwerk-Capture-Stand wirklich zurücksetzen?',
    )
  ) {
    return
  }

  await chrome.storage.local.remove([SYNC_KEY, CAPTURE_KEY, PARTIAL_EXPORT_KEY])
  status.textContent = 'Lokaler Sync-/Capture-Stand wurde zurückgesetzt.'
  renderSummary([])
})


void restorePersistentExport().then((payload) => {
  if (!payload) return

  status.textContent =
    `${payload.orders.length} bereits gelesene Bestellung(en) aus dem letzten Zwischenstand sind weiterhin exportierbar.`

  const stats = summarizeOrders(payload.orders)
  renderSummary([
    ['Gespeicherter Zwischenstand', payload.orders.length],
    ['Warenwert erkannt', stats.priceCount],
    ['Kaufdatum erkannt', stats.dateCount],
    ['Tracking erkannt', stats.trackingCount],
  ])
})

void initializeDateRange()
