'use client'

import { useEffect, useMemo, useRef, useState } from 'react'

type OlaeetShipmentPackage = {
  externalPackageId: string
  itemCategory: string | null
  recipientMasked: string | null
  domesticTrackingNumber: string | null
}

type OlaeetBox = {
  boxNumber: number
  dimensions: {
    widthCm: number
    heightCm: number
    lengthCm: number
    raw: string
  } | null
  realWeightKg: number | null
  volumeWeightKg: number | null
  quoteWeightKg: number | null
}

type OlaeetShipment = {
  externalShipmentId: string
  providerStatus: string | null
  createdAt: string | null
  completedAt: string | null
  courier: string | null
  trackingNumber: string | null
  paymentTransactionId: string | null
  shippingAmount: number | null
  shippingFee: number | null
  additionalFee: number | null
  insuranceFee: number | null
  totalPayment: number | null
  currency: string | null
  address: {
    name: string | null
    addressLine1: string | null
    city: string | null
    country: string | null
    zipCode: string | null
    contact: string | null
  }
  packages: OlaeetShipmentPackage[]
  boxes: OlaeetBox[]
  expectedItemCount?: number | null
  expectedBoxCount?: number | null
  extractionComplete?: boolean
  pageUrl: string | null
  rawText: string
}

type ShipmentPayload = {
  kind?: string
  shipments?: OlaeetShipment[]
}

type FormControl = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement

function normalized(value: unknown) {
  return String(value ?? '')
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function parsePayload(text: string): OlaeetShipment {
  let parsed: ShipmentPayload

  try {
    parsed = JSON.parse(text) as ShipmentPayload
  } catch {
    throw new Error(
      'Die Zwischenablage enthält kein gültiges OLAEET-Sendungs-JSON. Öffne auf OLAEET die Sendung und führe den aktualisierten Extractor aus.',
    )
  }

  const shipment = parsed.shipments?.[0]
  if (!shipment?.externalShipmentId) {
    throw new Error(
      'Keine internationale OLAEET-Sendung erkannt. Erwartet wird eine Extraction mit einer SHP-... ID.',
    )
  }

  if (
    shipment.extractionComplete === false ||
    (shipment.expectedItemCount !== null &&
      shipment.expectedItemCount !== undefined &&
      shipment.packages.length < shipment.expectedItemCount)
  ) {
    throw new Error(
      `OLAEET-Extraction unvollständig: ${shipment.packages.length}/${shipment.expectedItemCount ?? '?'} Pakete erkannt. Führe den Extractor im geöffneten Shipping-Panel erneut aus; CardCargo speichert absichtlich keine unvollständige Sendung.`,
    )
  }

  return shipment
}

function dateForInput(value: string | null, type: string) {
  if (!value) return ''
  const iso = value.replace(/\+09:00$/, '')
  if (type === 'date') return iso.slice(0, 10)
  if (type === 'datetime-local') return iso.slice(0, 16)
  return value
}

function controlDescriptor(control: FormControl) {
  const labelByFor = control.id
    ? document.querySelector(`label[for="${CSS.escape(control.id)}"]`)?.textContent
    : ''
  const wrappingLabel = control.closest('label')?.textContent || ''
  const parentText = control.parentElement?.textContent || ''

  return normalized(
    [
      control.getAttribute('name'),
      control.id,
      control.getAttribute('placeholder'),
      control.getAttribute('aria-label'),
      labelByFor,
      wrappingLabel,
      parentText.slice(0, 220),
    ]
      .filter(Boolean)
      .join(' '),
  )
}

function nativeSetValue(control: FormControl, value: string) {
  if (control instanceof HTMLSelectElement) {
    const desired = normalized(value)
    const exact = [...control.options].find(
      (option) =>
        normalized(option.value) === desired || normalized(option.textContent) === desired,
    )
    control.value = exact?.value ?? value
  } else if (control instanceof HTMLInputElement) {
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      'value',
    )?.set
    setter?.call(control, value)
  } else {
    const setter = Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      'value',
    )?.set
    setter?.call(control, value)
  }

  control.dispatchEvent(new Event('input', { bubbles: true }))
  control.dispatchEvent(new Event('change', { bubbles: true }))
}

function nativeSetChecked(input: HTMLInputElement, checked: boolean) {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    'checked',
  )?.set
  setter?.call(input, checked)
  input.dispatchEvent(new Event('input', { bubbles: true }))
  input.dispatchEvent(new Event('change', { bubbles: true }))
}

function matchingControl(
  controls: FormControl[],
  aliases: string[],
  used: Set<FormControl>,
) {
  const needles = aliases.map(normalized)

  return (
    controls.find((control) => {
      if (used.has(control)) return false
      if (
        control instanceof HTMLInputElement &&
        ['checkbox', 'radio', 'file', 'submit', 'button', 'hidden'].includes(control.type)
      ) {
        return false
      }

      const descriptor = controlDescriptor(control)
      return needles.some((needle) => descriptor.includes(needle))
    }) ?? null
  )
}

function setField(
  controls: FormControl[],
  used: Set<FormControl>,
  aliases: string[],
  value: string | number | null | undefined,
) {
  if (value === null || value === undefined || value === '') return false
  const control = matchingControl(controls, aliases, used)
  if (!control) return false

  const text =
    control instanceof HTMLInputElement
      ? dateForInput(String(value), control.type)
      : String(value)

  nativeSetValue(control, text)
  used.add(control)
  return true
}

function textAround(input: HTMLInputElement) {
  const chunks: string[] = []
  if (input.id) {
    const label = document.querySelector(`label[for="${CSS.escape(input.id)}"]`)
    if (label?.textContent) chunks.push(label.textContent)
  }

  let node: HTMLElement | null = input
  for (let depth = 0; node && depth < 5; depth += 1) {
    if (node.textContent) chunks.push(node.textContent.slice(0, 600))
    node = node.parentElement
  }

  return normalized(chunks.join(' '))
}

function selectPackages(form: HTMLFormElement, packageIds: string[]) {
  const normalizedIds = packageIds.map((id) => normalized(id))
  let selected = 0

  const checkboxes = [...form.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')]
  for (const checkbox of checkboxes) {
    const context = textAround(checkbox)
    if (!normalizedIds.some((id) => context.includes(id))) continue
    if (!checkbox.checked) nativeSetChecked(checkbox, true)
    selected += 1
  }

  for (const select of form.querySelectorAll<HTMLSelectElement>('select')) {
    const matchedOptions = [...select.options].filter((option) =>
      normalizedIds.some((id) => normalized(option.textContent).includes(id)),
    )
    if (!matchedOptions.length) continue

    for (const option of matchedOptions) option.selected = true
    select.dispatchEvent(new Event('input', { bubbles: true }))
    select.dispatchEvent(new Event('change', { bubbles: true }))
    selected += matchedOptions.length
  }

  return Math.min(selected, packageIds.length)
}

function findManualForm(marker: HTMLElement | null) {
  if (!marker) return null
  const forms = [...document.querySelectorAll<HTMLFormElement>('form')]
  return (
    forms.find((form) =>
      Boolean(marker.compareDocumentPosition(form) & Node.DOCUMENT_POSITION_FOLLOWING),
    ) ?? null
  )
}

function hiddenTarget(marker: HTMLElement, form: HTMLFormElement) {
  const section = form.closest<HTMLElement>('section')
  if (section && !section.contains(marker)) return section
  return form
}

function formatAmount(value: number | null, currency: string | null) {
  if (value === null) return '–'
  return `${new Intl.NumberFormat('de-DE').format(value)} ${currency || 'KRW'}`
}

export function OlaeetShipmentExtractionImporter() {
  const markerRef = useRef<HTMLDivElement>(null)
  const [shipment, setShipment] = useState<OlaeetShipment | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [manualVisible, setManualVisible] = useState(false)
  const [pasteOpen, setPasteOpen] = useState(false)
  const [rawText, setRawText] = useState('')

  useEffect(() => {
    const marker = markerRef.current
    const form = findManualForm(marker)
    if (!marker || !form) return
    hiddenTarget(marker, form).style.display = 'none'
  }, [])

  const packageIds = useMemo(
    () => shipment?.packages.map((entry) => entry.externalPackageId) ?? [],
    [shipment],
  )

  function showManual(show: boolean) {
    const marker = markerRef.current
    const form = findManualForm(marker)
    if (marker && form) {
      hiddenTarget(marker, form).style.display = show ? '' : 'none'
    }
    setManualVisible(show)
  }

  function preview(text: string) {
    const parsed = parsePayload(text)
    setShipment(parsed)
    setRawText(text)
    setMessage(
      parsed.expectedItemCount !== null && parsed.expectedItemCount !== undefined
        ? `${parsed.externalShipmentId}: ${parsed.packages.length}/${parsed.expectedItemCount} OLAEET-Pakete erkannt.`
        : `${parsed.externalShipmentId}: ${parsed.packages.length} enthaltene OLAEET-Paket(e) erkannt.`,
    )
    return parsed
  }

  function applyToForm(parsed: OlaeetShipment) {
    const marker = markerRef.current
    const form = findManualForm(marker)
    if (!form) {
      throw new Error(
        'Das bestehende CardCargo-Sendungsformular konnte nicht gefunden werden.',
      )
    }

    const controls = [...form.querySelectorAll<FormControl>('input, select, textarea')]
    const used = new Set<FormControl>()
    let fields = 0
    const firstBox = parsed.boxes[0] ?? null

    const assign = (aliases: string[], value: string | number | null | undefined) => {
      if (setField(controls, used, aliases, value)) fields += 1
    }

    assign(
      ['shipment id', 'shipmentid', 'sendungs id', 'sendungsnummer', 'external shipment id', 'olaeet shipment'],
      parsed.externalShipmentId,
    )
    assign(['provider status', 'olaeet status', 'status'], parsed.providerStatus)
    assign(['created at', 'created', 'erstellt am', 'angelegt am'], parsed.createdAt)
    assign(['completed at', 'completed', 'abgeschlossen am', 'zugestellt am'], parsed.completedAt)
    assign(['courier', 'carrier', 'versanddienst', 'dienstleister'], parsed.courier)
    assign(
      ['international tracking', 'tracking number', 'trackingnummer', 'sendungsverfolgung'],
      parsed.trackingNumber,
    )
    assign(['payment transaction id', 'payment id', 'zahlungs id'], parsed.paymentTransactionId)
    assign(['shipping amount', 'versandbetrag', 'shipping cost', 'versandkosten'], parsed.shippingAmount)
    assign(['shipping fee', 'versandgebühr', 'versand gebühr'], parsed.shippingFee)
    assign(['additional fee', 'zusatzgebühr', 'zusätzliche gebühr'], parsed.additionalFee)
    assign(['insurance fee', 'versicherungsgebühr', 'versicherung'], parsed.insuranceFee)
    assign(['total payment', 'gesamtzahlung', 'gesamtbetrag', 'total amount'], parsed.totalPayment)
    assign(['currency', 'währung'], parsed.currency)

    assign(['recipient name', 'empfänger name', 'empfänger'], parsed.address.name)
    assign(['address line 1', 'adresse', 'straße', 'strasse'], parsed.address.addressLine1)
    assign(['city', 'stadt', 'ort'], parsed.address.city)
    assign(['country', 'land'], parsed.address.country)
    assign(['zip code', 'postal code', 'plz', 'postleitzahl'], parsed.address.zipCode)
    assign(['contact', 'phone', 'telefon'], parsed.address.contact)

    assign(['width cm', 'breite', 'width'], firstBox?.dimensions?.widthCm)
    assign(['height cm', 'höhe', 'height'], firstBox?.dimensions?.heightCm)
    assign(['length cm', 'länge', 'length'], firstBox?.dimensions?.lengthCm)
    assign(['real weight', 'actual weight', 'gewicht'], firstBox?.realWeightKg)
    assign(['volume weight', 'volumengewicht'], firstBox?.volumeWeightKg)
    assign(['quote weight', 'abrechnungsgewicht', 'billable weight'], firstBox?.quoteWeightKg)

    const selectedPackages = selectPackages(form, packageIds)

    return { form, fields, selectedPackages }
  }

  async function importFromText(text: string, submit: boolean) {
    setBusy(true)
    setMessage(null)

    try {
      const parsed = preview(text)
      const { form, fields, selectedPackages } = applyToForm(parsed)

      if (selectedPackages < parsed.packages.length) {
        setMessage(
          `${fields} Sendungsfeld(er) übernommen. ${selectedPackages}/${parsed.packages.length} OLAEET-Pakete automatisch ausgewählt. Fehlende STR-Pakete sind vermutlich noch nicht in CardCargo importiert.`,
        )
      } else {
        setMessage(
          `${fields} Sendungsfeld(er) übernommen und alle ${selectedPackages} OLAEET-Pakete ausgewählt.`,
        )
      }

      if (submit) {
        // Give React-controlled fields one frame to process their dispatched
        // change events before the existing form submit logic runs.
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
        form.requestSubmit()
      }
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : 'OLAEET-Sendung konnte nicht importiert werden.',
      )
    } finally {
      setBusy(false)
    }
  }

  async function importClipboard() {
    try {
      const text = await navigator.clipboard.readText()
      await importFromText(text, true)
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'Zwischenablage konnte nicht gelesen werden. Nutze alternativ „JSON einfügen“.',
      )
    }
  }

  return (
    <section className="panel" ref={markerRef}>
      <div className="panel-heading">
        <div>
          <h2>OLAEET-Sendung aus Extraction importieren</h2>
          <p>
            Öffne auf OLAEET das Shipping-Detailfenster, führe den OLAEET Extractor aus
            und importiere anschließend die Extraction. Die enthaltenen STR-Pakete
            werden automatisch ausgewählt.
          </p>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button
          className="button button-primary"
          type="button"
          disabled={busy}
          onClick={importClipboard}
        >
          {busy ? 'Importiere …' : 'OLAEET-Extraction importieren & speichern'}
        </button>

        <button
          className="button button-secondary"
          type="button"
          disabled={busy}
          onClick={() => setPasteOpen((current) => !current)}
        >
          JSON einfügen
        </button>

        <button
          className="button button-ghost"
          type="button"
          onClick={() => showManual(!manualVisible)}
        >
          {manualVisible ? 'Manuelle Eingabe ausblenden' : 'Manuelle Eingabe anzeigen'}
        </button>
      </div>

      {pasteOpen ? (
        <div style={{ marginTop: 12 }}>
          <textarea
            rows={8}
            value={rawText}
            placeholder="OLAEET-Extractor-JSON hier einfügen …"
            onChange={(event) => setRawText(event.target.value)}
          />
          <div style={{ marginTop: 8 }}>
            <button
              className="button button-primary"
              type="button"
              disabled={busy || !rawText.trim()}
              onClick={() => void importFromText(rawText, true)}
            >
              JSON importieren & speichern
            </button>
          </div>
        </div>
      ) : null}

      {message ? <div className="alert alert-info" style={{ marginTop: 12 }}>{message}</div> : null}

      {shipment ? (
        <div
          style={{
            marginTop: 14,
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
            gap: 10,
          }}
        >
          <div><strong>{shipment.externalShipmentId}</strong><br /><small>{shipment.providerStatus || 'Status –'}</small></div>
          <div><strong>{shipment.courier || 'Courier –'}</strong><br /><small>{shipment.trackingNumber || 'Tracking –'}</small></div>
          <div><strong>{formatAmount(shipment.totalPayment, shipment.currency)}</strong><br /><small>Gesamtzahlung</small></div>
          <div>
            <strong>
              {shipment.expectedItemCount !== null && shipment.expectedItemCount !== undefined
                ? `${packageIds.length}/${shipment.expectedItemCount}`
                : packageIds.length}
            </strong>
            <br />
            <small>enthaltene OLAEET-Pakete</small>
          </div>
        </div>
      ) : null}
    </section>
  )
}
