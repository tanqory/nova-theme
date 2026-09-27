/**
 * schema.org Product / Offer JSON-LD for search engines and AI answer engines (ChatGPT search, Google, Bing).
 *
 * Built from the product exactly as the buyer sees it: price and currency are the storefront's own `Money`
 * (the buyer's market currency, never a hardcoded THB/USD), availability is claimed only when the storefront knows
 * it, and anything unknown is omitted rather than invented. Pure and free of `window`, so the same builder runs on
 * the server render and on soft navigation.
 */
import type { Money, Product } from './tanqory/data'

export type JsonLd = Record<string, unknown>

const SCHEMA = 'https://schema.org'
const MONEY_AMOUNT = /^\d+(?:\.\d+)?$/
const CURRENCY = /^[A-Z]{3}$/
const GTIN = /^(?:\d{8}|\d{12,14})$/
const MAX_IMAGES = 10
const MAX_DESCRIPTION = 5000

const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')

const absolute = (url: string | undefined | null, origin: string): string => {
  const u = text(url)
  if (!u) return ''
  // Crawlers can only fetch http(s): a `data:` placeholder or a `javascript:` URL is never an image URL.
  if (/^https?:\/\//.test(u)) return u
  if (/^[a-z][a-z0-9+.-]*:/i.test(u) || !origin) return ''
  try {
    return new URL(u, origin).toString()
  } catch {
    return ''
  }
}

const plain = (html: string): string =>
  html
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

/** A valid money value, or null: numeric, non-negative amount and an uppercase ISO-4217 code. */
function validMoney(m: Money | null | undefined): Money | null {
  const amount = text(m?.amount)
  const currencyCode = text(m?.currencyCode)
  if (!MONEY_AMOUNT.test(amount) || !CURRENCY.test(currencyCode)) return null
  return { amount, currencyCode }
}

const availabilityOf = (available: boolean | undefined): string | undefined =>
  available === true ? `${SCHEMA}/InStock` : available === false ? `${SCHEMA}/OutOfStock` : undefined

function offersOf(product: Product, url: string): JsonLd | undefined {
  const variants = (product.variants ?? [])
    .map((v) => ({ v, money: validMoney(v.price) }))
    .filter((x): x is { v: NonNullable<Product['variants']>[number]; money: Money } => x.money !== null)
  const currency = variants[0]?.money.currencyCode
  if (variants.length > 1 && variants.every((x) => x.money.currencyCode === currency)) {
    const amounts = variants.map((x) => Number(x.money.amount))
    const lowIdx = amounts.indexOf(Math.min(...amounts))
    const highIdx = amounts.indexOf(Math.max(...amounts))
    if (amounts[lowIdx] !== amounts[highIdx]) {
      return {
        '@type': 'AggregateOffer',
        url,
        lowPrice: variants[lowIdx]!.money.amount,
        highPrice: variants[highIdx]!.money.amount,
        priceCurrency: currency,
        offerCount: variants.length,
        ...(variants.some((x) => x.v.availableForSale)
          ? { availability: `${SCHEMA}/InStock` }
          : { availability: `${SCHEMA}/OutOfStock` }),
      }
    }
  }
  const money = variants[0]?.money ?? validMoney(product.price)
  if (!money) return undefined
  const availability = availabilityOf(
    variants.length ? variants.some((x) => x.v.availableForSale) : product.availableForSale,
  )
  return {
    '@type': 'Offer',
    url,
    price: money.amount,
    priceCurrency: money.currencyCode,
    ...(availability ? { availability } : {}),
  }
}

/**
 * The Product JSON-LD for a product page, or null when there is no product (or no title). `ctx.url` is the page's
 * own absolute URL and `ctx.origin` resolves relative image URLs; both come from the request on the server.
 */
export function productJsonLd(product: Product | null | undefined, ctx: { url: string; origin: string }): JsonLd | null {
  if (!product) return null
  const name = text(product.title)
  if (!name) return null

  const images = [
    ...new Set(
      [product.featuredImage?.url, ...(product.images ?? []).map((i) => i.url)]
        .map((u) => absolute(u, ctx.origin))
        .filter(Boolean),
    ),
  ].slice(0, MAX_IMAGES)

  const description = (text(product.seo?.description) || plain(text(product.description))).slice(0, MAX_DESCRIPTION)
  const vendor = text(product.vendor)
  const offers = offersOf(product, ctx.url)

  const single = product.variants?.length === 1 ? product.variants[0] : undefined
  const sku = text(single?.sku)
  const barcode = text(single?.barcode)

  return {
    '@context': SCHEMA,
    '@type': 'Product',
    name,
    url: ctx.url,
    ...(images.length ? { image: images } : {}),
    ...(description ? { description } : {}),
    ...(vendor ? { brand: { '@type': 'Brand', name: vendor } } : {}),
    ...(sku ? { sku } : {}),
    ...(GTIN.test(barcode) ? { gtin: barcode } : {}),
    ...(offers ? { offers } : {}),
  }
}

const LINE_SEP = String.fromCharCode(0x2028)
const PARA_SEP = String.fromCharCode(0x2029)

/** Serialise for embedding in HTML: `<` and the JS line separators cannot end the script element or the string. */
export function serializeJsonLd(data: JsonLd): string {
  return JSON.stringify(data).replace(/</g, '\\u003c').split(LINE_SEP).join('\\u2028').split(PARA_SEP).join('\\u2029')
}

/** The `<script type="application/ld+json">` tag, or '' when there is nothing to say. */
export function jsonLdTag(data: JsonLd | null | undefined): string {
  return data ? `<script type="application/ld+json">${serializeJsonLd(data)}</script>` : ''
}
