export interface OlaeetImportRecord {
  externalPackageId: string | null
  packageDescription: string | null
  senderName: string | null
  domesticCarrier: string | null
  domesticTrackingNumber: string | null
  providerStatus: string | null
  arrivedAt: string | null
  inspectedAt: string | null
  weightGrams: number | null
  lengthCm: number | null
  widthCm: number | null
  heightCm: number | null
  rawBlock: string
}

export interface OlaeetParseResult {
  records: OlaeetImportRecord[]
  warnings: string[]
}

const PACKAGE_ID_RE = /\bSTR-\d{8}-[A-Z0-9]+\b/i
const DIMENSION_RE =
  /(\d+(?:[.,]\d+)?)\s*[x×X]\s*(\d+(?:[.,]\d+)?)\s*[x×X]\s*(\d+(?:[.,]\d+)?)\s*cm\b/i
const WEIGHT_RE = /\b(\d+(?:[.,]\d+)?)\s*(kg|g)\b/i
const SHORT_TIME_RE = /\b(\d{2})-(\d{2})\s+(\d{1,2}):(\d{2})\b/
const LONG_TIME_RE = /\b(\d{4})-(\d{2})-(\d{2})[ T]+(\d{1,2}):(\d{2})\b/

function cleanLine(value: string) {
  return value.replace(/\u00a0/g, ' ').trim().replace(/\s+/g, ' ')
}

function parseDecimal(value: string) {
  const parsed = Number(value.replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : null
}

function toKoreaIso(line: string, fallbackYear: number) {
  const long = line.match(LONG_TIME_RE)
  if (long) {
    const [, year, month, day, hour, minute] = long
    return `${year}-${month}-${day}T${String(hour).padStart(2, '0')}:${minute}:00+09:00`
  }

  const short = line.match(SHORT_TIME_RE)
  if (!short) return null
  const [, month, day, hour, minute] = short
  return `${fallbackYear}-${month}-${day}T${String(hour).padStart(2, '0')}:${minute}:00+09:00`
}

function looksLikeMetadata(line: string) {
  return (
    !line ||
    PACKAGE_ID_RE.test(line) ||
    DIMENSION_RE.test(line) ||
    WEIGHT_RE.test(line) ||
    SHORT_TIME_RE.test(line) ||
    LONG_TIME_RE.test(line) ||
    /packing|received|arrived|inspection|inspected|stored|storage|consolidat|return/i.test(line) ||
    /post|택배|courier|express/i.test(line)
  )
}

function parseCarrierTracking(lines: string[]) {
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    const match = line.match(/^(.{2,60}?):\s*([A-Z0-9][A-Z0-9 -]{5,}[A-Z0-9])$/i)
    if (!match) continue

    const carrier = cleanLine(match[1])
    const tracking = match[2].replace(/\s+/g, '')
    if (!/\d{6,}/.test(tracking.replace(/\D/g, ''))) continue

    const senderCandidate = index > 0 ? lines[index - 1] : ''
    const sender =
      senderCandidate &&
      !looksLikeMetadata(senderCandidate) &&
      !/^STR-/i.test(senderCandidate)
        ? senderCandidate
        : null

    return { carrier, tracking, sender }
  }

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    const match = line.match(/^(.{2,60}?)\s+([0-9][0-9 -]{7,}[0-9])$/)
    if (!match) continue
    const carrier = cleanLine(match[1])
    if (!/post|택배|courier|express/i.test(carrier)) continue

    const senderCandidate = index > 0 ? lines[index - 1] : ''
    return {
      carrier,
      tracking: match[2].replace(/\s+/g, ''),
      sender:
        senderCandidate && !looksLikeMetadata(senderCandidate)
          ? senderCandidate
          : null,
    }
  }

  return { carrier: null, tracking: null, sender: null }
}

function parseJsonRecord(value: unknown): OlaeetImportRecord | null {
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  const text = (key: string) => {
    const value = record[key]
    return typeof value === 'string' && value.trim() ? value.trim() : null
  }
  const number = (key: string) => {
    const value = record[key]
    if (typeof value === 'number' && Number.isFinite(value)) return value
    if (typeof value === 'string') return parseDecimal(value)
    return null
  }

  const externalPackageId =
    text('externalPackageId') || text('external_package_id') || text('packageId')
  const domesticTrackingNumber =
    text('domesticTrackingNumber') ||
    text('domestic_tracking_number') ||
    text('trackingNumber')

  if (!externalPackageId && !domesticTrackingNumber) return null

  return {
    externalPackageId,
    packageDescription:
      text('packageDescription') || text('package_description') || text('description'),
    senderName: text('senderName') || text('sender_name') || text('sender'),
    domesticCarrier:
      text('domesticCarrier') || text('domestic_carrier') || text('carrier'),
    domesticTrackingNumber,
    providerStatus:
      text('providerStatus') || text('provider_status') || text('status'),
    arrivedAt: text('arrivedAt') || text('arrived_at'),
    inspectedAt: text('inspectedAt') || text('inspected_at'),
    weightGrams: number('weightGrams') ?? number('weight_grams'),
    lengthCm: number('lengthCm') ?? number('length_cm'),
    widthCm: number('widthCm') ?? number('width_cm'),
    heightCm: number('heightCm') ?? number('height_cm'),
    rawBlock: JSON.stringify(record),
  }
}

function tryParseJson(text: string): OlaeetParseResult | null {
  const trimmed = text.trim()
  if (!trimmed.startsWith('[') && !trimmed.startsWith('{')) return null

  try {
    const parsed = JSON.parse(trimmed)
    const values = Array.isArray(parsed)
      ? parsed
      : Array.isArray(parsed?.records)
        ? parsed.records
        : [parsed]
    const records = values
      .map(parseJsonRecord)
      .filter((value): value is OlaeetImportRecord => Boolean(value))
    return {
      records,
      warnings:
        records.length === values.length
          ? []
          : [`${values.length - records.length} JSON-Eintrag/Einträge konnten nicht erkannt werden.`],
    }
  } catch {
    return null
  }
}

export function parseOlaeetImportText(
  rawText: string,
  fallbackYear = new Date().getFullYear(),
): OlaeetParseResult {
  const jsonResult = tryParseJson(rawText)
  if (jsonResult) return jsonResult

  const lines = rawText
    .replace(/\r/g, '\n')
    .split('\n')
    .map(cleanLine)
    .filter(Boolean)

  const packageIndexes = lines
    .map((line, index) => (PACKAGE_ID_RE.test(line) ? index : -1))
    .filter((index) => index >= 0)

  const records: OlaeetImportRecord[] = []
  const warnings: string[] = []

  for (let packageIndex = 0; packageIndex < packageIndexes.length; packageIndex += 1) {
    const idIndex = packageIndexes[packageIndex]
    const nextIdIndex = packageIndexes[packageIndex + 1] ?? lines.length
    const idMatch = lines[idIndex].match(PACKAGE_ID_RE)
    const externalPackageId = idMatch?.[0]?.toUpperCase() ?? null

    const blockLines = lines.slice(idIndex, nextIdIndex)
    const previousLine = idIndex > 0 ? lines[idIndex - 1] : ''
    const packageDescription =
      previousLine && !looksLikeMetadata(previousLine) ? previousLine : null

    const carrierTracking = parseCarrierTracking(blockLines)

    const dimensionsLine = blockLines.find((line) => DIMENSION_RE.test(line)) ?? ''
    const dimensions = dimensionsLine.match(DIMENSION_RE)
    const lengthCm = dimensions ? parseDecimal(dimensions[1]) : null
    const widthCm = dimensions ? parseDecimal(dimensions[2]) : null
    const heightCm = dimensions ? parseDecimal(dimensions[3]) : null

    const weightLine = blockLines.find((line) => WEIGHT_RE.test(line)) ?? ''
    const weightMatch = weightLine.match(WEIGHT_RE)
    let weightGrams: number | null = null
    if (weightMatch) {
      const amount = parseDecimal(weightMatch[1])
      if (amount !== null) {
        weightGrams = weightMatch[2].toLowerCase() === 'kg' ? amount * 1000 : amount
      }
    }

    const status =
      blockLines.find((line) =>
        /packing requested|packing|received|arrived|inspection|inspected|stored|storage|consolidat|returned/i.test(
          line,
        ),
      ) ?? null

    const timestamps = blockLines
      .map((line) => toKoreaIso(line, fallbackYear))
      .filter((value): value is string => Boolean(value))

    const record: OlaeetImportRecord = {
      externalPackageId,
      packageDescription,
      senderName: carrierTracking.sender,
      domesticCarrier: carrierTracking.carrier,
      domesticTrackingNumber: carrierTracking.tracking,
      providerStatus: status,
      arrivedAt: timestamps[0] ?? null,
      inspectedAt: timestamps[1] ?? null,
      weightGrams,
      lengthCm,
      widthCm,
      heightCm,
      rawBlock: blockLines.join('\n').slice(0, 20_000),
    }

    if (!record.domesticTrackingNumber) {
      warnings.push(
        `${record.externalPackageId || `Paket ${packageIndex + 1}`}: Keine Trackingnummer erkannt.`,
      )
    }

    records.push(record)
  }

  if (!records.length && rawText.trim()) {
    warnings.push(
      'Keine OLAEET-Paket-ID im Format STR-YYYYMMDD-... gefunden. Kopiere die sichtbaren Paketzeilen der OLAEET-Lagerseite.',
    )
  }

  return { records, warnings }
}
