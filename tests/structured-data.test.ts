// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'

import { applyHead, computeHead } from '../lib/head'
import { jsonLdTag, productJsonLd } from '../lib/structured-data'
import type { DataApi } from '../lib/tanqory/index'

/**
 * schema.org Product / Offer JSON-LD for AI search and answer engines (matrix F2 "ChatGPT Ads / AEO", W5).
 * A live product page shipped NO JSON-LD (verified 2026-09-26 on a Prod storefront). Rules under test:
 * price + currency come from the buyer's own Money (never a hardcoded THB/USD), availability is only claimed when
 * known, nothing is invented, and the tag is safe to embed in HTML.
 */
const ctx = { url: 'https://shop.example.com/products/tee', origin: 'https://shop.example.com' }
const base = {
  handle: 'tee',
  title: 'Cotton Tee',
  price: { amount: '10.00', currencyCode: 'THB' },
  availableForSale: true,
  vendor: 'Nova Brand',
  featuredImage: { url: '/img/tee.png' },
}

describe('productJsonLd', () => {
  it('builds Product + Offer from the product as the buyer sees it', () => {
    expect(productJsonLd(base as never, ctx)).toEqual({
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: 'Cotton Tee',
      url: 'https://shop.example.com/products/tee',
      image: ['https://shop.example.com/img/tee.png'],
      brand: { '@type': 'Brand', name: 'Nova Brand' },
      offers: {
        '@type': 'Offer',
        url: 'https://shop.example.com/products/tee',
        price: '10.00',
        priceCurrency: 'THB',
        availability: 'https://schema.org/InStock',
      },
    })
  })

  it.each([
    ['THB', '10.00'],
    ['USD', '1.00'],
    ['EUR', '9.90'],
    ['JPY', '1200'],
  ])('carries the buyer currency through untouched (%s)', (currencyCode, amount) => {
    const ld = productJsonLd({ ...base, price: { amount, currencyCode } } as never, ctx) as {
      offers: { price: string; priceCurrency: string }
    }
    expect(ld.offers).toMatchObject({ price: amount, priceCurrency: currencyCode })
  })

  it('availability: out of stock is claimed, unknown is NOT (no invented stock state)', () => {
    const out = productJsonLd({ ...base, availableForSale: false } as never, ctx) as { offers: Record<string, unknown> }
    expect(out.offers.availability).toBe('https://schema.org/OutOfStock')
    const unknown = productJsonLd({ ...base, availableForSale: undefined } as never, ctx) as {
      offers: Record<string, unknown>
    }
    expect(unknown.offers).not.toHaveProperty('availability')
  })

  it.each([
    ['no price', { price: undefined }],
    ['no currency', { price: { amount: '10.00', currencyCode: '' } }],
    ['lowercase/garbage currency', { price: { amount: '10.00', currencyCode: 'baht' } }],
    ['non-numeric amount', { price: { amount: 'free', currencyCode: 'THB' } }],
    ['negative amount', { price: { amount: '-1', currencyCode: 'THB' } }],
  ])('NEGATIVE CONTROL: %s → no offers at all (never a made-up price)', (_l, patch) => {
    const ld = productJsonLd({ ...base, ...patch } as never, ctx) as Record<string, unknown>
    expect(ld['@type']).toBe('Product')
    expect(ld).not.toHaveProperty('offers')
  })

  it('omits what it does not know: no vendor → no brand, no image → no image, no title → null', () => {
    const ld = productJsonLd({ ...base, vendor: '', featuredImage: null } as never, ctx) as Record<string, unknown>
    expect(ld).not.toHaveProperty('brand')
    expect(ld).not.toHaveProperty('image')
    expect(productJsonLd({ ...base, title: '  ' } as never, ctx)).toBeNull()
  })

  it('NEGATIVE CONTROL: only http(s) images are listed (a data: placeholder or javascript: URL is dropped)', () => {
    const ld = productJsonLd(
      {
        ...base,
        featuredImage: { url: 'data:image/svg+xml,%3Csvg%3E' },
        images: [{ url: 'javascript:alert(1)' }, { url: '//cdn.example.com/a.jpg' }, { url: 'https://cdn.example.com/b.jpg' }],
      } as never,
      ctx,
    ) as { image?: string[] }
    expect(ld.image).toEqual(['https://cdn.example.com/a.jpg', 'https://cdn.example.com/b.jpg'])
  })

  it('description: merchant SEO description, else plaintext body; HTML stripped', () => {
    const seo = productJsonLd({ ...base, seo: { description: 'SEO words' }, description: 'body' } as never, ctx) as Record<string, unknown>
    expect(seo.description).toBe('SEO words')
    const body = productJsonLd({ ...base, description: '<p>Soft <b>cotton</b></p>' } as never, ctx) as Record<string, unknown>
    expect(body.description).toBe('Soft cotton')
  })

  it('variants: differing prices → AggregateOffer low/high; sku and a valid barcode become sku + gtin (single variant)', () => {
    const two = productJsonLd(
      {
        ...base,
        variants: [
          { id: 'a', title: 'S', price: { amount: '10.00', currencyCode: 'USD' }, availableForSale: false },
          { id: 'b', title: 'L', price: { amount: '12.50', currencyCode: 'USD' }, availableForSale: true },
        ],
      } as never,
      ctx,
    ) as { offers: Record<string, unknown> }
    expect(two.offers).toMatchObject({
      '@type': 'AggregateOffer',
      lowPrice: '10.00',
      highPrice: '12.50',
      priceCurrency: 'USD',
      offerCount: 2,
      availability: 'https://schema.org/InStock', // at least one variant can be bought
    })
    const one = productJsonLd(
      {
        ...base,
        variants: [
          {
            id: 'a',
            title: 'Default',
            price: { amount: '10.00', currencyCode: 'THB' },
            availableForSale: true,
            sku: 'TEE-1',
            barcode: '4006381333931',
          },
        ],
      } as never,
      ctx,
    ) as Record<string, unknown>
    expect(one).toMatchObject({ sku: 'TEE-1', gtin: '4006381333931' })
    const badBarcode = productJsonLd(
      { ...base, variants: [{ id: 'a', title: 'D', price: base.price, availableForSale: true, barcode: 'ABC-12' }] } as never,
      ctx,
    ) as Record<string, unknown>
    expect(badBarcode).not.toHaveProperty('gtin')
  })
})

describe('jsonLdTag', () => {
  it('is null for no data; otherwise a script tag that cannot break out of HTML', () => {
    expect(jsonLdTag(null)).toBe('')
    const tag = jsonLdTag({ '@type': 'Product', name: '</script><script>alert(1)</script>' + String.fromCharCode(0x2028) })
    expect(tag.startsWith('<script type="application/ld+json">')).toBe(true)
    expect(tag.slice(35, -9)).not.toContain('</script>')
    expect(tag).not.toContain(String.fromCharCode(0x2028))
    expect(JSON.parse(tag.slice(35, -9)).name).toContain('alert(1)') // still round-trips as data
  })
})

describe('computeHead / applyHead carry the JSON-LD', () => {
  const data = {
    shop: { name: 'Nova Shop' },
    productByHandle: (h: string) => (h === 'tee' ? { ...base } : null),
    collectionByHandle: () => null,
    pageByHandle: () => null,
  } as unknown as DataApi

  afterEach(() => {
    document.head.innerHTML = ''
  })

  it('product route → jsonLd built with the SERVER origin; other routes → none', () => {
    const head = computeHead('/products/tee', data, { shopName: 'Nova Shop' }, 'https://shop.example.com')
    expect(head.jsonLd).toMatchObject({ '@type': 'Product', url: 'https://shop.example.com/products/tee' })
    expect(computeHead('/', data, { shopName: 'Nova Shop' }, 'https://shop.example.com').jsonLd).toBeNull()
  })

  it('soft navigation writes the tag for a product and REMOVES it on the next non-product route', () => {
    applyHead(computeHead('/products/tee', data, { shopName: 'Nova Shop' }, 'https://shop.example.com'))
    expect(document.querySelectorAll('script[type="application/ld+json"]').length).toBe(1)
    applyHead(computeHead('/', data, { shopName: 'Nova Shop' }, 'https://shop.example.com'))
    expect(document.querySelectorAll('script[type="application/ld+json"]').length).toBe(0)
  })
})

describe('server document (crawlers do not run JS)', () => {
  it('a product page ships the JSON-LD in the SERVER html; a non-product page does not', async () => {
    const { renderDocument } = await import('../entry')
    const data = {
      shop: { name: 'Nova Shop' },
      productByHandle: (h: string) => (h === 'tee' ? { ...base } : null),
      collectionByHandle: () => null,
      pageByHandle: () => null,
    } as unknown as DataApi
    const shell = (path: string) =>
      renderDocument({
        lang: 'en',
        head: computeHead(path, data, { shopName: 'Nova Shop' }, 'https://shop.example.com'),
        body: '',
        state: null,
        content: {},
        assets: '',
        mode: 'serve',
      })
    const product = shell('/products/tee')
    expect(product).toContain('<script type="application/ld+json">')
    expect(product).toContain('"priceCurrency":"THB"')
    expect(product).toContain('"url":"https://shop.example.com/products/tee"')
    expect(shell('/')).not.toContain('application/ld+json')
  }, 60_000) // importing the entry pulls the whole theme
})

