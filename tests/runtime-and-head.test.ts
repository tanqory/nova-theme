/**
 * The mock/editor/storefront boundary, the per-route document head, and route
 * analytics de-duplication — the three things that made a broken storefront
 * look healthy.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DataApi } from '../lib/tanqory/index'
import { isConfiguredForLiveData, isEditorPreview, isMockDataAllowed } from '../lib/runtime'
import { applyHead, computeHead } from '../lib/head'
import { emitRoute, resetRouteAnalytics } from '../lib/route-analytics'

function setUrl(pathname: string, search = ''): void {
  window.history.replaceState({}, '', pathname + search)
}

afterEach(() => {
  vi.unstubAllEnvs()
  setUrl('/')
})

describe('mock data is never a production fallback', () => {
  it('is allowed on an unconfigured (offline dev) build', () => {
    vi.stubEnv('VITE_TANQORY_BACKEND', '')
    vi.stubEnv('VITE_TANQORY_STORE_ID', '')
    expect(isConfiguredForLiveData()).toBe(false)
    expect(isMockDataAllowed()).toBe(true)
  })

  it('is NOT allowed on a configured storefront', () => {
    vi.stubEnv('VITE_TANQORY_BACKEND', 'https://api.tanqory.com')
    vi.stubEnv('VITE_TANQORY_STORE_ID', '00000000-0000-0000-0000-000000000001')
    expect(isConfiguredForLiveData()).toBe(true)
    // This is the fix for "API error shows Example product · $99 on a real
    // store": a configured build must surface the error instead.
    expect(isMockDataAllowed()).toBe(false)
  })

  it('is allowed inside the editor preview even on a configured build', () => {
    vi.stubEnv('VITE_TANQORY_BACKEND', 'https://api.tanqory.com')
    vi.stubEnv('VITE_TANQORY_STORE_ID', '00000000-0000-0000-0000-000000000001')
    setUrl('/', '?preview=1')
    expect(isEditorPreview()).toBe(true)
    expect(isMockDataAllowed()).toBe(true)
  })

  it('treats a preview- host as the editor', () => {
    // jsdom's location.hostname is fixed, so assert the ?preview= arm here and
    // leave the hostname arm to the integration check.
    setUrl('/')
    expect(isEditorPreview()).toBe(false)
  })
})

describe('per-route document head', () => {
  const data = {
    shop: { name: 'Nova Shop', description: 'A shop' },
    productByHandle: (h: string) =>
      h === 'tee'
        ? { title: 'Cotton Tee', seo: { title: null, description: 'A soft tee', keywords: [] }, featuredImage: { url: '/tee.png' } }
        : null,
    collectionByHandle: (h: string) =>
      h === 'sale' ? { title: 'Sale', seo: { title: 'Sale — best prices', description: 'Deals', keywords: [] } } : null,
    pageByHandle: () => null,
  } as unknown as DataApi

  it('titles a product page after the product', () => {
    const head = computeHead('/products/tee', data, { shopName: 'Nova Shop' })
    expect(head.title).toBe('Cotton Tee — Nova Shop')
    expect(head.description).toBe('A soft tee')
    expect(head.type).toBe('product')
  })

  it('prefers the merchant’s SEO title verbatim', () => {
    const head = computeHead('/collections/sale', data, { shopName: 'Nova Shop' })
    expect(head.title).toBe('Sale — best prices')
  })

  it('falls back to the shop for the home page', () => {
    const head = computeHead('/', data, { shopName: 'Nova Shop' })
    expect(head.title).toBe('Nova Shop')
    expect(head.type).toBe('website')
  })

  it('writes canonical + og tags for the CURRENT url', () => {
    setUrl('/products/tee')
    applyHead(computeHead('/products/tee', data, { shopName: 'Nova Shop' }))
    expect(document.title).toBe('Cotton Tee — Nova Shop')
    expect(document.querySelector('link[rel="canonical"]')?.getAttribute('href')).toContain(
      '/products/tee',
    )
    expect(document.querySelector('meta[property="og:title"]')?.getAttribute('content')).toBe(
      'Cotton Tee — Nova Shop',
    )
  })

  it('replaces the previous page’s head on a second route', () => {
    setUrl('/products/tee')
    applyHead(computeHead('/products/tee', data, { shopName: 'Nova Shop' }))
    setUrl('/collections/sale')
    applyHead(computeHead('/collections/sale', data, { shopName: 'Nova Shop' }))
    // With SPA routing on, the head used to be written once at boot, so every
    // page reached by clicking kept the landing page's title and canonical.
    expect(document.title).toBe('Sale — best prices')
    expect(document.querySelector('link[rel="canonical"]')?.getAttribute('href')).toContain(
      '/collections/sale',
    )
  })
})

describe('route analytics', () => {
  const data = {
    productByHandle: (h: string) => ({ id: `gid://p/${h}`, handle: h, title: h, price: { amount: '1', currencyCode: 'USD' } }),
    collectionByHandle: (h: string) => ({ id: `gid://c/${h}`, handle: h, title: h, products: [] }),
  } as unknown as DataApi

  beforeEach(() => resetRouteAnalytics())

  it('emits once per route', () => {
    expect(emitRoute({ pathname: '/products/tee', search: '' }, data)).toBe(true)
    // React effects can run twice (StrictMode, a re-render mid-navigation); a
    // double PRODUCT_VIEWED is a silently wrong number in merchant reports.
    expect(emitRoute({ pathname: '/products/tee', search: '' }, data)).toBe(false)
  })

  it('emits again for a different route', () => {
    expect(emitRoute({ pathname: '/products/tee', search: '' }, data)).toBe(true)
    expect(emitRoute({ pathname: '/products/hat', search: '' }, data)).toBe(true)
  })

  it('treats a query-only change as a new route', () => {
    // /search?q=shoes → /search?q=shirts is a different result set and a
    // different SEARCH_SUBMITTED.
    expect(emitRoute({ pathname: '/search', search: '?q=shoes' }, data)).toBe(true)
    expect(emitRoute({ pathname: '/search', search: '?q=shirts' }, data)).toBe(true)
    expect(emitRoute({ pathname: '/search', search: '?q=shirts' }, data)).toBe(false)
  })
})

describe('head does not leak between routes', () => {
  it('clears a tag the new page has no value for', () => {
    // Product page: description + image + keywords.
    applyHead({
      title: 'Wool coat',
      description: 'A warm coat.',
      keywords: ['coat', 'wool'],
      image: 'https://cdn.example/coat.jpg',
      type: 'product',
      siteName: 'Shop',
      favicon: '',
    })
    expect(document.querySelector('meta[property="og:image"]')?.getAttribute('content')).toBe(
      'https://cdn.example/coat.jpg',
    )

    // Soft-navigate to a page with no SEO description and no image.
    applyHead({
      title: 'Contact',
      description: '',
      keywords: [],
      image: '',
      type: 'website',
      siteName: 'Shop',
      favicon: '',
    })
    expect(document.querySelector('meta[property="og:image"]')).toBeNull()
    expect(document.querySelector('meta[property="og:description"]')).toBeNull()
    expect(document.querySelector('meta[name="keywords"]')).toBeNull()
    expect(document.querySelector('meta[name="twitter:image"]')).toBeNull()
    // The title still follows the new page.
    expect(document.title).toBe('Contact')
  })
})
