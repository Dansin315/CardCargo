const button = document.getElementById('scan')
const status = document.getElementById('status')

button.addEventListener('click', async () => {
  status.textContent = 'Suche Bestelllinks …'
  button.disabled = true

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (!tab?.id || !tab.url) throw new Error('Kein aktiver Tab gefunden.')

    const host = new URL(tab.url).hostname.toLowerCase()
    if (host !== 'order.bunjang.co.kr') {
      throw new Error('Bitte die Bunjang-Kaufübersicht unter order.bunjang.co.kr öffnen.')
    }

    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: async () => {
        const orderPattern = /\/purchases\/(\d+)/i

        function uniqueOrderUrls() {
          const found = new Map()

          for (const element of document.querySelectorAll('a[href], [data-href], [data-url]')) {
            const values = [
              element.getAttribute('href'),
              element.getAttribute('data-href'),
              element.getAttribute('data-url'),
            ].filter(Boolean)

            for (const value of values) {
              const absolute = new URL(value, location.origin).href
              const match = absolute.match(orderPattern)
              if (match?.[1]) found.set(match[1], absolute)
            }
          }

          const htmlMatches = document.documentElement.innerHTML.match(
            /\/purchases\/\d+/g,
          ) || []
          for (const relative of htmlMatches) {
            const match = relative.match(orderPattern)
            if (match?.[1] && !found.has(match[1])) {
              found.set(match[1], new URL(relative, location.origin).href)
            }
          }

          const current = location.href.match(orderPattern)
          if (current?.[1]) found.set(current[1], location.href)

          return [...found.entries()].slice(0, 200)
        }

        function textFromDocument(doc) {
          return String(doc.body?.innerText || doc.body?.textContent || '')
            .replace(/\u00a0/g, ' ')
            .trim()
        }

        function extrasFromDocument(doc) {
          const productUrls = [...doc.querySelectorAll('a[href]')]
            .map((anchor) => anchor.href)
            .filter((href) => /\/products?\/\d+/i.test(href))
            .slice(0, 12)

          const imageUrls = [...doc.querySelectorAll('img')]
            .map((img) => img.currentSrc || img.src || '')
            .filter((src) => /^https?:\/\//i.test(src))
            .slice(0, 12)

          return { productUrls, imageUrls }
        }

        async function viaFetch(orderId, orderUrl) {
          const response = await fetch(orderUrl, {
            credentials: 'include',
            cache: 'no-store',
          })
          if (!response.ok) {
            return {
              orderId,
              orderUrl,
              text: '',
              productUrls: [],
              imageUrls: [],
              warning: `Detailseite HTTP ${response.status}`,
            }
          }

          const html = await response.text()
          const doc = new DOMParser().parseFromString(html, 'text/html')
          const text = textFromDocument(doc)
          const extras = extrasFromDocument(doc)

          return {
            orderId,
            orderUrl,
            text,
            ...extras,
            warning:
              text.includes('주문번호') || text.includes('운송장')
                ? null
                : 'Fetch enthielt noch keine gerenderten Bestelldaten.',
          }
        }

        async function currentDetail(orderId, orderUrl) {
          if (location.href.match(orderPattern)?.[1] !== orderId) return null
          return {
            orderId,
            orderUrl,
            text: textFromDocument(document),
            ...extrasFromDocument(document),
            warning: null,
          }
        }

        const orderUrls = uniqueOrderUrls()
        if (!orderUrls.length) {
          return {
            source: 'cardcargo-bunjang-order-extractor',
            version: 2,
            capturedAt: new Date().toISOString(),
            orders: [],
            warning:
              'Keine /purchases/<Bestellnummer>-Links gefunden. Scrolle die Kaufübersicht, damit die Käufe geladen sind.',
          }
        }

        const orders = []
        for (let index = 0; index < orderUrls.length; index += 1) {
          const [orderId, orderUrl] = orderUrls[index]
          const current = await currentDetail(orderId, orderUrl)
          const detail = current || await viaFetch(orderId, orderUrl)
          orders.push(detail)

          // Small pause avoids hammering the account page when many orders are loaded.
          if (!current && index < orderUrls.length - 1) {
            await new Promise((resolve) => setTimeout(resolve, 120))
          }
        }

        return {
          source: 'cardcargo-bunjang-order-extractor',
          version: 2,
          capturedAt: new Date().toISOString(),
          pageUrl: location.href,
          orders,
        }
      },
    })

    const orders = result?.orders || []
    if (!orders.length) {
      throw new Error(result?.warning || 'Keine Bestellungen gefunden.')
    }

    await navigator.clipboard.writeText(JSON.stringify(result, null, 2))
    const trackingPages = orders.filter((order) =>
      String(order.text || '').includes('운송장'),
    ).length

    status.textContent =
      `${orders.length} Bestelldetailseite(n) geladen; ` +
      `${trackingPages} enthalten bereits Versandinformationen. JSON wurde kopiert.`
  } catch (error) {
    status.textContent =
      error instanceof Error ? error.message : 'Bunjang-Scan fehlgeschlagen.'
  } finally {
    button.disabled = false
  }
})
