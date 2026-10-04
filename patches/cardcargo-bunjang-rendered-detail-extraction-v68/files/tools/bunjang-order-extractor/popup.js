const smartButton = document.getElementById('smart')
const fullButton = document.getElementById('full')
const pauseButton = document.getElementById('pause')
const stopButton = document.getElementById('stop')
const resetButton = document.getElementById('reset')
const status = document.getElementById('status')
const summary = document.getElementById('summary')

const SYNC_KEY = 'cardcargoBunjangSmartSyncV1'
const CAPTURE_KEY = 'cardcargoBunjangNetworkCaptureV67'
const MAX_SCROLL_ROUNDS = 80
const DETAIL_RENDER_TIMEOUT = 12000

let running = false
let paused = false
let stopRequested = false

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function setRunState(next) {
  running = next
  smartButton.disabled = next
  fullButton.disabled = next
  resetButton.disabled = next
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
  const stored = await chrome.storage.local.get(CAPTURE_KEY)
  const value = stored?.[CAPTURE_KEY]
  const map =
    value?.orders && typeof value.orders === 'object'
      ? value.orders
      : {}

  return Object.keys(map)
    .filter((id) => /^\d{6,12}$/.test(id))
    .map((orderId) => ({
      orderId,
      orderUrl: `https://order.bunjang.co.kr/purchases/${orderId}`,
    }))
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

async function discoverOrders(tabId) {
  const byId = new Map()
  let stableRounds = 0
  let previousSignal = ''

  for (let round = 0; round < MAX_SCROLL_ROUNDS; round += 1) {
    if (stopRequested) break
    if (!(await waitWhilePaused(`Discovery: ${byId.size} Orders erkannt.`))) {
      break
    }

    const [network, dom] = await Promise.all([
      capturedOrders(),
      directDomOrders(tabId),
    ])

    for (const order of [...network, ...dom]) {
      byId.set(order.orderId, order)
    }

    status.textContent =
      `Lese Bunjang-Netzwerkdaten …\n` +
      `${byId.size} Bestellnummern erkannt · Scroll-Runde ${round + 1}`

    const step = await scrollOneStep(tabId)
    await sleep(250)

    const next = await capturedOrders()
    for (const order of next) {
      byId.set(order.orderId, order)
    }

    const signal = `${byId.size}:${step.height || 0}`

    if (signal === previousSignal) {
      stableRounds += 1
    } else {
      stableRounds = 0
    }
    previousSignal = signal

    if (stableRounds >= 4) break
  }

  return [...byId.values()]
}

async function waitForRenderedOrder(tabId, orderId) {
  const started = Date.now()

  while (Date.now() - started < DETAIL_RENDER_TIMEOUT) {
    if (stopRequested) return false
    if (!(await waitWhilePaused(`Warte auf gerenderte Bestellung #${orderId} …`))) {
      return false
    }

    try {
      const [{ result }] = await chrome.scripting.executeScript({
        target: { tabId },
        func: (expectedOrderId) => {
          const text = String(
            document.body?.innerText || document.body?.textContent || '',
          )

          return (
            text.includes(`주문번호 ${expectedOrderId}`) ||
            (
              text.includes('주문번호') &&
              (text.includes('판매자') || text.includes('운송장'))
            )
          )
        },
        args: [orderId],
      })

      if (result === true) return true
    } catch {
      // Tab may still be navigating.
    }

    await sleep(180)
  }

  return false
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

      let detail

      if (!rendered) {
        detail = {
          orderId: order.orderId,
          orderUrl: order.orderUrl,
          text: '',
          productUrls: [],
          imageUrls: [],
          warning: 'Bestelldetailseite wurde nicht rechtzeitig vollständig gerendert.',
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
        detail = await extractRenderedDetail(worker.id, order)
      }

      results.push(detail)

      syncState.orders[order.orderId] = {
        trackingFound: Boolean(detail?.extracted?.domesticTrackingNumber),
        lastCheckedAt: new Date().toISOString(),
        lastWarning: detail?.warning || null,
      }

      await writeSyncState(syncState)
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
    const tab = await activeTab()
    await ensureCaptureBridge(tab)

    const syncState = await readSyncState()

    status.textContent =
      'Ermittle echte Bunjang-Bestellnummern aus den Netzwerkdaten …'

    const discovered = await discoverOrders(tab.id)

    if (!discovered.length) {
      throw new Error(
        'Keine Bestellnummern in den Bunjang-Netzwerkdaten erkannt.',
      )
    }

    const targets =
      mode === 'full'
        ? discovered
        : discovered.filter((order) => {
            const known = syncState.orders[order.orderId]
            return !known || known.trackingFound !== true
          })

    const skipped = discovered.length - targets.length

    renderSummary([
      ['Bestellnummern erkannt', discovered.length],
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

    if (orders.length) {
      const payload = {
        source: 'cardcargo-bunjang-order-extractor',
        version: 4.1,
        mode,
        stoppedEarly: stopRequested,
        capturedAt: new Date().toISOString(),
        pageUrl: tab.url,
        discovery: {
          ordersFound: discovered.length,
          requested: targets.length,
          skippedComplete: skipped,
        },
        orders,
      }

      await navigator.clipboard.writeText(
        JSON.stringify(payload, null, 2),
      )
    }

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
      (order) => Boolean(order.warning),
    ).length

    renderSummary([
      ['Detailseiten geladen', orders.length],
      ['Warenwert erkannt', priceCount],
      ['Kaufdatum erkannt', dateCount],
      ['Versandkosten erkannt', shippingCount],
      ['Verkäufer erkannt', sellerCount],
      ['Tracking erkannt', trackingCount],
      ['Fehler', errors],
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

pauseButton.addEventListener('click', () => {
  if (!running) return
  paused = !paused
  pauseButton.textContent = paused ? 'Fortsetzen' : 'Pausieren'
  status.textContent = paused
    ? 'Pause angefordert. Der aktuelle kleine Schritt wird noch beendet.'
    : 'Sync wird fortgesetzt …'
})

stopButton.addEventListener('click', () => {
  if (!running) return
  stopRequested = true
  paused = false
  pauseButton.textContent = 'Pausieren'
  status.textContent =
    'Beenden angefordert. Der aktuelle kleine Schritt wird noch abgeschlossen.'
})

resetButton.addEventListener('click', async () => {
  if (
    !confirm(
      'Lokalen Sync- und Netzwerk-Capture-Stand wirklich zurücksetzen?',
    )
  ) {
    return
  }

  await chrome.storage.local.remove([SYNC_KEY, CAPTURE_KEY])
  status.textContent = 'Lokaler Sync-/Capture-Stand wurde zurückgesetzt.'
  renderSummary([])
})
