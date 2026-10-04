const fs = require('fs')
const path = require('path')

const appRoot = process.argv[2]
if (!appRoot) throw new Error('APP_ROOT fehlt.')

const rel = 'app/api/shipments/olaeet-import/route.ts'
const file = path.join(appRoot, rel)
if (!fs.existsSync(file)) throw new Error(`Datei nicht gefunden: ${rel}`)

let source = fs.readFileSync(file, 'utf8')
const original = source

if (!source.includes('function cardCargoStatusCandidates(')) {
  const anchor = 'function mergeRawMetadata('
  const index = source.indexOf(anchor)
  if (index < 0) throw new Error('v92: Helper-Anker wurde nicht gefunden.')

  const helper = [
    "function normalizeProviderStatus(value: string | null | undefined) {",
    "  return String(value || '')",
    "    .normalize('NFKC')",
    "    .toLocaleLowerCase()",
    "    .replace(/[^a-z0-9]+/g, ' ')",
    "    .replace(/\\s+/g, ' ')",
    "    .trim()",
    "}",
    "",
    "function cardCargoStatusCandidates(providerStatus: string | null | undefined) {",
    "  const status = normalizeProviderStatus(providerStatus)",
    "",
    "  if (/cancel|refund|void/.test(status)) {",
    "    return ['cancelled', 'canceled', 'closed']",
    "  }",
    "",
    "  if (/deliver|complete|received|arrived/.test(status)) {",
    "    return ['delivered', 'completed', 'received', 'arrived', 'closed']",
    "  }",
    "",
    "  if (/transfer|in transit|transit|shipping|shipped|dispatch|sent/.test(status)) {",
    "    return [",
    "      'in_transit',",
    "      'shipped',",
    "      'shipping',",
    "      'transit',",
    "      'dispatched',",
    "      'sent',",
    "      'transferring',",
    "      'active',",
    "    ]",
    "  }",
    "",
    "  if (/ready|pack|prepare|processing/.test(status)) {",
    "    return ['preparing', 'processing', 'ready', 'packed', 'planned', 'pending']",
    "  }",
    "",
    "  if (/payment|created|create|pending|request|draft|waiting/.test(status)) {",
    "    return ['planned', 'pending', 'draft', 'created', 'preparing']",
    "  }",
    "",
    "  return ['planned', 'pending', 'draft', 'created']",
    "}",
    "",
    "function preferredCardCargoStatus(providerStatus: string | null | undefined) {",
    "  return cardCargoStatusCandidates(providerStatus)[0]",
    "}",
    "",
    "function invalidEnumValueFromError(message: string) {",
    "  return (",
    "    message.match(/invalid input value for enum [^:]+:\\s*[\\\"']([^\\\"']+)[\\\"']/i)?.[1] ||",
    "    null",
    "  )",
    "}",
    "",
  ].join('\n')

  source = source.slice(0, index) + helper + source.slice(index)
}

// Discover both historical names for CardCargo's internal shipment status.
if (!source.includes("  'shipment_status',")) {
  source = source.replace(
    "  'provider_status',\n  'status',",
    "  'provider_status',\n  'status',\n  'shipment_status',",
  )
}

// Never use the raw provider status as CardCargo's enum value.
source = source.replace(
  "  if (/status/.test(key)) return shipment.providerStatus || 'Transferring'",
  [
    "  if (key === 'provider_status') return shipment.providerStatus",
    "  if (key === 'status' || key === 'shipment_status') {",
    "    return preferredCardCargoStatus(shipment.providerStatus)",
    "  }",
  ].join('\n'),
)

const oldCompact = "    mapFirst(payload, columns, ['provider_status', 'status'], shipment.providerStatus)"
const oldExpanded = [
  "    mapFirst(",
  "      payload,",
  "      columns,",
  "      ['provider_status', 'status'],",
  "      shipment.providerStatus,",
  "    )",
].join('\n')
const newStatusMapping = [
  "    // Keep the provider status verbatim, but map CardCargo's own status enum.",
  "    mapFirst(payload, columns, ['provider_status'], shipment.providerStatus)",
  "    mapFirst(",
  "      payload,",
  "      columns,",
  "      ['status', 'shipment_status'],",
  "      preferredCardCargoStatus(shipment.providerStatus),",
  "    )",
].join('\n')

if (source.includes(oldCompact)) {
  source = source.replace(oldCompact, newStatusMapping)
} else if (source.includes(oldExpanded)) {
  source = source.replace(oldExpanded, newStatusMapping)
} else if (!source.includes("['status', 'shipment_status']")) {
  throw new Error('v92: bestehendes Status-Mapping wurde nicht gefunden.')
}

const repairAnchor = [
  "  const payload: GenericRow = { ...initialPayload }",
  "  const repairs: string[] = []",
].join('\n')

if (!source.includes('const triedInternalStatuses = new Set<string>()')) {
  if (!source.includes(repairAnchor)) {
    throw new Error('v92: writeShipmentWithRepair-Anker wurde nicht gefunden.')
  }
  source = source.replace(
    repairAnchor,
    repairAnchor + "\n  const triedInternalStatuses = new Set<string>()",
  )
}

const messageAnchor = [
  "    const message = response.error.message",
  "    const missing = missingColumnFromError(message)",
].join('\n')

if (!source.includes('const invalidEnumValue = invalidEnumValueFromError(message)')) {
  if (!source.includes(messageAnchor)) {
    throw new Error('v92: Fehler-Reparatur-Anker wurde nicht gefunden.')
  }

  const enumRepair = [
    "    const message = response.error.message",
    "",
    "    // If CardCargo rejects one internal status enum value, automatically",
    "    // try the next semantically equivalent value for the OLAEET status.",
    "    const invalidEnumValue = invalidEnumValueFromError(message)",
    "    const internalStatusKey = ['status', 'shipment_status'].find((key) =>",
    "      Object.prototype.hasOwnProperty.call(payload, key),",
    "    )",
    "",
    "    if (invalidEnumValue && internalStatusKey) {",
    "      triedInternalStatuses.add(String(payload[internalStatusKey] ?? ''))",
    "      triedInternalStatuses.add(invalidEnumValue)",
    "",
    "      const nextStatus = cardCargoStatusCandidates(shipment.providerStatus).find(",
    "        (candidate) => !triedInternalStatuses.has(candidate),",
    "      )",
    "",
    "      if (nextStatus) {",
    "        payload[internalStatusKey] = nextStatus",
    "        repairs.push(",
    "          `CardCargo-Status angepasst: ${invalidEnumValue} -> ${nextStatus}` ,",
    "        )",
    "        continue",
    "      }",
    "    }",
    "",
    "    const missing = missingColumnFromError(message)",
  ].join('\n')

  source = source.replace(messageAnchor, enumRepair)
}

if (source === original) {
  console.log(`Bereits korrekt: ${rel}`)
  process.exit(0)
}

const backup = `${file}.bak-v92`
if (!fs.existsSync(backup)) fs.copyFileSync(file, backup)
fs.writeFileSync(file, source)
console.log(`Status-Mapping aktualisiert: ${rel}`)
