/**
 * ONL-02: after the merchant uploads a logo, picks a brand colour and
 * publishes, the storefront header shows that logo, colour and store name.
 *
 * The real SSR entry, `render(request, ctx)`, is called the way the platform's
 * isolate calls it, against a stubbed store-api that answers the bootstrap
 * with a published Settings → Brand. Nothing in the theme is mocked.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from '../entry'

const SHOP = {
  name: 'Lumen & Oak',
  description: null,
  email: null,
  phone: null,
  brand: {
    logo: { url: 'https://cdn.example.com/stores/s1/logo.png', altText: 'Lumen and Oak logo', width: 240, height: 80 },
    squareLogo: null,
    coverImage: null,
    slogan: null,
    shortDescription: null,
    fonts: [],
    colors: { primary: [{ background: '#0b5d3b', foreground: '#ffffff' }], secondary: [] },
  },
}

const ctx = {
  mode: 'serve',
  store: { id: 's1', apiBase: 'https://store-api.example', token: 'pk_test', country: 'US', locale: 'en' },
  content: null,
  assets: null,
} as never

const requests: Array<{ url: string; query: string }> = []

beforeEach(() => {
  requests.length = 0
  vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
    const { query } = JSON.parse(String(init.body)) as { query: string }
    requests.push({ url, query })
    const data = {
      shop: SHOP,
      mainMenu: null,
      footerMenu: null,
      collections: { edges: [] },
      products: { edges: [] },
      page: null,
      product: null,
      collection: null,
      localization: null,
    }
    return new Response(JSON.stringify({ data }), { status: 200, headers: { 'content-type': 'application/json' } })
  })
})
afterEach(() => vi.unstubAllGlobals())

async function home(): Promise<string> {
  const res = await render(new Request('https://lumen-oak.example/'), ctx)
  expect(res.status).toBe(200)
  return res.text()
}

function header(html: string): string {
  const m = html.match(/<header[^>]*class="[^"]*site-header[\s\S]*?<\/header>/)
  expect(m, 'the page renders a site header').not.toBeNull()
  return m![0]
}

describe('the storefront header carries the published brand', () => {
  it('asks the store-api for the brand logo and colours in the bootstrap', async () => {
    await home()
    expect(requests[0].url).toBe('https://store-api.example/api/v1/stores/s1/graphql')
    expect(requests[0].query).toMatch(/brand\s*\{[\s\S]*logo[\s\S]*colors/)
  })

  it('shows the uploaded logo, named for the store', async () => {
    const h = header(await home())
    const img = h.match(/<img[^>]*class="site-header__logo"[^>]*>/)
    expect(img, 'the header renders the logo image').not.toBeNull()
    expect(img![0]).toContain('src="https://cdn.example.com/stores/s1/logo.png"')
    expect(img![0]).toContain('alt="Lumen and Oak logo"')
  })

  it('sets the brand colour as the --color-brand custom property', async () => {
    const html = await home()
    const style = html.match(/<style id="tq-theme-settings">([\s\S]*?)<\/style>/)
    expect(style, 'the theme settings style is rendered').not.toBeNull()
    expect(style![1]).toMatch(/--color-brand:\s*#0b5d3b/i)
  })

  it('names the store in the page and falls back to its name as header text without a logo', async () => {
    const html = await home()
    expect(html).toMatch(/<title>[^<]*Lumen &amp; Oak[^<]*<\/title>/)
    SHOP.brand.logo = null as never
    try {
      const h = header(await home())
      expect(h).not.toContain('site-header__logo')
      expect(h).toContain('Lumen &amp; Oak')
    } finally {
      SHOP.brand.logo = { url: 'https://cdn.example.com/stores/s1/logo.png', altText: 'Lumen and Oak logo', width: 240, height: 80 }
    }
  })
})
