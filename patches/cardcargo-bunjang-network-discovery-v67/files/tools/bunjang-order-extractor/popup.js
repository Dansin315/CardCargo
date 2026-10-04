const smartButton = document.getElementById('smart')
const fullButton = document.getElementById('full')
const pauseButton = document.getElementById('pause')
const stopButton = document.getElementById('stop')
const resetButton = document.getElementById('reset')
const status = document.getElementById('status')
const summary = document.getElementById('summary')

const SYNC_KEY = 'cardcargoBunjangSmartSyncV1'
const CAPTURE_KEY = 'cardcargoBunjangNetworkCaptureV67'
const CHUNK_SIZE = 5
const MAX_SCROLL_ROUNDS = 80

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

    if (result?.ok) return false
  } catch {
    // Reload below.
  }

  status.textContent =
    'Aktiviere den neuen Netzwerk-Extractor …\nDie Bunjang-Seite wird einmal neu geladen.'

  await chrome.tabs.reload(tab.id)
  await waitForTabComplete(tab.id)
  await sleep(900)
  return true
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
  await chrome.storage.local.set({
    [SYNC_KEY]: state,
  })
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

      const current = location.href.match(/\/purchases\/(\d{6,12})/)
      if (current?.[1]) found.add(current[1])

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
    if (!(await waitWhilePaused(`Netzwerk-Discovery: ${byId.size} Orders erkannt.`))) {
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

    const nextNetwork = await capturedOrders()
    for (const order of nextNetwork) {
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

async function fetchDetails(tabId, targets, syncState) {
  const results = []

  for (let offset = 0; offset < targets.length; offset += CHUNK_SIZE) {
    if (stopRequested) break

    if (
      !(await waitWhilePaused(
        `Bestelldetails: ${results.length}/${targets.length} geladen.`,
      ))
    ) {
      break
    }

    const chunk = targets.slice(offset, offset + CHUNK_SIZE)

    status.textContent =
      `Lade Bestelldetails …\n${results.length}/${targets.length} abgeschlossen`

    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId },
      func: async (orders) => {
        function textFromDocument(doc) {
          return String(
            doc.body?.innerText || doc.body?.textContent || '',
          )
            .replace(/\u00a0/g, ' ')
            .trim()
        }

        function extras(doc) {
          return {
            productUrls: [...doc.querySelectorAll('a[href]')]
              .map((a) => a.href)
              .filter((href) => /\/products?\/\d+/i.test(href))
              .slice(0, 12),
            imageUrls: [...doc.querySelectorAll('img')]
              .map((img) => img.currentSrc || img.src || '')
              .filter((src) => /^https?:\/\//i.test(src))
              .slice(0, 12),
          }
        }

        async function one(order) {
          try {
            const response = await fetch(order.orderUrl, {
              credentials: 'include',
              cache: 'no-store',
            })

            if (!response.ok) {
              return {
                ...order,
                text: '',
                productUrls: [],
                imageUrls: [],
                warning: `Detailseite HTTP ${response.status}`,
              }
            }

            const html = await response.text()
            const doc = new DOMParser().parseFromString(html, 'text/html')
            const text = textFromDocument(doc)

            return {
              ...order,
              text,
              ...extras(doc),
              warning:
                text.includes('주문번호') || text.includes('운송장')
                  ? null
                  : 'Detailseite enthielt keine erwarteten Bestelldaten.',
            }
          } catch (error) {
            return {
              ...order,
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

        return Promise.all(orders.map(one))
      },
      args: [chunk],
    })

    const chunkResults = Array.isArray(result) ? result : []
    results.push(...chunkResults)

    const now = new Date().toISOString()

    for (const order of chunkResults) {
      const normalized = String(order.text || '')
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)

      const label = normalized.findIndex((line) =>
        line.startsWith('운송장'),
      )

      let hasTracking = false

      if (label >= 0) {
        for (
          let index = label;
          index <= Math.min(label + 4, normalized.length - 1);
          index += 1
        ) {
          if (/\d{8,16}/.test(normalized[index].replace(/[\s-]/g, ''))) {
            hasTracking = true
            break
          }
        }
      }

      syncState.orders[order.orderId] = {
        trackingFound: hasTracking,
        lastCheckedAt: now,
        lastWarning: order.warning || null,
      }
    }

    await writeSyncState(syncState)
  }

  return results
}

function hasTracking(text) {
  const lines = String(text || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

  const index = lines.findIndex((line) => line.startsWith('운송장'))
  if (index < 0) return false

  for (
    let i = index;
    i <= Math.min(index + 4, lines.length - 1);
    i += 1
  ) {
    if (/\d{8,16}/.test(lines[i].replace(/[\s-]/g, ''))) return true
  }

  return false
}

async function run(mode) {
  setRunState(true)
  summary.hidden = true

  try {
    const tab = await activeTab()
    await ensureCaptureBridge(tab)

    const syncState = await readSyncState()

    status.textContent =
      'Erfasse Bunjangs eigene API-Antworten und scrolle die Kaufübersicht …'

    const discovered = await discoverOrders(tab.id)

    if (!discovered.length) {
      throw new Error(
        'Auch in den Bunjang-Netzwerkantworten wurde keine Bestellnummer erkannt. ' +
          'Die DOM-Kaufkarten werden nicht mehr fälschlich als Orders gezählt.',
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
      ['Zu prüfen', targets.length],
      ['Bereits mit Tracking', skipped],
    ])

    if (stopRequested) {
      status.textContent =
        'Discovery kontrolliert beendet. Erkannte Order-IDs bleiben lokal gespeichert.'
      return
    }

    if (!targets.length) {
      status.textContent =
        'Smart Sync abgeschlossen: Alle erkannten Bestellungen besitzen bereits Trackingdaten.'
      return
    }

    const orders = await fetchDetails(tab.id, targets, syncState)

    if (orders.length) {
      const payload = {
        source: 'cardcargo-bunjang-order-extractor',
        version: 4,
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

    const withTracking = orders.filter((order) =>
      hasTracking(order.text),
    ).length
    const errors = orders.filter((order) => order.warning).length

    renderSummary([
      ['Bestellnummern erkannt', discovered.length],
      ['Detailseiten geladen', orders.length],
      ['Mit Tracking', withTracking],
      ['Ohne Tracking', Math.max(0, orders.length - withTracking - errors)],
      ['Fehler', errors],
      ['Übersprungen', skipped],
    ])

    status.textContent = stopRequested
      ? orders.length
        ? `Sync beendet. ${orders.length} bereits geladene Bestellung(en) wurden als Teil-Batch kopiert.`
        : 'Sync beendet. Der lokale Discovery-/Trackingstand bleibt erhalten.'
      : 'Batch vorbereitet. In CardCargo einmal „Aus Zwischenablage einlesen“ verwenden.'
  } catch (error) {
    status.textContent =
      error instanceof Error
        ? error.message
        : 'Bunjang Network Sync fehlgeschlagen.'
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
