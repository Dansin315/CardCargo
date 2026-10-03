const button = document.getElementById('copy')
const status = document.getElementById('status')

function cleanLine(value) {
  return String(value || '')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .trim()
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

function labelValue(lines, labels, options = {}) {
  const normalizedLabels = labels.map((label) => label.toLowerCase())
  for (let index = 0; index < lines.length; index += 1) {
    const lower = lines[index].toLowerCase()
    const matched = normalizedLabels.find(
      (label) => lower === label || lower.startsWith(`${label} `) || lower.startsWith(`${label}:`),
    )
    if (!matched) continue

    const inline = cleanLine(lines[index].slice(matched.length).replace(/^\s*:\s*/, ''))
    if (inline) return inline

    for (let offset = 1; offset <= (options.lookahead || 3); offset += 1) {
      const candidate = cleanLine(lines[index + offset])
      if (!candidate) continue
      if (normalizedLabels.includes(candidate.toLowerCase())) continue
      return candidate
    }
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

function parsePackages(lines) {
  const result = []
  const packageRe = /\bSTR-\d{8}-[A-Z0-9]+\b/i

  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(packageRe)
    if (!match) continue

    const externalPackageId = match[0].toUpperCase()
    if (result.some((entry) => entry.externalPackageId === externalPackageId)) continue

    let itemCategory = null
    for (let back = 1; back <= 3; back += 1) {
      const candidate = cleanLine(lines[index - back])
      if (
        candidate &&
        !/item info|shipping info|items?/i.test(candidate) &&
        !packageRe.test(candidate)
      ) {
        itemCategory = candidate
        break
      }
    }

    let recipientMasked = null
    let domesticTrackingNumber = null
    for (let forward = 1; forward <= 4; forward += 1) {
      const candidate = cleanLine(lines[index + forward])
      if (!candidate || packageRe.test(candidate)) break
      if (!domesticTrackingNumber && /^\d{8,15}$/.test(candidate.replace(/\s/g, ''))) {
        domesticTrackingNumber = candidate.replace(/\s/g, '')
        continue
      }
      if (
        !recipientMasked &&
        !/item info|shipping info|package information|box \d+/i.test(candidate)
      ) {
        recipientMasked = candidate
      }
    }

    result.push({
      externalPackageId,
      itemCategory,
      recipientMasked,
      domesticTrackingNumber,
    })
  }

  return result
}

function parseBoxes(lines) {
  const boxes = []
  for (let index = 0; index < lines.length; index += 1) {
    const boxMatch = lines[index].match(/^Box\s*(\d+)$/i)
    if (!boxMatch) continue

    const nextBoxIndex = lines.findIndex(
      (line, candidateIndex) => candidateIndex > index && /^Box\s*\d+$/i.test(line),
    )
    const block = lines.slice(index, nextBoxIndex > index ? nextBoxIndex : lines.length)
    const sizeText = labelValue(block, ['Size (W×H×L)', 'Size (WxHxL)', 'Size'])

    boxes.push({
      boxNumber: Number(boxMatch[1]),
      dimensions: parseDimensions(sizeText),
      realWeightKg: parseWeightKg(labelValue(block, ['Real Weight'])),
      volumeWeightKg: parseWeightKg(labelValue(block, ['Volume Weight'])),
      quoteWeightKg: parseWeightKg(labelValue(block, ['Quote Weight'])),
    })
  }
  return boxes
}

function parseShipment(text, pageUrl) {
  const lines = text
    .replace(/\r/g, '\n')
    .split('\n')
    .map(cleanLine)
    .filter(Boolean)

  const shipmentId =
    lines.map((line) => line.match(/\bSHP-\d{8}-[A-Z0-9]+\b/i)?.[0]).find(Boolean) ||
    null

  if (!shipmentId) return null

  const shipmentLineIndex = lines.findIndex((line) =>
    line.toUpperCase().includes(shipmentId.toUpperCase()),
  )
  const possibleStatus =
    shipmentLineIndex >= 0
      ? lines
          .slice(shipmentLineIndex, shipmentLineIndex + 4)
          .find(
            (line) =>
              !line.includes(shipmentId) &&
              /transferr|shipping|shipped|delivered|complete|prepar|pending|cancel/i.test(line),
          ) || null
      : null

  const shippingAmount = parseMoney(labelValue(lines, ['Shipping Amount']))
  const shippingFee = parseMoney(labelValue(lines, ['Shipping Fee']))
  const additionalFee = parseMoney(labelValue(lines, ['Additional Fee']))
  const insuranceFee = parseMoney(labelValue(lines, ['Insurance Fee']))
  const totalPayment = parseMoney(labelValue(lines, ['Total Payment']))
  const boxes = parseBoxes(lines)

  return {
    externalShipmentId: shipmentId.toUpperCase(),
    providerStatus: possibleStatus,
    createdAt: parseDateTime(labelValue(lines, ['Created At'])),
    completedAt: parseDateTime(labelValue(lines, ['Completed At'])),
    courier: labelValue(lines, ['Courier']),
    trackingNumber: labelValue(lines, ['Tracking Numbers', 'Tracking Number']),
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
    packages: parsePackages(lines),
    boxes,
    pageUrl,
    rawText: text.slice(0, 100000),
  }
}

button.addEventListener('click', async () => {
  button.disabled = true
  status.textContent = 'Lese OLAEET-Seite …'

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (!tab?.id) throw new Error('Kein aktiver Tab gefunden.')

    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => ({
        text: document.body?.innerText || '',
        url: location.href,
        title: document.title,
      }),
    })

    const text = String(result?.text || '').trim()
    if (!text) throw new Error('Kein sichtbarer OLAEET-Text gefunden.')

    const shipment = parseShipment(text, String(result?.url || ''))

    if (shipment) {
      const payload = {
        source: 'cardcargo-olaeet-extractor',
        version: 2,
        kind: 'international-shipment',
        extractedAt: new Date().toISOString(),
        shipments: [shipment],
      }

      await navigator.clipboard.writeText(JSON.stringify(payload, null, 2))
      status.textContent =
        `Sendung ${shipment.externalShipmentId} kopiert.\n` +
        `${shipment.packages.length} OLAEET-Paket(e) · ` +
        `${shipment.trackingNumber || 'keine internationale Trackingnummer'}`
      return
    }

    // Existing package importer remains backwards compatible with the plain
    // OLAEET warehouse-page text.
    await navigator.clipboard.writeText(text)
    status.textContent =
      `Paket-/Lagerdaten kopiert (${text.length.toLocaleString('de-DE')} Zeichen).`
  } catch (error) {
    status.textContent =
      error instanceof Error ? error.message : 'Daten konnten nicht extrahiert werden.'
  } finally {
    button.disabled = false
  }
})
