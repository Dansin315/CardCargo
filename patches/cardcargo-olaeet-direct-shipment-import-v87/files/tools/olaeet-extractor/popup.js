const button = document.getElementById('copy')
const status = document.getElementById('status')

function cleanLine(value) {
  return String(value || '')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .trim()
}

function unique(values) {
  return [...new Set(values.filter(Boolean))]
}

function parseMoney(value) {
  const text = String(value || '')
  const currency = text.includes('₩') || /KRW/i.test(text) ? 'KRW' : null
  const digits = text.replace(/[^\d.-]/g, '')
  if (!digits) return { amount: null, currency }
  const amount = Number(digits)
  return {
    amount: Number.isFinite(amount) ? amount : null,
    currency,
  }
}

function parseWeightKg(value) {
  const match = String(value || '').match(/(\d+(?:[.,]\d+)?)\s*(kg|g)\b/i)
  if (!match) return null
  const number = Number(match[1].replace(',', '.'))
  if (!Number.isFinite(number)) return null
  return match[2].toLowerCase() === 'g' ? number / 1000 : number
}

function parseDimensions(value) {
  const match = String(value || '').match(
    /(\d+(?:[.,]\d+)?)\s*[x×]\s*(\d+(?:[.,]\d+)?)\s*[x×]\s*(\d+(?:[.,]\d+)?)\s*cm/i,
  )
  if (!match) return null
  const values = match.slice(1, 4).map((entry) => Number(entry.replace(',', '.')))
  if (values.some((entry) => !Number.isFinite(entry))) return null
  return {
    widthCm: values[0],
    heightCm: values[1],
    lengthCm: values[2],
    raw: cleanLine(value),
  }
}

function parseDateTime(value) {
  const text = cleanLine(value)
  if (!text || /not completed|not available|^-$/i.test(text)) return null
  const match = text.match(
    /(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})(?:\s+|T)(\d{1,2}):(\d{2})(?::(\d{2}))?/,
  )
  if (!match) return text
  const [, year, month, day, hour, minute, second = '00'] = match
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:${minute}:${second}+09:00`
}

function textLines(text) {
  return String(text || '')
    .replace(/\r/g, '\n')
    .split('\n')
    .map(cleanLine)
    .filter(Boolean)
}

function labelValue(lines, labels, options = {}) {
  const normalizedLabels = labels.map((label) => label.toLowerCase())

  for (let index = 0; index < lines.length; index += 1) {
    const lower = lines[index].toLowerCase()
    const matched = normalizedLabels.find(
      (label) =>
        lower === label ||
        lower.startsWith(`${label} `) ||
        lower.startsWith(`${label}:`),
    )
    if (!matched) continue

    const inline = cleanLine(
      lines[index].slice(matched.length).replace(/^\s*:\s*/, ''),
    )
    if (inline) return inline

    for (let offset = 1; offset <= (options.lookahead || 4); offset += 1) {
      const candidate = cleanLine(lines[index + offset])
      if (!candidate) continue
      if (normalizedLabels.includes(candidate.toLowerCase())) continue
      return candidate
    }
  }

  return null
}

function labelDateTime(lines, labels) {
  const normalizedLabels = labels.map((label) => label.toLowerCase())

  for (let index = 0; index < lines.length; index += 1) {
    const lower = lines[index].toLowerCase()
    if (!normalizedLabels.includes(lower)) continue

    const next = lines.slice(index + 1, index + 5)
    if (!next.length) return null

    if (/not completed|not available|^-$/i.test(next[0])) {
      return null
    }

    const date = next.find((value) =>
      /^20\d{2}[-/.]\d{1,2}[-/.]\d{1,2}$/.test(value),
    )
    if (!date) {
      return parseDateTime(next[0])
    }

    const dateIndex = next.indexOf(date)
    const time =
      next
        .slice(dateIndex + 1, dateIndex + 3)
        .find((value) => /^\d{1,2}:\d{2}(?::\d{2})?$/.test(value)) ||
      null

    return parseDateTime(time ? `${date} ${time}` : date)
  }

  return null
}

function parseAddress(lines) {
  return {
    name: labelValue(lines, ['Name']),
    addressLine1: labelValue(lines, ['Address Line 1', 'Address 1']),
    city: labelValue(lines, ['City']),
    country: labelValue(lines, ['Country']),
    zipCode: labelValue(lines, ['Zip Code', 'Postal Code']),
    contact: labelValue(lines, ['Contact', 'Phone']),
  }
}

function parseExpectedCounts(text, shipmentId) {
  const lines = textLines(text)
  const target = String(shipmentId || '').toUpperCase()

  // OLAEET renders the overview row as separate DOM/text lines:
  //
  // 27 Items
  // /
  // 1 Box
  // SHP-...
  //
  // Therefore the old per-line regex could never see "27 Items / 1 Box".
  // Evaluate a compact window around every occurrence of the target shipment.
  const idIndexes = []

  for (let index = 0; index < lines.length; index += 1) {
    if (target && lines[index].toUpperCase().includes(target)) {
      idIndexes.push(index)
    }
  }

  for (const idIndex of idIndexes) {
    const block = lines
      .slice(Math.max(0, idIndex - 8), idIndex + 5)
      .join(' ')

    const match = block.match(
      /(\d+)\s*Items?\s*\/?\s*(\d+)\s*Box(?:es)?/i,
    )

    if (match) {
      return {
        itemCount: Number(match[1]),
        boxCount: Number(match[2]),
      }
    }
  }

  // General fallback for layout variants where the count and shipment ID are
  // still in the same larger text block.
  const joined = lines.join(' ')
  const countBeforeId = target
    ? joined.match(
        new RegExp(
          `(\\d+)\\s*Items?\\s*\\/?\\s*(\\d+)\\s*Box(?:es)?[\\s\\S]{0,240}${target.replace(
            /[-/\\^$*+?.()|[\]{}]/g,
            '\\$&',
          )}`,
          'i',
        ),
      )
    : null

  if (countBeforeId) {
    return {
      itemCount: Number(countBeforeId[1]),
      boxCount: Number(countBeforeId[2]),
    }
  }

  return { itemCount: null, boxCount: null }
}

function parsePackageRecord(record) {
  const rawText = String(record?.text || '')
  const cellTexts = Array.isArray(record?.cells)
    ? record.cells
        .map((entry) => String(entry || '').trim())
        .filter(Boolean)
    : []

  // Preserve line boundaries. The old implementation cleaned the complete
  // row too early, which could make the category look like the recipient.
  const combined = [rawText, ...cellTexts].filter(Boolean).join('\n')
  const allLines = textLines(combined)

  const idIndex = allLines.findIndex((line) =>
    /\bSTR-\d{8}-[A-Z0-9]+\b/i.test(line),
  )
  if (idIndex < 0) return null

  const idMatch = allLines[idIndex].match(
    /\bSTR-\d{8}-[A-Z0-9]+\b/i,
  )
  if (!idMatch) return null

  const externalPackageId = idMatch[0].toUpperCase()

  const isTracking = (line) =>
    /^(?:\D*?)(\d{8,15})(?:\D*?)$/.test(line) &&
    !line.includes(externalPackageId)

  let domesticTrackingNumber = null
  for (const line of allLines.slice(idIndex + 1, idIndex + 6)) {
    const match = line.match(/(?<!\d)(\d{8,15})(?!\d)/)
    if (match) {
      domesticTrackingNumber = match[1]
      break
    }
  }

  if (!domesticTrackingNumber) {
    domesticTrackingNumber =
      [...combined.matchAll(/(?<!\d)(\d{8,15})(?!\d)/g)]
        .map((match) => match[1])
        .find((value) => !externalPackageId.includes(value)) || null
  }

  const itemCategory =
    idIndex > 0 &&
    !/item info|shipping info|items?/i.test(allLines[idIndex - 1])
      ? allLines[idIndex - 1]
      : null

  let recipientMasked = null

  // In OLAEET's shipping drawer the stable order is:
  // category -> STR id -> masked recipient -> domestic tracking.
  for (const line of allLines.slice(idIndex + 1, idIndex + 5)) {
    if (line === domesticTrackingNumber) continue
    if (isTracking(line)) continue
    if (/^\d{8,15}$/.test(line.replace(/\s/g, ''))) continue
    if (/shipping info|item info|items?|package information|box \d+/i.test(line)) {
      continue
    }
    if (/\bSTR-\d{8}-[A-Z0-9]+\b/i.test(line)) continue
    if (itemCategory && line === itemCategory) continue

    recipientMasked = line
    break
  }

  return {
    externalPackageId,
    itemCategory,
    recipientMasked,
    domesticTrackingNumber,
    rawRowText: combined.slice(0, 1200),
  }
}

function parsePackages(records, combinedText) {
  const byId = new Map()

  for (const record of records || []) {
    const parsed = parsePackageRecord(record)
    if (!parsed) continue

    const previous = byId.get(parsed.externalPackageId)
    byId.set(parsed.externalPackageId, {
      ...previous,
      ...parsed,
      itemCategory: parsed.itemCategory || previous?.itemCategory || null,
      recipientMasked: parsed.recipientMasked || previous?.recipientMasked || null,
      domesticTrackingNumber:
        parsed.domesticTrackingNumber || previous?.domesticTrackingNumber || null,
    })
  }

  // Text fallback for any STR IDs not captured as a DOM row. This also handles
  // OLAEET layouts where the tracking number shares the same line as the ID.
  const lines = textLines(combinedText)
  for (let index = 0; index < lines.length; index += 1) {
    const ids = [...lines[index].matchAll(/\bSTR-\d{8}-[A-Z0-9]+\b/gi)]
    for (const idMatch of ids) {
      const externalPackageId = idMatch[0].toUpperCase()
      const nearby = lines.slice(Math.max(0, index - 2), index + 4).join('\n')
      const parsed = parsePackageRecord({ text: nearby, cells: [] })
      if (!parsed) continue

      const previous = byId.get(externalPackageId)
      byId.set(externalPackageId, {
        ...parsed,
        ...previous,
        itemCategory: previous?.itemCategory || parsed.itemCategory || null,
        recipientMasked: previous?.recipientMasked || parsed.recipientMasked || null,
        domesticTrackingNumber:
          previous?.domesticTrackingNumber || parsed.domesticTrackingNumber || null,
      })
    }
  }

  return [...byId.values()].sort((left, right) =>
    left.externalPackageId.localeCompare(right.externalPackageId),
  )
}

function parseBoxes(lines) {
  const boxes = []
  const seen = new Set()

  for (let index = 0; index < lines.length; index += 1) {
    const boxMatch = lines[index].match(/^Box\s*(\d+)$/i)
    if (!boxMatch) continue

    const boxNumber = Number(boxMatch[1])
    if (seen.has(boxNumber)) continue
    seen.add(boxNumber)

    let nextBoxIndex = lines.length
    for (let candidateIndex = index + 1; candidateIndex < lines.length; candidateIndex += 1) {
      if (/^Box\s*\d+$/i.test(lines[candidateIndex])) {
        nextBoxIndex = candidateIndex
        break
      }
    }

    const block = lines.slice(index, nextBoxIndex)
    const sizeText = labelValue(block, ['Size (W×H×L)', 'Size (WxHxL)', 'Size'])

    boxes.push({
      boxNumber,
      dimensions: parseDimensions(sizeText),
      realWeightKg: parseWeightKg(labelValue(block, ['Real Weight'])),
      volumeWeightKg: parseWeightKg(labelValue(block, ['Volume Weight'])),
      quoteWeightKg: parseWeightKg(labelValue(block, ['Quote Weight'])),
    })
  }

  return boxes
}

function parseShipment(capture) {
  const pageUrl = String(capture?.url || '')
  const routeShipmentId =
    pageUrl.match(/\/shipping\/(SHP-\d{8}-[A-Z0-9]+)/i)?.[1]?.toUpperCase() || null

  const combinedText = unique([
    capture?.drawerText,
    ...(capture?.snapshots || []),
    capture?.bodyText,
  ]).join('\n')
  const lines = textLines(combinedText)

  const domShipmentId =
    lines
      .map((line) => line.match(/\bSHP-\d{8}-[A-Z0-9]+\b/i)?.[0])
      .find(Boolean)
      ?.toUpperCase() || null

  const shipmentId = routeShipmentId || domShipmentId
  if (!shipmentId) return null

  const expected = parseExpectedCounts(capture?.bodyText || combinedText, shipmentId)
  const packages = parsePackages(capture?.packageRows || [], combinedText)
  const boxes = parseBoxes(lines)

  const shipmentLineIndex = lines.findIndex((line) =>
    line.toUpperCase().includes(shipmentId),
  )
  let possibleStatus = null

  if (shipmentLineIndex >= 0) {
    const sameLine = cleanLine(
      lines[shipmentLineIndex]
        .replace(new RegExp(shipmentId, 'i'), '')
        .trim(),
    )
    if (
      sameLine &&
      /transferr|shipping|shipped|delivered|complete|prepar|pending|cancel/i.test(sameLine)
    ) {
      possibleStatus = sameLine
    }

    possibleStatus ||=
      lines
        .slice(shipmentLineIndex + 1, shipmentLineIndex + 5)
        .find((line) =>
          /transferr|shipping|shipped|delivered|complete|prepar|pending|cancel/i.test(line),
        ) || null
  }

  const shippingAmount = parseMoney(labelValue(lines, ['Shipping Amount']))
  const shippingFee = parseMoney(labelValue(lines, ['Shipping Fee']))
  const additionalFee = parseMoney(labelValue(lines, ['Additional Fee']))
  const insuranceFee = parseMoney(labelValue(lines, ['Insurance Fee']))
  const totalPayment = parseMoney(labelValue(lines, ['Total Payment']))

  const trackingRaw = labelValue(lines, ['Tracking Numbers', 'Tracking Number'])
  const trackingNumbers = trackingRaw
    ? unique(
        trackingRaw
          .split(/[\s,;/]+/)
          .map(cleanLine)
          .filter((entry) => /[A-Z0-9]{8,}/i.test(entry)),
      )
    : []

  const extractionComplete =
    expected.itemCount !== null &&
    expected.boxCount !== null &&
    packages.length === expected.itemCount &&
    boxes.length === expected.boxCount

  return {
    externalShipmentId: shipmentId,
    providerStatus: possibleStatus,
    createdAt: labelDateTime(lines, ['Created At']),
    completedAt: labelDateTime(lines, ['Completed At']),
    courier: labelValue(lines, ['Courier']),
    trackingNumber: trackingNumbers[0] || trackingRaw,
    trackingNumbers,
    paymentTransactionId: labelValue(lines, ['Payment Transaction ID']),
    shippingAmount: shippingAmount.amount,
    shippingFee: shippingFee.amount,
    additionalFee: additionalFee.amount,
    insuranceFee: insuranceFee.amount,
    totalPayment: totalPayment.amount,
    currency:
      totalPayment.currency ||
      shippingAmount.currency ||
      shippingFee.currency ||
      additionalFee.currency ||
      insuranceFee.currency ||
      'KRW',
    address: parseAddress(lines),
    packages,
    boxes,
    expectedItemCount: expected.itemCount,
    expectedBoxCount: expected.boxCount,
    extractionComplete,
    pageUrl,
    rawText: combinedText.slice(0, 180000),
    diagnostics: {
      routeShipmentId,
      drawerFound: Boolean(capture?.drawerFound),
      scrollContainerCount: Number(capture?.scrollContainerCount || 0),
      snapshots: Array.isArray(capture?.snapshots) ? capture.snapshots.length : 0,
      packageRowsCaptured: Array.isArray(capture?.packageRows)
        ? capture.packageRows.length
        : 0,
      packageTrackingFound: packages.filter((entry) => entry.domesticTrackingNumber).length,
    },
  }
}

button.addEventListener('click', async () => {
  button.disabled = true
  status.textContent = 'Lese Shipping-Panel vollständig aus …'

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (!tab?.id) throw new Error('Kein aktiver Tab gefunden.')

    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: async () => {
        const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
        const packageRe = /\bSTR-\d{8}-[A-Z0-9]+\b/gi

        function visible(element) {
          if (!(element instanceof HTMLElement)) return false
          const style = getComputedStyle(element)
          if (style.display === 'none' || style.visibility === 'hidden') return false
          const rect = element.getBoundingClientRect()
          return rect.width > 20 && rect.height > 20
        }

        function elementScore(element) {
          const text = String(element.innerText || '')
          if (!text) return -1

          let score = 0
          if (/\bShipping\b/i.test(text)) score += 2
          if (/Check shipping details/i.test(text)) score += 4
          if (/Address Information/i.test(text)) score += 8
          if (/\bItems\b/i.test(text)) score += 8
          if (/Package Information/i.test(text)) score += 7
          if (/\bSHP-\d{8}-[A-Z0-9]+\b/i.test(text)) score += 5

          const rect = element.getBoundingClientRect()
          if (rect.left > window.innerWidth * 0.4) score += 3
          if (rect.height > window.innerHeight * 0.6) score += 2

          return score
        }

        function findDrawer() {
          const preferred = [
            ...document.querySelectorAll(
              '[role="dialog"], [aria-modal="true"], aside, [class*="Drawer"], [class*="drawer"], [class*="Modal"], [class*="modal"], [class*="Sheet"], [class*="sheet"]',
            ),
          ].filter(visible)

          const all = preferred.length
            ? preferred
            : [...document.querySelectorAll('body *')].filter(visible)

          let best = null
          let bestScore = -1
          let bestArea = Number.POSITIVE_INFINITY

          for (const element of all) {
            const score = elementScore(element)
            if (score < 10) continue
            const rect = element.getBoundingClientRect()
            const area = Math.max(1, rect.width * rect.height)

            if (score > bestScore || (score === bestScore && area < bestArea)) {
              best = element
              bestScore = score
              bestArea = area
            }
          }

          if (best) return best

          const addressHeading = [...document.querySelectorAll('body *')].find(
            (element) =>
              visible(element) &&
              String(element.textContent || '').trim() === 'Address Information',
          )

          let current = addressHeading instanceof HTMLElement ? addressHeading : null
          while (current && current !== document.body) {
            const text = String(current.innerText || '')
            if (/Address Information/i.test(text) && /\bItems\b/i.test(text)) {
              return current
            }
            current = current.parentElement
          }

          return null
        }

        function capturePackageRows(root) {
          const records = []
          const seen = new Set()
          const elements = [
            ...root.querySelectorAll('tr, [role="row"], li, article, section, div'),
          ]

          for (const element of elements) {
            if (!(element instanceof HTMLElement) || !visible(element)) continue
            const text = String(element.innerText || '').trim()
            const ids = [...text.matchAll(packageRe)].map((match) => match[0].toUpperCase())
            if (ids.length !== 1 || text.length > 1600) continue

            const id = ids[0]
            const digit = text.match(/(?<!\d)\d{8,15}(?!\d)/)
            if (!digit && element.tagName !== 'TR' && element.getAttribute('role') !== 'row') {
              continue
            }

            const cells = [
              ...element.querySelectorAll(':scope > td, :scope > th, :scope > [role="cell"]'),
            ]
              .map((cell) => String(cell.innerText || '').trim())
              .filter(Boolean)

            const key = `${id}|${text}`
            if (seen.has(key)) continue
            seen.add(key)
            records.push({ text, cells })
          }

          // If table semantics are not used, capture the smallest visible DOM
          // element for every STR id. This is common in React grid layouts.
          const idElements = [...root.querySelectorAll('*')].filter((element) => {
            if (!(element instanceof HTMLElement) || !visible(element)) return false
            const text = String(element.innerText || '').trim()
            return /^STR-\d{8}-[A-Z0-9]+$/i.test(text)
          })

          for (const idElement of idElements) {
            const id = String(idElement.innerText || '').trim().toUpperCase()
            let row = idElement.parentElement
            let best = null

            for (let depth = 0; row && depth < 5; depth += 1, row = row.parentElement) {
              const text = String(row.innerText || '').trim()
              const ids = [...text.matchAll(packageRe)]
              if (ids.length !== 1 || text.length > 1600) continue
              if (/(?<!\d)\d{8,15}(?!\d)/.test(text)) {
                best = row
                break
              }
            }

            if (!best) continue
            const text = String(best.innerText || '').trim()
            const cells = [...best.children]
              .map((child) => String(child.innerText || '').trim())
              .filter(Boolean)
            const key = `${id}|${text}`
            if (!seen.has(key)) {
              seen.add(key)
              records.push({ text, cells })
            }
          }

          return records
        }

        const drawer = findDrawer()
        const root = drawer || document.body
        const snapshots = []
        const rowMap = new Map()

        function snapshot() {
          const text = String(root.innerText || '').trim()
          if (text && !snapshots.includes(text)) snapshots.push(text)

          for (const row of capturePackageRows(root)) {
            const id = row.text.match(packageRe)?.[0]?.toUpperCase()
            if (!id) continue
            const key = `${id}|${row.text}`
            rowMap.set(key, row)
          }
        }

        snapshot()

        const scrollables = [root, ...root.querySelectorAll('*')]
          .filter((element) => {
            if (!(element instanceof HTMLElement) || !visible(element)) return false
            const style = getComputedStyle(element)
            const canScroll = /(auto|scroll)/.test(
              `${style.overflowY} ${style.overflow}`,
            )
            return (
              element.scrollHeight > element.clientHeight + 80 &&
              (canScroll || element === root)
            )
          })
          .sort((left, right) => right.scrollHeight - left.scrollHeight)
          .slice(0, 8)

        const originalPositions = new Map()
        let totalSteps = 0

        for (const scroller of scrollables) {
          originalPositions.set(scroller, scroller.scrollTop)
          const max = Math.max(0, scroller.scrollHeight - scroller.clientHeight)
          const step = Math.max(220, Math.floor(scroller.clientHeight * 0.72))

          for (let top = 0; top <= max && totalSteps < 220; top += step) {
            scroller.scrollTop = Math.min(top, max)
            await sleep(80)
            snapshot()
            totalSteps += 1
          }

          scroller.scrollTop = max
          await sleep(120)
          snapshot()
        }

        for (const [scroller, position] of originalPositions.entries()) {
          scroller.scrollTop = position
        }

        return {
          url: location.href,
          title: document.title,
          bodyText: String(document.body?.innerText || ''),
          drawerText: String(root.innerText || ''),
          drawerFound: Boolean(drawer),
          snapshots,
          packageRows: [...rowMap.values()],
          scrollContainerCount: scrollables.length,
        }
      },
    })

    const bodyText = String(result?.bodyText || '').trim()
    if (!bodyText) throw new Error('Kein sichtbarer OLAEET-Text gefunden.')

    const shipment = parseShipment(result)

    if (shipment) {
      const payload = {
        source: 'cardcargo-olaeet-extractor',
        version: 2.1,
        kind: 'international-shipment',
        extractedAt: new Date().toISOString(),
        shipments: [shipment],
      }

      await navigator.clipboard.writeText(JSON.stringify(payload, null, 2))

      const expectedText =
        shipment.expectedItemCount === null
          ? `${shipment.packages.length} Paket(e)`
          : `${shipment.packages.length}/${shipment.expectedItemCount} Paket(e)`

      const missingTracking = shipment.packages.filter(
        (entry) => !entry.domesticTrackingNumber,
      ).length

      status.textContent =
        `${shipment.externalShipmentId} kopiert.\n` +
        `${expectedText} · ${shipment.boxes.length}${
          shipment.expectedBoxCount === null ? '' : `/${shipment.expectedBoxCount}`
        } Box(en) · ${shipment.trackingNumber || 'kein internationales Tracking'}\n` +
        (shipment.extractionComplete
          ? `Extraction vollständig${missingTracking ? ` · ${missingTracking} Paket(e) ohne Tracking` : ''}.`
          : `WARNUNG: Extraction unvollständig. OLAEET meldet ${shipment.expectedItemCount} Items, erkannt wurden nur ${shipment.packages.length}. Noch einmal ausführen.`)
      return
    }

    // Existing warehouse-package extraction stays backwards compatible.
    await navigator.clipboard.writeText(bodyText)
    status.textContent =
      `Paket-/Lagerdaten kopiert (${bodyText.length.toLocaleString('de-DE')} Zeichen).`
  } catch (error) {
    status.textContent =
      error instanceof Error ? error.message : 'Daten konnten nicht extrahiert werden.'
  } finally {
    button.disabled = false
  }
})
