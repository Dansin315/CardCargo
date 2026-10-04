const button = document.getElementById('copy')
const status = document.getElementById('status')

button.addEventListener('click', async () => {
  status.textContent = 'Analysiere Bunjang-Seite …'
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (!tab?.id || !tab.url) throw new Error('Kein aktiver Tab gefunden.')

    const host = new URL(tab.url).hostname.toLowerCase()
    if (!host.endsWith('bunjang.co.kr') && !host.endsWith('globalbunjang.com')) {
      throw new Error('Bitte zuerst eine Bunjang-Seite öffnen.')
    }

    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        const clean = (value) => String(value || '').replace(/\u00a0/g, ' ').replace(/[ \t]+/g, ' ').trim()
        const listingIdFromUrl = (value) => {
          const text = String(value || '')
          for (const pattern of [/\/products?\/(\d{5,})/i, /[?&](?:product|product_id|item|item_id|goods|goods_id)=(\d{5,})/i]) {
            const match = text.match(pattern)
            if (match?.[1]) return match[1]
          }
          return null
        }

        const shippingKeywords = /배송|운송장|송장|택배|발송|tracking|waybill|courier|shipping|delivery/i
        const trackingLike = /\b\d[\d -]{7,18}\d\b/

        const contextFor = (anchor) => {
          let node = anchor
          let fallback = null
          for (let depth = 0; depth < 9 && node; depth += 1) {
            const text = clean(node.innerText || '')
            if (text.length >= 25 && text.length <= 6000) {
              fallback = fallback || node
              if (shippingKeywords.test(text) || trackingLike.test(text)) return node
            }
            node = node.parentElement
          }
          return fallback || anchor.parentElement || anchor
        }

        const imageUrlsFor = (node) => [...node.querySelectorAll('img')]
          .map((img) => img.currentSrc || img.src || '')
          .filter((src) => /^https?:\/\//i.test(src))
          .slice(0, 12)

        const byId = new Map()
        for (const anchor of document.querySelectorAll('a[href]')) {
          const listingId = listingIdFromUrl(anchor.href)
          if (!listingId) continue
          const contextNode = contextFor(anchor)
          const candidate = {
            listingId,
            url: anchor.href,
            anchorText: clean(anchor.innerText || anchor.textContent || ''),
            contextText: clean(contextNode?.innerText || '').slice(0, 20000),
            imageUrls: imageUrlsFor(contextNode),
          }
          const current = byId.get(listingId)
          if (!current || candidate.contextText.length > current.contextText.length || (!current.anchorText && candidate.anchorText)) {
            byId.set(listingId, candidate)
          }
        }

        const currentListingId = listingIdFromUrl(location.href)
        if (currentListingId && !byId.has(currentListingId)) {
          byId.set(currentListingId, {
            listingId: currentListingId,
            url: location.href,
            anchorText: clean(document.querySelector('h1')?.innerText || document.title),
            contextText: clean(document.body?.innerText || '').slice(0, 20000),
            imageUrls: imageUrlsFor(document.body),
          })
        }

        const structuredJson = [...document.querySelectorAll('script[type="application/json"], script[type="application/ld+json"], script#__NEXT_DATA__')]
          .map((script) => script.textContent || '')
          .filter((text) => text.trim())
          .slice(0, 12)
          .map((text) => text.slice(0, 100000))

        return {
          source: 'cardcargo-bunjang-extractor',
          version: 1,
          capturedAt: new Date().toISOString(),
          page: {
            url: location.href,
            title: document.title,
            text: clean(document.body?.innerText || '').slice(0, 200000),
          },
          candidates: [...byId.values()].slice(0, 500),
          structuredJson,
        }
      },
    })

    if (!result) throw new Error('Bunjang-Seite konnte nicht ausgelesen werden.')
    const count = Array.isArray(result.candidates) ? result.candidates.length : 0
    await navigator.clipboard.writeText(JSON.stringify(result, null, 2))
    status.textContent = count > 0
      ? `${count} Bunjang-Produkt(e) erkannt und kopiert. Jetzt in CardCargo einlesen.`
      : 'Seite kopiert, aber keine Produktlinks erkannt. Öffne am besten eine Bestell- oder Produktdetailseite.'
  } catch (error) {
    status.textContent = error instanceof Error ? error.message : 'Bunjang-Daten konnten nicht extrahiert werden.'
  }
})
