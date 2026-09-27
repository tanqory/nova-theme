#!/usr/bin/env node
/**
 * `pnpm check:jsonld` — the BUILT theme must ship schema.org Product/Offer JSON-LD in the SERVER html of a product
 * page (crawlers and AI answer engines do not run JS) and nothing on non-product pages.
 *
 * Runs the real SSR entry (`dist/ssr/entry.mjs`, so build first) against the theme's mock catalog and checks what
 * Google's Product snippet requires: `name`, an absolute `url`, and an `offers` block with a numeric `price`, an
 * ISO-4217 `priceCurrency` and a schema.org `availability` URL. Per-market currency and availability logic is
 * unit-tested in tests/structured-data.test.ts; this guards the wiring (build -> render -> head).
 */
import { access } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const root = resolve(process.argv[2] ?? '.')
const entry = join(root, 'dist', 'ssr', 'entry.mjs')
try {
  await access(entry)
} catch {
  console.error('error dist/ssr/entry.mjs is missing: run `pnpm build` first')
  process.exit(1)
}

const mod = await import(pathToFileURL(entry).href)
const ctx = { mode: 'serve', assets: { base: '', manifest: {} }, content: { templates: {}, groups: {}, settings: {} } }
const errors = []
const CURRENCIES = new Set(Intl.supportedValuesOf('currency'))
const AVAILABILITY = new Set(['InStock', 'OutOfStock', 'PreOrder', 'BackOrder', 'SoldOut', 'LimitedAvailability', 'Discontinued', 'InStoreOnly', 'OnlineOnly'].map((a) => `https://schema.org/${a}`))
const page = async (path) => {
  const res = await mod.render(new Request(`https://shop.example.com${path}`), ctx)
  return { status: res.status, html: await res.text() }
}
const blocks = (html) => [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => m[1])

const product = await page('/products/example-product-1')
const found = blocks(product.html)
if (product.status !== 200) errors.push(`product page answered ${product.status}`)
if (found.length !== 1) errors.push(`expected exactly one JSON-LD block on the product page, found ${found.length}`)
else {
  let ld
  try {
    ld = JSON.parse(found[0])
  } catch (e) {
    errors.push(`JSON-LD is not valid JSON: ${e.message}`)
  }
  if (ld) {
    if (ld['@context'] !== 'https://schema.org') errors.push('@context must be https://schema.org')
    if (ld['@type'] !== 'Product') errors.push('@type must be Product')
    if (!ld.name) errors.push('name is required')
    if (!/^https?:\/\//.test(ld.url ?? '')) errors.push('url must be absolute')
    const o = ld.offers
    if (!o) errors.push('offers is required')
    else {
      const price = o['@type'] === 'AggregateOffer' ? o.lowPrice : o.price
      if (!/^\d+(?:\.\d+)?$/.test(String(price ?? ''))) errors.push(`offers price is not numeric: ${price}`)
      if (!CURRENCIES.has(o.priceCurrency)) errors.push(`offers priceCurrency is not ISO-4217: ${o.priceCurrency}`)
      if (o.availability !== undefined && !AVAILABILITY.has(o.availability)) errors.push(`offers availability is not a schema.org URL: ${o.availability}`)
    }
    for (const img of ld.image ?? []) if (!/^https?:\/\//.test(img)) errors.push(`image is not absolute: ${img}`)
  }
}
if (/<\/script><script/.test(found[0] ?? '')) errors.push('JSON-LD must not contain a raw script terminator')

const home = await page('/')
if (blocks(home.html).length) errors.push('the home page must not carry a Product block')

if (errors.length) {
  for (const e of errors) console.error(`error ${e}`)
  process.exit(1)
}
console.log('✓ product page ships one valid schema.org Product/Offer JSON-LD block in the server html; home has none')
