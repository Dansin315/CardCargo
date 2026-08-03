import * as cheerio from 'cheerio'
import type { ListingPreview } from '@/lib/types'
import { normalizeListingUrl, safeGet, SafeFetchError } from '@/lib/importer/safe-fetch'
import { previewBunjangListingViaApi } from '@/lib/importer/bunjang-api'
import {
  isBunjangProductImageUrl,
  isGenericBunjangTitle,
  previewRenderedBunjangListing,
} from '@/lib/importer/render-bunjang'

const MAX_HTML_BYTES = 2_500_000
const MAX_PREVIEW_IMAGES = 12
const IMAGE_KEYS = /^(image|images|imageurl|image_url|imageurls|photos?|pictures?|productimages?)$/i

function textOrEmpty(value: string | null | undefined) {
  return value?.replace(/\0/g, '').replace(/\s+/g, ' ').trim() ?? ''
}

function numberFromUnknown(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) return value
  if (typeof value !== 'string') return null
  const normalized = value.replace(/[^0-9.,-]/g, '').replace(/,/g, '')
  const parsed = Number(normalized)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null
}

function addUrl(target: string[], candidate: unknown, baseUrl: string) {
  if (typeof candidate !== 'string' || !candidate.trim()) return
  try {
    const url = new URL(candidate, baseUrl)
    if (url.protocol !== 'https:') return
    url.hash = ''
    const normalized = url.toString()
    if (normalized.length > 2_000) return
    if (!target.includes(normalized)) target.push(normalized)
  } catch {
    // Ignore malformed metadata values.
  }
}

function collectImagesFromValue(value: unknown, images: string[], baseUrl: string) {
  if (typeof value === 'string') {
    addUrl(images, value, baseUrl)
    return
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectImagesFromValue(item, images, baseUrl))
    return
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    if (typeof record.url === 'string') addUrl(images, record.url, baseUrl)
    if (typeof record.contentUrl === 'string') addUrl(images, record.contentUrl, baseUrl)
  }
}

function walkForImages(value: unknown, images: string[], baseUrl: string, depth = 0) {
  if (depth > 10 || images.length >= MAX_PREVIEW_IMAGES * 3) return
  if (Array.isArray(value)) {
    value.forEach((item) => walkForImages(item, images, baseUrl, depth + 1))
    return
  }
  if (!value || typeof value !== 'object') return

  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (IMAGE_KEYS.test(key)) collectImagesFromValue(child, images, baseUrl)
    else walkForImages(child, images, baseUrl, depth + 1)
  }
}

function flattenJsonLd(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) return value.flatMap(flattenJsonLd)
  if (!value || typeof value !== 'object') return []
  const record = value as Record<string, unknown>
  const graph = Array.isArray(record['@graph']) ? flattenJsonLd(record['@graph']) : []
  return [record, ...graph]
}

function parseJsonScript(raw: string) {
  try {
    return JSON.parse(raw) as unknown
  } catch {
    return null
  }
}

function extractExternalId(urlString: string) {
  const url = new URL(urlString)
  const pathPatterns = [/\/products?\/(\d+)/i, /\/product\/([^/?#]+)/i, /\/items?\/(\d+)/i]
  for (const pattern of pathPatterns) {
    const match = url.pathname.match(pattern)
    if (match?.[1]) return match[1]
  }
  return url.searchParams.get('product_id') ?? url.searchParams.get('item_id')
}

function metaContent($: cheerio.CheerioAPI, selectors: string[]) {
  for (const selector of selectors) {
    const value = textOrEmpty($(selector).first().attr('content'))
    if (value) return value
  }
  return ''
}

function firstProduct(ldRecords: Record<string, unknown>[]) {
  return ldRecords.find((record) => {
    const type = record['@type']
    return type === 'Product' || (Array.isArray(type) && type.includes('Product'))
  })
}

function sellerFromProduct(product: Record<string, unknown> | undefined) {
  if (!product) return ''
  const seller = product.seller ?? (product.offers as Record<string, unknown> | undefined)?.seller
  if (typeof seller === 'string') return seller
  if (seller && typeof seller === 'object') {
    const name = (seller as Record<string, unknown>).name
    if (typeof name === 'string') return name
  }
  return ''
}

export async function previewBunjangListing(inputUrl: string): Promise<ListingPreview> {
  const listingUrl = normalizeListingUrl(inputUrl)
  let apiWarning = ''

  try {
    return await previewBunjangListingViaApi(listingUrl)
  } catch (error) {
    apiWarning =
      error instanceof Error
        ? `Direkter Bunjang-Datenabruf fehlgeschlagen: ${error.message}`
        : 'Direkter Bunjang-Datenabruf fehlgeschlagen.'
  }
  const response = await safeGet(listingUrl, {
    listingOnly: true,
    maxBytes: MAX_HTML_BYTES,
    accept: 'text/html,application/xhtml+xml',
  })

  if (response.status < 200 || response.status >= 400) {
    throw new SafeFetchError(`Bunjang antwortete mit HTTP ${response.status}.`)
  }

  const contentType = (response.headers['content-type'] ?? '').toLowerCase()
  if (!contentType.includes('text/html') && !contentType.includes('application/xhtml+xml')) {
    throw new SafeFetchError('Die Zielseite lieferte kein HTML-Dokument.')
  }

  const html = response.body.toString('utf8')
  const $ = cheerio.load(html)
  const warnings: string[] = apiWarning ? [apiWarning] : []

  let canonicalUrl = $('link[rel="canonical"]').first().attr('href') || response.url
  try {
    canonicalUrl = normalizeListingUrl(new URL(canonicalUrl, response.url).toString())
  } catch {
    canonicalUrl = response.url
  }

  const jsonLd: Record<string, unknown>[] = []
  $('script[type="application/ld+json"]').each((_index, element) => {
    const parsed = parseJsonScript($(element).text())
    if (parsed) jsonLd.push(...flattenJsonLd(parsed))
  })
  const product = firstProduct(jsonLd)

  const images: string[] = []
  $('meta[property="og:image"], meta[property="og:image:url"], meta[name="twitter:image"], meta[itemprop="image"]').each(
    (_index, element) => addUrl(images, $(element).attr('content'), canonicalUrl),
  )
  if (product?.image) collectImagesFromValue(product.image, images, canonicalUrl)

  $('script#__NEXT_DATA__, script[type="application/json"]').each((_index, element) => {
    const parsed = parseJsonScript($(element).text())
    if (parsed) walkForImages(parsed, images, canonicalUrl)
  })

  const offers = product?.offers
  const firstOffer = Array.isArray(offers) ? offers[0] : offers
  const offerRecord = firstOffer && typeof firstOffer === 'object' ? (firstOffer as Record<string, unknown>) : undefined

  const title =
    textOrEmpty(typeof product?.name === 'string' ? product.name : '') ||
    metaContent($, ['meta[property="og:title"]', 'meta[name="twitter:title"]']) ||
    textOrEmpty($('title').first().text()).replace(/\s*[|·-]\s*번개장터.*$/i, '') ||
    'Bunjang-Angebot'

  const description =
    textOrEmpty(typeof product?.description === 'string' ? product.description : '') ||
    metaContent($, ['meta[property="og:description"]', 'meta[name="description"]'])

  const priceAmount =
    numberFromUnknown(offerRecord?.price) ??
    numberFromUnknown(metaContent($, ['meta[property="product:price:amount"]', 'meta[property="og:price:amount"]']))

  const priceCurrency =
    textOrEmpty(typeof offerRecord?.priceCurrency === 'string' ? offerRecord.priceCurrency : '') ||
    metaContent($, ['meta[property="product:price:currency"]']) ||
    'KRW'

  const externalId = extractExternalId(canonicalUrl) ?? extractExternalId(listingUrl)
  const staticImages = images
    .filter((imageUrl) => isBunjangProductImageUrl(imageUrl, externalId))
    .slice(0, MAX_PREVIEW_IMAGES)

  const staticPreview: ListingPreview = {
    source: 'bunjang',
    listingUrl,
    canonicalUrl,
    externalId,
    title: title.slice(0, 300),
    description: description.slice(0, 10_000),
    sellerName: textOrEmpty(sellerFromProduct(product)).slice(0, 200),
    priceAmount,
    domesticShippingAmount: null,
    priceCurrency: priceCurrency.toUpperCase().slice(0, 3),
    imageUrls: staticImages,
    warnings,
  }

  const needsRenderedFallback =
    isGenericBunjangTitle(staticPreview.title) ||
    staticPreview.title === 'Bunjang-Angebot' ||
    staticPreview.priceAmount === null ||
    staticPreview.imageUrls.length === 0

  if (needsRenderedFallback) {
    try {
      const rendered = await previewRenderedBunjangListing(listingUrl)
      const merged: ListingPreview = {
        ...rendered,
        canonicalUrl: rendered.canonicalUrl || staticPreview.canonicalUrl,
        externalId: rendered.externalId || staticPreview.externalId,
        title:
          rendered.title && !isGenericBunjangTitle(rendered.title)
            ? rendered.title
            : staticPreview.title,
        description: rendered.description || staticPreview.description,
        sellerName: rendered.sellerName || staticPreview.sellerName,
        priceAmount: rendered.priceAmount ?? staticPreview.priceAmount,
        domesticShippingAmount:
          rendered.domesticShippingAmount ?? staticPreview.domesticShippingAmount,
        priceCurrency: rendered.priceCurrency || staticPreview.priceCurrency,
        imageUrls: rendered.imageUrls.length ? rendered.imageUrls : staticPreview.imageUrls,
        warnings: [...new Set([...staticPreview.warnings, ...rendered.warnings])],
      }

      if (!merged.imageUrls.length) {
        merged.warnings.push(
          'Es wurde kein eindeutig zum Produkt gehörendes Bild erkannt. Bitte lade einen Screenshot oder eine Bilddatei manuell hoch.',
        )
      }
      if (merged.priceAmount === null) {
        merged.warnings.push('Der Preis konnte nicht sicher erkannt werden und sollte manuell geprüft werden.')
      }
      if (isGenericBunjangTitle(merged.title) || merged.title === 'Bunjang-Angebot') {
        merged.warnings.push('Der Titel konnte nicht erkannt werden und muss manuell ergänzt werden.')
      }

      merged.warnings = [...new Set(merged.warnings)]
      return merged
    } catch (error) {
      staticPreview.warnings.push(
        error instanceof Error
          ? `${error.message} Du kannst die Daten und Bilder weiterhin manuell ergänzen.`
          : 'Die dynamische Bunjang-Seite konnte nicht gelesen werden.',
      )
    }
  }

  if (!staticPreview.imageUrls.length) {
    staticPreview.warnings.push(
      'Die Seite hat keine eindeutig zum Produkt gehörenden Bilder geliefert. Lade Screenshots oder Bilddateien manuell hoch.',
    )
  }
  if (staticPreview.priceAmount === null) {
    staticPreview.warnings.push('Der Preis konnte nicht sicher erkannt werden und sollte manuell geprüft werden.')
  }
  if (isGenericBunjangTitle(staticPreview.title) || staticPreview.title === 'Bunjang-Angebot') {
    staticPreview.warnings.push('Der Titel konnte nicht erkannt werden und muss manuell ergänzt werden.')
  }
  staticPreview.warnings = [...new Set(staticPreview.warnings)]
  return staticPreview
}
