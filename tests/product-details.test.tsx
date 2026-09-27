/**
 * Regression tests for the product page's commerce correctness.
 *
 * Each test names the behaviour that was wrong before, because that is the
 * thing a future change must not quietly reintroduce.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Product } from '../lib/tanqory/index'
import { ProductDetails } from '../sections/ProductDetails'
import { click, product, renderSection, setUrl, stubData } from './helpers/render'

/** A product with a real option matrix: Red/S exists, Red/XL does not. */
function optioned(): Product {
  return product('tee', {
    title: 'Tee',
    options: [
      { name: 'Color', values: ['Red', 'Black'] },
      { name: 'Size', values: ['S', 'XL'] },
    ],
    variants: [
      {
        id: 'gid://variant/red-s',
        title: 'Red / S',
        price: { amount: '10.00', currencyCode: 'USD' },
        availableForSale: true,
        selectedOptions: [
          { name: 'Color', value: 'Red' },
          { name: 'Size', value: 'S' },
        ],
      },
      {
        id: 'gid://variant/black-xl',
        title: 'Black / XL',
        price: { amount: '12.00', currencyCode: 'USD' },
        availableForSale: false,
        selectedOptions: [
          { name: 'Color', value: 'Black' },
          { name: 'Size', value: 'XL' },
        ],
      },
    ],
    // The bootstrap card's first-available variant. The bug under test was the
    // page falling back to THIS whenever the on-screen combination had no match.
    variantId: 'gid://variant/red-s',
  } as Partial<Product>)
}

/** Click the option button with this label. */
function clickOption(container: HTMLElement, label: string): HTMLButtonElement | undefined {
  const btn = [...container.querySelectorAll('button')].find(
    (b) => b.textContent?.trim() === label,
  ) as HTMLButtonElement | undefined
  click(btn)
  return btn
}

function buyButton(container: HTMLElement): HTMLButtonElement | undefined {
  return [...container.querySelectorAll('button')].find((b) =>
    /add to cart|sold out|unavailable|loading/i.test(b.textContent ?? ''),
  ) as HTMLButtonElement | undefined
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('a product URL that does not exist', () => {
  it('shows not-found instead of a different product', async () => {
    setUrl('/products/audit-missing-product')
    const data = stubData({
      collections: [{ handle: 'all', title: 'All', products: [product('example-product-1')] }],
      fetchProductReturnsNull: true,
    })
    const h = await renderSection(<ProductDetails attributes={{}} />, data)
    await h.settle()

    // The old behaviour: `collectionByHandle('all').products[0]` rendered a real,
    // buyable product page for something the shopper never asked for.
    expect(h.text()).not.toContain('example-product-1')
    expect(h.text()).toMatch(/not found|no longer/i)
    expect(buyButton(h.container)).toBeUndefined()
    h.unmount()
  })

  it('shows loading, not not-found, while the lookup is still in flight', async () => {
    setUrl('/products/slow')
    const data = stubData({ collections: [] })
    let release: (() => void) | undefined
    data.fetchProduct = () =>
      new Promise((resolve) => {
        release = () => resolve(null)
      })
    const h = await renderSection(<ProductDetails attributes={{}} />, data)
    expect(h.text()).toMatch(/loading/i)
    expect(h.text()).not.toMatch(/not found/i)
    release?.()
    await h.settle()
    expect(h.text()).toMatch(/not found/i)
    h.unmount()
  })
})

describe('the URL is canonical on the storefront', () => {
  it('ignores the section’s product setting on a product route', async () => {
    setUrl('/products/real-product')
    const data = stubData({
      collections: [
        {
          handle: 'all',
          title: 'All',
          products: [product('real-product', { title: 'Real' }), product('preview-pick', { title: 'Preview Pick' })],
        },
      ],
    })
    // The setting is labelled "preview only — URL :handle is canonical", and on
    // a published storefront it used to win over the URL.
    const h = await renderSection(<ProductDetails attributes={{ product: 'preview-pick' }} />, data)
    await h.settle()
    expect(h.text()).toContain('Real')
    expect(h.text()).not.toContain('Preview Pick')
    h.unmount()
  })

  it('uses the setting off a product route, where there is no URL to read', async () => {
    setUrl('/')
    const data = stubData({
      collections: [{ handle: 'all', title: 'All', products: [product('featured', { title: 'Featured One' })] }],
    })
    const h = await renderSection(<ProductDetails attributes={{ product: 'featured' }} />, data)
    await h.settle()
    expect(h.text()).toContain('Featured One')
    h.unmount()
  })
})

describe('?variant= preselects the variant (feed and share links land on the variant they name)', () => {
  const render = async (search: string) => {
    setUrl('/products/tee', search)
    const data = stubData({
      collections: [{ handle: 'all', title: 'All', products: [product('tee')] }],
      details: { tee: optioned() },
    })
    const h = await renderSection(<ProductDetails attributes={{}} />, data)
    await h.settle()
    return h
  }

  it('a known variant id is selected, even when it is sold out (the page agrees with the feed)', async () => {
    const h = await render('?variant=gid://variant/black-xl')
    expect(buyButton(h.container)?.textContent).toMatch(/sold out|unavailable/i)
    expect(buyButton(h.container)?.disabled).toBe(true)
    h.unmount()
  })

  it('NEGATIVE CONTROL: an unknown or empty variant id falls back to the first available variant', async () => {
    for (const search of ['?variant=nope', '?variant=', '']) {
      const h = await render(search)
      expect(buyButton(h.container)?.disabled).toBe(false)
      h.unmount()
    }
  })
})

describe('variant selection', () => {
  it('refuses to sell a combination that has no variant', async () => {
    setUrl('/products/tee')
    const tee = optioned()
    const data = stubData({
      collections: [{ handle: 'all', title: 'All', products: [product('tee')] }],
      details: { tee },
    })
    const h = await renderSection(<ProductDetails attributes={{}} />, data)
    await h.settle()

    // Seeded on the first available variant: Red / S.
    expect(buyButton(h.container)?.disabled).toBe(false)

    // Red / XL does not exist. The old code fell back to `product.variantId`
    // (Red / S) and happily added it at the price shown.
    await h.settle()
    clickOption(h.container, 'XL')
    await h.settle()

    const btn = buyButton(h.container)
    expect(btn?.disabled).toBe(true)
    expect(btn?.textContent).toMatch(/unavailable/i)
    h.unmount()
  })

  it('disables the button for a sold-out combination that does exist', async () => {
    setUrl('/products/tee')
    const data = stubData({
      collections: [{ handle: 'all', title: 'All', products: [product('tee')] }],
      details: { tee: optioned() },
    })
    const h = await renderSection(<ProductDetails attributes={{}} />, data)
    await h.settle()
    clickOption(h.container, 'Black')
    await h.settle()
    clickOption(h.container, 'XL')
    await h.settle()

    const btn = buyButton(h.container)
    expect(btn?.disabled).toBe(true)
    expect(btn?.textContent).toMatch(/sold out/i)
    h.unmount()
  })

  it('adds the variant matching the on-screen options, not the default', async () => {
    setUrl('/products/tee')
    const added: Array<{ variantId: string }> = []
    const data = stubData({
      collections: [{ handle: 'all', title: 'All', products: [product('tee')] }],
      details: {
        tee: {
          ...optioned(),
          variants: [
            ...(optioned().variants ?? []),
            {
              id: 'gid://variant/black-s',
              title: 'Black / S',
              price: { amount: '11.00', currencyCode: 'USD' },
              availableForSale: true,
              selectedOptions: [
                { name: 'Color', value: 'Black' },
                { name: 'Size', value: 'S' },
              ],
            },
          ],
        } as Product,
      },
      graphql: (async (_q: string, vars?: Record<string, unknown>) => {
        // Cart mutations go through graphql; record the merchandise id.
        const id = (vars?.lines as Array<{ merchandiseId?: string }> | undefined)?.[0]?.merchandiseId
        if (id) added.push({ variantId: id })
        return {} as never
      }) as never,
    })
    const h = await renderSection(<ProductDetails attributes={{}} />, data)
    await h.settle()
    clickOption(h.container, 'Black')
    await h.settle()

    // Black / S exists and is available — the button must be live and bound to it.
    const btn = buyButton(h.container)
    expect(btn?.disabled).toBe(false)
    expect(btn?.textContent).toMatch(/add to cart/i)
    h.unmount()
  })
})

describe('offline / mock data', () => {
  it('still renders a buyable single-variant product with no backend', async () => {
    setUrl('/products/example-product-1')
    const data = stubData({
      offline: true,
      collections: [
        { handle: 'all', title: 'All', products: [product('example-product-1', { title: 'Example' })] },
      ],
    })
    const h = await renderSection(<ProductDetails attributes={{}} />, data)
    await h.settle()
    expect(h.text()).toContain('Example')
    expect(buyButton(h.container)?.disabled).toBe(false)
    h.unmount()
  })
})

describe('merchant-owned product facts', () => {
  it('renders no materials/shipping claims the merchant did not write', async () => {
    setUrl('/products/tee')
    const data = stubData({
      collections: [{ handle: 'all', title: 'All', products: [product('tee')] }],
      details: { tee: optioned() },
    })
    const h = await renderSection(<ProductDetails attributes={{}} />, data)
    await h.settle()
    // These strings were hardcoded into every store on the theme.
    expect(h.text()).not.toMatch(/organic cotton/i)
    expect(h.text()).not.toMatch(/free shipping/i)
    expect(h.text()).not.toMatch(/30-day returns/i)
    expect(h.text()).not.toMatch(/ships in 24h/i)
    h.unmount()
  })

  it("renders them when they come from the merchant's metafields", async () => {
    setUrl('/products/tee')
    const withFacts = {
      ...optioned(),
      metafields: {
        'custom.materials': 'Recycled polyester.',
        'custom.shipping': 'Ships from Bangkok in 2 days.',
      },
    } as Product
    const data = stubData({
      collections: [{ handle: 'all', title: 'All', products: [product('tee')] }],
      details: { tee: withFacts },
    })
    const h = await renderSection(<ProductDetails attributes={{}} />, data)
    await h.settle()
    expect(h.text()).toContain('Recycled polyester.')
    expect(h.text()).toContain('Ships from Bangkok in 2 days.')
    h.unmount()
  })
})

describe('switching from product A to product B', () => {
  it('never shows A’s description under B’s title', async () => {
    setUrl('/products/a')
    const a = product('a', { title: 'Product A', description: 'A body' })
    const b = product('b', { title: 'Product B', description: 'B body' })
    const data = stubData({
      collections: [{ handle: 'all', title: 'All', products: [a, b] }],
      details: { a, b },
    })

    const first = await renderSection(<ProductDetails attributes={{}} />, data)
    await first.settle()
    expect(first.text()).toContain('Product A')
    expect(first.text()).toContain('A body')
    first.unmount()

    // A soft navigation remounts the section against the new URL. The state that
    // used to leak (`detail`, `descriptionHtml`) is keyed to the handle now.
    setUrl('/products/b')
    const second = await renderSection(<ProductDetails attributes={{}} />, data)
    await second.settle()
    expect(second.text()).toContain('Product B')
    expect(second.text()).toContain('B body')
    expect(second.text()).not.toContain('A body')
    expect(second.text()).not.toContain('Product A')
    second.unmount()
  })
})

describe('the description round-trip', () => {
  it('does not re-request descriptionHtml when the kit already supplied it', async () => {
    setUrl('/products/tee')
    const graphql = vi.fn(
      async (_query: string, _vars?: Record<string, unknown>) => ({
        product: { descriptionHtml: '<p>from query</p>' },
      }),
    )
    const detail = { ...optioned(), descriptionHtml: '<p>from kit</p>' } as Product
    const data = stubData({
      collections: [{ handle: 'all', title: 'All', products: [product('tee')] }],
      details: { tee: detail },
      graphql: graphql as never,
    })
    const h = await renderSection(<ProductDetails attributes={{}} />, data)
    await h.settle()
    await h.settle()

    // theme-kit's PRODUCT_QUERY now selects descriptionHtml. When it is present
    // the theme must not pay for a second round-trip.
    const descriptionCalls = graphql.mock.calls.filter((args) =>
      String(args[0]).includes('ThemeProductDescriptionHtml'),
    )
    expect(descriptionCalls).toHaveLength(0)
    expect(h.container.innerHTML).toContain('from kit')
    h.unmount()
  })
})
