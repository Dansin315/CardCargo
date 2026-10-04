const smartButton = document.getElementById('smart')
const fullButton = document.getElementById('full')
const resetButton = document.getElementById('reset')
const pauseButton = document.getElementById('pause')
const stopButton = document.getElementById('stop')
const status = document.getElementById('status')
const summary = document.getElementById('summary')

const STORAGE_KEY = 'cardcargoBunjangSmartSyncV1'
const ORDER_RE = /\/purchases\/(\d+)/i
const MAX_ORDERS = 500
const CHUNK_SIZE = 5

let paused = false
let stopRequested = false
let currentMainTabId = null
const PROBE_TIMEOUT_MS = 9000

function setBusy(busy) {
  smartButton.disabled = busy
  fullButton.disabled = busy
  resetButton.disabled = busy
  pauseButton.disabled = !busy
  stopButton.disabled = !busy

  if (!busy) {
    paused = false
    stopRequested = false
    pauseButton.textContent = 'Pausieren'
  }
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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function setMainTabControl(value) {
  if (!currentMainTabId) return

  try {
    await chrome.scripting.executeScript({
      target: { tabId: currentMainTabId },
      func: (controlValue) => {
        document.documentElement.dataset.cardcargoSyncControl = controlValue
      },
      args: [value],
    })
  } catch {
    // The tab may currently be navigating. The popup-level flag still applies.
  }
}

async function waitIfPaused(phase) {
  while (paused && !stopRequested) {
    status.textContent =
      `Pausiert.\n${phase}\nMit „Fortsetzen“ geht es weiter.`
    await sleep(150)
  }

  return !stopRequested
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
    return {
      orders: {},
      cardMap: {},
    }
  }

  return {
    orders:
      value.orders && typeof value.orders === 'object'
        ? value.orders
        : {},
    cardMap:
      value.cardMap && typeof value.cardMap === 'object'
        ? value.cardMap
        : {},
  }
}

async function writeState(state) {
  await chrome.storage.local.set({
    [STORAGE_KEY]: state,
  })
}

async function waitForTabComplete(tabId, timeoutMs = 12000) {
  const started = Date.now()

  while (Date.now() - started < timeoutMs) {
    if (stopRequested) return chrome.tabs.get(tabId)
    await waitIfPaused('Warte auf den Hilfs-Tab …')

    const tab = await chrome.tabs.get(tabId)
    if (tab.status === 'complete') return tab
    await sleep(120)
  }

  return chrome.tabs.get(tabId)
}

async function waitForOrderUrl(tabId, timeoutMs = PROBE_TIMEOUT_MS) {
  const started = Date.now()

  while (Date.now() - started < timeoutMs) {
    if (stopRequested) return null
    await waitIfPaused('Ermittle die Bunjang-Bestellnummer …')

    const tab = await chrome.tabs.get(tabId)
    const match = String(tab.url || '').match(ORDER_RE)
    if (match?.[1]) {
      return {
        orderId: match[1],
        orderUrl: `https://order.bunjang.co.kr/purchases/${match[1]}`,
      }
    }
    await sleep(100)
  }

  return null
}

async function scanOverview(tabId) {
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId },
    func: async (maxOrders) => {
      const ORDER_RE_IN_PAGE = /\/purchases\/(\d+)/i
      const STATUS_RE =
        /(거래\s*완료|배송\s*완료|배송\s*중|거래\s*취소\s*완료|취소\s*요청|결제\s*완료|배송\s*준비|구매\s*완료|구매확정)/
      const WON_RE = /\d[\d,.]*\s*원/

      const sleepInPage = (ms) =>
        new Promise((resolve) => setTimeout(resolve, ms))

      function readControl() {
        return document.documentElement.dataset.cardcargoSyncControl || 'run'
      }

      async function waitForControl() {
        let control = readControl()
        while (control === 'pause') {
          await sleepInPage(150)
          control = readControl()
        }
        return control
      }

      function cleanText(value) {
        return String(value || '')
          .replace(/\u00a0/g, ' ')
          .replace(/[ \t]+/g, ' ')
          .replace(/\n{3,}/g, '\n\n')
          .trim()
      }

      function compactText(value) {
        return cleanText(value)
          .toLocaleLowerCase()
          .replace(/\s+/g, '')
      }

      function fnv1a(value) {
        let hash = 0x811c9dc5
        const text = String(value || '')

        for (let index = 0; index < text.length; index += 1) {
          hash ^= text.charCodeAt(index)
          hash = Math.imul(hash, 0x01000193)
        }

        return (hash >>> 0).toString(16).padStart(8, '0')
      }

      function getReactProps(element) {
        if (!element) return []

        const values = []
        for (const key of Object.keys(element)) {
          if (key.startsWith('__reactProps$')) {
            values.push(element[key])
          } else if (key.startsWith('__reactFiber$')) {
            const fiber = element[key]
            if (fiber?.memoizedProps) values.push(fiber.memoizedProps)
            if (fiber?.pendingProps) values.push(fiber.pendingProps)
            if (fiber?.return?.memoizedProps) {
              values.push(fiber.return.memoizedProps)
            }
          }
        }

        return values
      }

      function hasClickSignal(element) {
        if (!element) return false

        if (
          element.tagName === 'A' ||
          element.tagName === 'BUTTON' ||
          element.getAttribute('role') === 'button'
        ) {
          return true
        }

        if (element.hasAttribute('onclick')) return true

        for (const props of getReactProps(element)) {
          if (props && typeof props.onClick === 'function') {
            return true
          }
        }

        try {
          if (getComputedStyle(element).cursor === 'pointer') {
            return true
          }
        } catch {
          // Ignore.
        }

        return false
      }

      function orderIdFromValue(value, keyHint, seen, depth) {
        if (depth > 5 || value == null) return null

        if (typeof value === 'string') {
          const route = value.match(ORDER_RE_IN_PAGE)
          if (route?.[1]) return route[1]

          if (
            keyHint &&
            /(purchase|order).*(id|no|number)|(id|no|number).*(purchase|order)/i.test(
              keyHint,
            )
          ) {
            const digits = value.match(/\b(\d{6,12})\b/)
            if (digits?.[1]) return digits[1]
          }

          return null
        }

        if (typeof value === 'number') {
          if (
            Number.isInteger(value) &&
            value >= 100000 &&
            value <= 999999999999 &&
            keyHint &&
            /(purchase|order).*(id|no|number)|(id|no|number).*(purchase|order)/i.test(
              keyHint,
            )
          ) {
            return String(value)
          }

          return null
        }

        if (typeof value !== 'object') return null
        if (seen.has(value)) return null
        seen.add(value)

        if (Array.isArray(value)) {
          for (const child of value.slice(0, 80)) {
            const found = orderIdFromValue(
              child,
              keyHint,
              seen,
              depth + 1,
            )
            if (found) return found
          }
          return null
        }

        let entries = []
        try {
          entries = Object.entries(value).slice(0, 120)
        } catch {
          return null
        }

        for (const [key, child] of entries) {
          if (
            /(purchase|order).*(id|no|number)|(id|no|number).*(purchase|order)/i.test(
              key,
            )
          ) {
            const direct = orderIdFromValue(
              child,
              key,
              seen,
              depth + 1,
            )
            if (direct) return direct
          }
        }

        for (const [key, child] of entries) {
          const found = orderIdFromValue(
            child,
            key,
            seen,
            depth + 1,
          )
          if (found) return found
        }

        return null
      }

      function findOrderId(element) {
        let node = element

        for (let depth = 0; depth < 5 && node; depth += 1) {
          const hrefs = [
            node.getAttribute?.('href'),
            node.getAttribute?.('data-href'),
            node.getAttribute?.('data-url'),
            node.getAttribute?.('data-link'),
          ].filter(Boolean)

          for (const value of hrefs) {
            const match = String(value).match(ORDER_RE_IN_PAGE)
            if (match?.[1]) return match[1]
          }

          const html = String(node.outerHTML || '').slice(0, 30000)
          const route = html.match(/\/purchases\/(\d+)/i)
          if (route?.[1]) return route[1]

          for (const props of getReactProps(node)) {
            const found = orderIdFromValue(
              props,
              '',
              new WeakSet(),
              0,
            )
            if (found) return found
          }

          node = node.parentElement
        }

        return null
      }

      function findClickableCard(seed) {
        let node = seed
        let fallback = null

        for (let depth = 0; depth < 9 && node; depth += 1) {
          const text = cleanText(node.innerText || node.textContent || '')

          if (
            text.length >= 10 &&
            text.length <= 2500 &&
            STATUS_RE.test(text) &&
            WON_RE.test(text)
          ) {
            fallback = fallback || node
            if (hasClickSignal(node)) return node
          }

          node = node.parentElement
        }

        return fallback
      }

      function cardImage(element) {
        const img = element?.querySelector?.('img')
        return String(
          img?.currentSrc ||
            img?.src ||
            img?.getAttribute?.('src') ||
            '',
        )
      }

      function makeCard(element) {
        const text = cleanText(element.innerText || element.textContent || '')
        const image = cardImage(element)
        const fingerprintBase = fnv1a(
          `${compactText(text)}|${image.split('?')[0]}`,
        )

        return {
          fingerprintBase,
          text: text.slice(0, 1400),
          imageUrl: image || null,
          directOrderId: findOrderId(element),
        }
      }

      function collectCards() {
        const uniqueElements = new Set()
        const all = [...document.querySelectorAll('body *')]

        for (const element of all) {
          if (element.children.length > 8) continue

          const text = cleanText(
            element.innerText || element.textContent || '',
          )

          if (
            text.length < 2 ||
            text.length > 120 ||
            !STATUS_RE.test(text)
          ) {
            continue
          }

          const card = findClickableCard(element)
          if (card) uniqueElements.add(card)
        }

        if (!uniqueElements.size) {
          for (const element of document.querySelectorAll(
            'article, li, a, button, div',
          )) {
            const text = cleanText(
              element.innerText || element.textContent || '',
            )
            if (
              text.length >= 15 &&
              text.length <= 1200 &&
              STATUS_RE.test(text) &&
              WON_RE.test(text)
            ) {
              const card = findClickableCard(element)
              if (card) uniqueElements.add(card)
            }
          }
        }

        const rawCards = [...uniqueElements]
          .map(makeCard)
          .filter((card) => card.text)

        const occurrence = new Map()
        return rawCards.map((card) => {
          const count = occurrence.get(card.fingerprintBase) || 0
          occurrence.set(card.fingerprintBase, count + 1)

          return {
            ...card,
            occurrence: count,
            cardKey: `${card.fingerprintBase}:${count}`,
          }
        })
      }

      function collectDirectOrderUrls() {
        const found = new Map()

        for (const element of document.querySelectorAll(
          'a[href], [data-href], [data-url], [data-link]',
        )) {
          for (const value of [
            element.getAttribute('href'),
            element.getAttribute('data-href'),
            element.getAttribute('data-url'),
            element.getAttribute('data-link'),
          ].filter(Boolean)) {
            try {
              const absolute = new URL(value, location.origin).href
              const match = absolute.match(ORDER_RE_IN_PAGE)
              if (match?.[1]) {
                found.set(
                  match[1],
                  `https://order.bunjang.co.kr/purchases/${match[1]}`,
                )
              }
            } catch {
              // Ignore.
            }
          }
        }

        const html = document.documentElement?.innerHTML || ''
        for (const match of html.matchAll(/\/purchases\/(\d+)/g)) {
          if (match?.[1]) {
            found.set(
              match[1],
              `https://order.bunjang.co.kr/purchases/${match[1]}`,
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

        return [...found.entries()].map(([orderId, orderUrl]) => ({
          orderId,
          orderUrl,
        }))
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
          const text = cleanText(
            button.innerText || button.textContent || '',
          ).toLowerCase()

          if (
            !text ||
            !labels.some((label) =>
              text.includes(label.toLowerCase()),
            )
          ) {
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
      let lastSignal = ''
      let stableRounds = 0

      for (let round = 0; round < 80; round += 1) {
        const control = await waitForControl()
        if (control === 'stop') break

        clickMoreButtons()

        window.scrollTo({
          top: document.documentElement.scrollHeight,
          behavior: 'auto',
        })

        await sleepInPage(650)

        const cards = collectCards()
        const direct = collectDirectOrderUrls()
        const signal = `${cards.length}:${direct.length}:${document.documentElement.scrollHeight}`

        if (signal === lastSignal) {
          stableRounds += 1
        } else {
          stableRounds = 0
        }

        lastSignal = signal

        if (
          cards.length >= maxOrders ||
          direct.length >= maxOrders ||
          stableRounds >= 4
        ) {
          break
        }
      }

      const cards = collectCards().slice(0, maxOrders)
      const directOrders = collectDirectOrderUrls().slice(
        0,
        maxOrders,
      )

      window.scrollTo({
        top: initialY,
        behavior: 'auto',
      })

      return {
        cards,
        directOrders,
      }
    },
    args: [MAX_ORDERS],
  })

  return result && typeof result === 'object'
    ? result
    : { cards: [], directOrders: [] }
}

async function clickCardInWorker(workerTabId, cardKey) {
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId: workerTabId },
    func: async (targetCardKey) => {
      const STATUS_RE =
        /(거래\s*완료|배송\s*완료|배송\s*중|거래\s*취소\s*완료|취소\s*요청|결제\s*완료|배송\s*준비|구매\s*완료|구매확정)/
      const WON_RE = /\d[\d,.]*\s*원/

      const sleepInPage = (ms) =>
        new Promise((resolve) => setTimeout(resolve, ms))

      function cleanText(value) {
        return String(value || '')
          .replace(/\u00a0/g, ' ')
          .replace(/[ \t]+/g, ' ')
          .replace(/\n{3,}/g, '\n\n')
          .trim()
      }

      function compactText(value) {
        return cleanText(value)
          .toLocaleLowerCase()
          .replace(/\s+/g, '')
      }

      function fnv1a(value) {
        let hash = 0x811c9dc5
        const text = String(value || '')

        for (let index = 0; index < text.length; index += 1) {
          hash ^= text.charCodeAt(index)
          hash = Math.imul(hash, 0x01000193)
        }

        return (hash >>> 0).toString(16).padStart(8, '0')
      }

      function getReactProps(element) {
        const values = []

        for (const key of Object.keys(element || {})) {
          if (key.startsWith('__reactProps$')) {
            values.push(element[key])
          } else if (key.startsWith('__reactFiber$')) {
            const fiber = element[key]
            if (fiber?.memoizedProps) values.push(fiber.memoizedProps)
            if (fiber?.pendingProps) values.push(fiber.pendingProps)
          }
        }

        return values
      }

      function hasClickSignal(element) {
        if (!element) return false

        if (
          element.tagName === 'A' ||
          element.tagName === 'BUTTON' ||
          element.getAttribute('role') === 'button'
        ) {
          return true
        }

        if (element.hasAttribute('onclick')) return true

        for (const props of getReactProps(element)) {
          if (props && typeof props.onClick === 'function') {
            return true
          }
        }

        try {
          if (getComputedStyle(element).cursor === 'pointer') {
            return true
          }
        } catch {
          // Ignore.
        }

        return false
      }

      function findClickableCard(seed) {
        let node = seed
        let fallback = null

        for (let depth = 0; depth < 9 && node; depth += 1) {
          const text = cleanText(
            node.innerText || node.textContent || '',
          )

          if (
            text.length >= 10 &&
            text.length <= 2500 &&
            STATUS_RE.test(text) &&
            WON_RE.test(text)
          ) {
            fallback = fallback || node
            if (hasClickSignal(node)) return node
          }

          node = node.parentElement
        }

        return fallback
      }

      function cardImage(element) {
        const img = element?.querySelector?.('img')
        return String(
          img?.currentSrc ||
            img?.src ||
            img?.getAttribute?.('src') ||
            '',
        )
      }

      function collectCards() {
        const uniqueElements = new Set()

        for (const element of document.querySelectorAll('body *')) {
          if (element.children.length > 8) continue

          const text = cleanText(
            element.innerText || element.textContent || '',
          )

          if (
            text.length < 2 ||
            text.length > 120 ||
            !STATUS_RE.test(text)
          ) {
            continue
          }

          const card = findClickableCard(element)
          if (card) uniqueElements.add(card)
        }

        if (!uniqueElements.size) {
          for (const element of document.querySelectorAll(
            'article, li, a, button, div',
          )) {
            const text = cleanText(
              element.innerText || element.textContent || '',
            )

            if (
              text.length >= 15 &&
              text.length <= 1200 &&
              STATUS_RE.test(text) &&
              WON_RE.test(text)
            ) {
              const card = findClickableCard(element)
              if (card) uniqueElements.add(card)
            }
          }
        }

        const occurrence = new Map()

        return [...uniqueElements].map((element) => {
          const text = cleanText(
            element.innerText || element.textContent || '',
          )
          const image = cardImage(element)
          const fingerprintBase = fnv1a(
            `${compactText(text)}|${image.split('?')[0]}`,
          )
          const count = occurrence.get(fingerprintBase) || 0
          occurrence.set(fingerprintBase, count + 1)

          return {
            element,
            cardKey: `${fingerprintBase}:${count}`,
          }
        })
      }

      async function scrollUntilFound() {
        let stable = 0
        let lastHeight = 0

        for (let round = 0; round < 80; round += 1) {
          const found = collectCards().find(
            (card) => card.cardKey === targetCardKey,
          )

          if (found) return found

          window.scrollTo({
            top: document.documentElement.scrollHeight,
            behavior: 'auto',
          })

          await sleepInPage(650)

          const height =
            document.documentElement.scrollHeight
          stable =
            height === lastHeight
              ? stable + 1
              : 0
          lastHeight = height

          if (stable >= 4) break
        }

        return collectCards().find(
          (card) => card.cardKey === targetCardKey,
        )
      }

      const card = await scrollUntilFound()
      if (!card?.element) {
        return {
          clicked: false,
          reason: 'Kaufkarte im Hilfs-Tab nicht wiedergefunden.',
        }
      }

      card.element.scrollIntoView({
        block: 'center',
        behavior: 'auto',
      })
      await sleepInPage(100)

      try {
        card.element.click()
      } catch {
        card.element.dispatchEvent(
          new MouseEvent('click', {
            bubbles: true,
            cancelable: true,
            view: window,
          }),
        )
      }

      return {
        clicked: true,
      }
    },
    args: [cardKey],
  })

  return result || { clicked: false }
}

async function returnWorkerToOverview(workerTabId, overviewUrl) {
  try {
    await chrome.tabs.goBack(workerTabId)
    const started = Date.now()

    while (Date.now() - started < 8000) {
      const tab = await chrome.tabs.get(workerTabId)
      const url = String(tab.url || '')
      if (!ORDER_RE.test(url)) {
        await waitForTabComplete(workerTabId, 5000)
        return
      }
      await sleep(120)
    }
  } catch {
    // Fallback below.
  }

  await chrome.tabs.update(workerTabId, {
    url: overviewUrl,
  })
  await waitForTabComplete(workerTabId)
}

async function probeUnresolvedCards(
  overviewUrl,
  unresolvedCards,
  state,
) {
  if (!unresolvedCards.length) return []

  status.textContent =
    `${unresolvedCards.length} neue Kaufkarte(n) haben keine sichtbare Order-ID.\n` +
    'Ermittle die Bestellnummern automatisch in einem inaktiven Hilfs-Tab …'

  const worker = await chrome.tabs.create({
    url: overviewUrl,
    active: false,
  })

  if (!worker.id) {
    throw new Error(
      'Hilfs-Tab für die automatische Kaufkarten-Erkennung konnte nicht erstellt werden.',
    )
  }

  const resolved = []

  try {
    await waitForTabComplete(worker.id)

    for (
      let index = 0;
      index < unresolvedCards.length;
      index += 1
    ) {
      if (stopRequested) break
      const canContinue = await waitIfPaused(
        `Kaufkarten prüfen: ${index}/${unresolvedCards.length} verarbeitet.`,
      )
      if (!canContinue) break

      const card = unresolvedCards[index]

      status.textContent =
        `Ermittle Bestellnummern aus Kaufkarten …\n` +
        `${index + 1}/${unresolvedCards.length}: ${card.text.slice(0, 80)}`

      const workerTab = await chrome.tabs.get(worker.id)
      if (ORDER_RE.test(String(workerTab.url || ''))) {
        await returnWorkerToOverview(
          worker.id,
          overviewUrl,
        )
      }

      const clickResult = await clickCardInWorker(
        worker.id,
        card.cardKey,
      )

      if (!clickResult?.clicked) {
        continue
      }

      const order = await waitForOrderUrl(worker.id)

      if (order) {
        state.cardMap[card.cardKey] = order.orderId

        resolved.push({
          ...order,
          cardKey: card.cardKey,
        })

        await writeState(state)
      }

      if (!stopRequested && index < unresolvedCards.length - 1) {
        await returnWorkerToOverview(
          worker.id,
          overviewUrl,
        )
      }
    }
  } finally {
    try {
      await chrome.tabs.remove(worker.id)
    } catch {
      // Ignore already closed tab.
    }
  }

  return resolved
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
          .filter((href) =>
            /\/products?\/\d+/i.test(href),
          )
          .slice(0, 12)

        const imageUrls = [
          ...doc.querySelectorAll('img'),
        ]
          .map(
            (img) =>
              img.currentSrc ||
              img.src ||
              '',
          )
          .filter((src) =>
            /^https?:\/\//i.test(src),
          )
          .slice(0, 12)

        return {
          productUrls,
          imageUrls,
        }
      }

      async function fetchOne(target) {
        try {
          const currentOrderMatch =
            location.href.match(/\/purchases\/(\d+)/i)

          if (
            currentOrderMatch?.[1] ===
            target.orderId
          ) {
            return {
              orderId: target.orderId,
              orderUrl: target.orderUrl,
              text: textFromDocument(document),
              ...extrasFromDocument(document),
              warning: null,
            }
          }

          const response = await fetch(
            target.orderUrl,
            {
              credentials: 'include',
              cache: 'no-store',
            },
          )

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
          const doc =
            new DOMParser().parseFromString(
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

      return Promise.all(
        targets.map(fetchOne),
      )
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

  const labelIndex = normalized.findIndex(
    (line) => line.startsWith('운송장'),
  )

  if (labelIndex < 0) return false

  for (
    let index = labelIndex;
    index <=
    Math.min(labelIndex + 4, normalized.length - 1);
    index += 1
  ) {
    const compact =
      normalized[index].replace(/[\s-]/g, '')

    if (/\d{8,16}/.test(compact)) {
      return true
    }
  }

  return false
}

function uniqueOrders(values) {
  const byId = new Map()

  for (const value of values) {
    if (!value?.orderId) continue

    byId.set(value.orderId, {
      orderId: value.orderId,
      orderUrl:
        value.orderUrl ||
        `https://order.bunjang.co.kr/purchases/${value.orderId}`,
    })
  }

  return [...byId.values()]
}

async function runSync(mode) {
  paused = false
  stopRequested = false
  setBusy(true)
  summary.hidden = true

  try {
    const tab = await getActiveBunjangTab()
    currentMainTabId = tab.id
    await setMainTabControl('run')
    const state = await readState()

    status.textContent =
      'Scanne die Bunjang-Kaufübersicht und lade automatisch weitere Kaufkarten …'

    const discovery = await scanOverview(tab.id)

    if (stopRequested) {
      status.textContent =
        `Scan beendet. ${Array.isArray(discovery.cards) ? discovery.cards.length : 0} Kaufkarte(n) wurden bis dahin erkannt.`
      return
    }

    const cards = Array.isArray(discovery.cards)
      ? discovery.cards
      : []
    const directOrders = Array.isArray(
      discovery.directOrders,
    )
      ? discovery.directOrders
      : []

    const resolvedFromCards = []
    const unresolved = []

    for (const card of cards) {
      if (card.directOrderId) {
        state.cardMap[card.cardKey] =
          card.directOrderId

        resolvedFromCards.push({
          orderId: card.directOrderId,
          orderUrl:
            `https://order.bunjang.co.kr/purchases/${card.directOrderId}`,
        })
        continue
      }

      const learnedOrderId =
        state.cardMap[card.cardKey]

      if (learnedOrderId) {
        resolvedFromCards.push({
          orderId: learnedOrderId,
          orderUrl:
            `https://order.bunjang.co.kr/purchases/${learnedOrderId}`,
        })
      } else {
        unresolved.push(card)
      }
    }

    await writeState(state)

    let probed = []
    if (unresolved.length) {
      probed = await probeUnresolvedCards(
        tab.url,
        unresolved,
        state,
      )
    }

    if (stopRequested) {
      status.textContent =
        'Sync beendet. Bereits gelernte Kaufkarten-Zuordnungen wurden gespeichert.'
      return
    }

    const discoveredOrders = uniqueOrders([
      ...directOrders,
      ...resolvedFromCards,
      ...probed,
    ])

    if (!discoveredOrders.length) {
      throw new Error(
        `Kaufkarten wurden erkannt (${cards.length}), aber keine Bestellnummer konnte automatisch ermittelt werden. ` +
          'Falls dies erneut auftritt, sende mir bitte die Meldung und einen Screenshot der Übersicht.',
      )
    }

    const knownOrders = state.orders || {}

    const targets =
      mode === 'full'
        ? discoveredOrders
        : discoveredOrders.filter(
            ({ orderId }) => {
              const known = knownOrders[orderId]
              return (
                !known ||
                known.trackingFound !== true
              )
            },
          )

    const skippedComplete =
      discoveredOrders.length - targets.length

    renderSummary([
      ['Kaufkarten erkannt', cards.length],
      [
        'Bestellnummern erkannt',
        discoveredOrders.length,
      ],
      ['Neu automatisch ermittelt', probed.length],
      ['Zu prüfen', targets.length],
      [
        'Bereits mit Tracking',
        skippedComplete,
      ],
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
      if (stopRequested) break
      const canContinue = await waitIfPaused(
        `Bestelldetails: ${completed}/${targets.length} geladen.`,
      )
      if (!canContinue) break

      const chunk = targets.slice(
        offset,
        offset + CHUNK_SIZE,
      )

      status.textContent =
        `Lade Bestelldetails …\n` +
        `${completed}/${targets.length} abgeschlossen`

      const chunkResults =
        await fetchOrderChunk(tab.id, chunk)

      orders.push(...chunkResults)
      completed += chunk.length

      const now = new Date().toISOString()

      for (const order of chunkResults) {
        knownOrders[order.orderId] = {
          trackingFound:
            trackingFound(order.text),
          lastCheckedAt: now,
          lastWarning:
            order.warning || null,
        }
      }

      state.orders = knownOrders
      await writeState(state)
    }

    const withTracking = orders.filter(
      (order) => trackingFound(order.text),
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
      source:
        'cardcargo-bunjang-order-extractor',
      version: 3.2,
      mode,
      stoppedEarly: stopRequested,
      capturedAt: new Date().toISOString(),
      pageUrl: tab.url,
      discovery: {
        cardsFound: cards.length,
        ordersFound: discoveredOrders.length,
        newlyProbed: probed.length,
        requested: targets.length,
        skippedComplete,
      },
      orders,
    }

    await navigator.clipboard.writeText(
      JSON.stringify(payload, null, 2),
    )

    status.textContent = stopRequested
      ? `Sync beendet. ${orders.length} bereits geladene Bestellung(en) wurden als Teil-Batch in die Zwischenablage kopiert.\nDu kannst später mit Smart Sync fortsetzen.`
      : 'Batch-Sync vorbereitet. Das gesamte JSON wurde einmalig in die Zwischenablage kopiert.\n' +
        'Jetzt in CardCargo → Bunjang Bestellungen synchronisieren → Aus Zwischenablage einlesen.'

    renderSummary([
      ['Kaufkarten erkannt', cards.length],
      [
        'Bestellungen identifiziert',
        discoveredOrders.length,
      ],
      ['Detailseiten geladen', orders.length],
      ['Mit Tracking', withTracking],
      ['Noch ohne Tracking', withoutTracking],
      ['Fehler', errors],
      [
        'Beim Smart Sync übersprungen',
        skippedComplete,
      ],
    ])
  } catch (error) {
    status.textContent =
      error instanceof Error
        ? error.message
        : 'Bunjang Smart Sync fehlgeschlagen.'
  } finally {
    await setMainTabControl('run')
    currentMainTabId = null
    setBusy(false)
  }
}

smartButton.addEventListener('click', () => {
  void runSync('smart')
})

fullButton.addEventListener('click', () => {
  void runSync('full')
})

pauseButton.addEventListener('click', async () => {
  if (pauseButton.disabled) return

  paused = !paused
  pauseButton.textContent = paused ? 'Fortsetzen' : 'Pausieren'
  await setMainTabControl(paused ? 'pause' : 'run')

  status.textContent = paused
    ? 'Pause angefordert. Der aktuell laufende kleine Schritt darf noch fertig werden.'
    : 'Sync wird fortgesetzt …'
})

stopButton.addEventListener('click', async () => {
  if (stopButton.disabled) return

  stopRequested = true
  paused = false
  pauseButton.textContent = 'Pausieren'
  await setMainTabControl('stop')

  status.textContent =
    'Beenden angefordert. Der aktuell laufende kleine Schritt wird noch abgeschlossen; danach stoppt der Sync kontrolliert.'
})

resetButton.addEventListener(
  'click',
  async () => {
    const confirmed = confirm(
      'Lokalen Bunjang-Sync-Stand wirklich zurücksetzen?\n\n' +
        'Dabei werden auch die gelernten Zuordnungen zwischen Kaufkarten und Order-IDs gelöscht.',
    )

    if (!confirmed) return

    await chrome.storage.local.remove(
      STORAGE_KEY,
    )

    status.textContent =
      'Lokaler Sync-Stand und gelernte Kaufkarten-Zuordnungen wurden zurückgesetzt.'

    renderSummary([])
  },
)
