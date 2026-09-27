/**
 * Per-route document head — title, description, canonical, Open Graph, Twitter
 * card and favicon — computed from the merchant's own SEO fields.
 *
 * Extracted from `main.tsx` so BOTH entry points can use it: the boot path
 * (which runs once) and the SPA router in `layouts/layout.tsx` (which runs on
 * every soft navigation). Previously only boot applied a head, so every page a
 * shopper reached by clicking kept the previous page's <title>, canonical and
 * og: tags — including the link they then shared.
 *
 * Title precedence: the resource's SEO title verbatim (the merchant owns it) →
 * "<resource title> — <shop>" → the shop name. Description: SEO description →
 * page bodySummary → shop description (home only).
 */
import type { DataApi } from './tanqory/index'
import { matchRoute } from './routes.ts'
import { productJsonLd, serializeJsonLd, type JsonLd } from './structured-data.ts'

/** Build a HeadMeta from a resource's SEO (shared by blog/article, which resolve
 *  their SEO asynchronously rather than from the sync bootstrap). */
export function headFrom(
  seo: { title?: string | null; description?: string | null; keywords?: string[] | null } | null | undefined,
  resourceTitle: string,
  shopName: string,
  fallbackDesc?: string | null,
  image?: string | null,
): HeadMeta {
  return {
    title: documentTitle({ seoTitle: seo?.title, resourceTitle, shopName }),
    description: (seo?.description || fallbackDesc || '').trim(),
    keywords: (seo?.keywords ?? []).filter(Boolean),
    image: absUrl(image),
    type: 'article',
    siteName: shopName,
    favicon: '',
  }
}

/**
 * Per-route document head (title + meta description) from the merchant's SEO
 * fields. Precedence — title: the resource's SEO title verbatim (merchant owns
 * it) → "<resource title> — <shop>" → shop name; description: SEO description →
 * page bodySummary → shop description (home only). Runs client-side on every
 * route (the SSG only prerenders home), so product/collection/page pages that
 * are client-rendered still get a correct, unique title + description.
 */
export interface HeadMeta {
  title: string
  description: string
  keywords: string[]
  /** Absolute URL of the page's lead image, for og:image / twitter:image. */
  image: string
  /** 'website' for the home page, 'product'/'article' for detail pages. */
  type: string
  /** Shop name — og:site_name. */
  siteName: string
  /** Absolute URL for the favicon / tab icon (square brand mark). */
  favicon: string
  /** schema.org JSON-LD for the page (a Product on product routes), or null. */
  jsonLd?: JsonLd | null
}

/** Resolve a possibly-relative asset URL to an absolute one, against the
 *  current origin — social scrapers require absolute og:image URLs. */
export function absUrl(url: string | undefined | null): string {
  if (!url) return ''
  if (/^https?:\/\//.test(url)) return url
  if (typeof window === 'undefined') return url
  return new URL(url, window.location.origin).toString()
}

export function computeHead(
  pathname: string,
  data: DataApi,
  settings: { shopName?: unknown },
  /** The request origin on the server render; the browser origin when omitted. */
  origin?: string,
): HeadMeta {
  const shop = data.shop as
    | {
        name?: string
        description?: string
        brand?: {
          logo?: { url?: string } | null
          squareLogo?: { url?: string } | null
          coverImage?: { url?: string } | null
        } | null
      }
    | undefined
  // The theme's shop name first, like the header — never the store ACCOUNT's
  // name when the theme names its brand (nova#14).
  const shopName = shopNameOf(settings.shopName, shop?.name)
  let seoTitle: string | null | undefined
  let rawTitle: string | undefined
  let description: string | null | undefined
  let keywords: string[] = []
  let image: string | undefined
  let type = 'website'
  let jsonLd: JsonLd | null = null
  const pageOrigin = origin ?? (typeof window === 'undefined' ? '' : window.location.origin)
  const route = matchRoute(pathname)
  const isDetail = {
    pg: route.resource === 'page' ? route.handle : undefined,
    pr: route.resource === 'product' ? route.handle : undefined,
    co: route.resource === 'collection' ? route.handle : undefined,
  }
  if (isDetail.pr) {
    const r = data.productByHandle(isDetail.pr) as
      | { seo?: { title?: string | null; description?: string | null; keywords?: string[] }; title?: string; featuredImage?: { url?: string } | null }
      | undefined
    seoTitle = r?.seo?.title; rawTitle = r?.title; description = r?.seo?.description; keywords = r?.seo?.keywords ?? []
    image = r?.featuredImage?.url; type = 'product'
    jsonLd = productJsonLd(data.productByHandle(isDetail.pr) ?? null, {
      url: pageOrigin ? `${pageOrigin}${pathname}` : pathname,
      origin: pageOrigin,
    })
  } else if (isDetail.co) {
    const r = data.collectionByHandle(isDetail.co) as
      | { seo?: { title?: string | null; description?: string | null; keywords?: string[] }; title?: string; image?: { url?: string } | null }
      | undefined
    seoTitle = r?.seo?.title; rawTitle = r?.title; description = r?.seo?.description; keywords = r?.seo?.keywords ?? []
    image = r?.image?.url
  } else if (isDetail.pg) {
    const r = data.pageByHandle(isDetail.pg)
    seoTitle = r?.seo?.title; rawTitle = r?.title; description = r?.seo?.description || r?.bodySummary; keywords = r?.seo?.keywords ?? []
    type = 'article'
  }
  const isHome = !isDetail.pg && !isDetail.pr && !isDetail.co
  const title = documentTitle({ seoTitle, resourceTitle: rawTitle, shopName })
  return {
    title,
    description: (description || (isHome ? shop?.description : '') || '').trim(),
    keywords: keywords.filter(Boolean),
    // og:image fallback chain: the resource's own image → the brand cover image
    // (Settings → Brand, a purpose-built share banner) → the brand logo. Both
    // brand images were SAVED_ONLY — carried on the SDL, rendered nowhere.
    image: absUrl(image || shop?.brand?.coverImage?.url || shop?.brand?.logo?.url),
    type,
    siteName: shopName,
    // The square brand mark makes the best favicon / tab icon; fall back to the
    // primary logo. Also previously SAVED_ONLY.
    favicon: absUrl(shop?.brand?.squareLogo?.url || shop?.brand?.logo?.url),
    jsonLd,
  }
}

/**
 * Write the computed head into the live document (client-side).
 *
 * Beyond title/description/keywords this now emits the canonical link + Open
 * Graph + Twitter card tags that were missing entirely — which is why a shared
 * product link previewed as the bare shop name on every page. The canonical and
 * og:url use the page's own URL (the host the storefront is served on is the
 * correct canonical for that page); forcing canonical to a configured primary
 * domain when a shopper is on a different host is the store-api#558 follow-up.
 */
export function applyHead({ title, description, keywords, image, type, siteName, favicon, jsonLd }: HeadMeta): void {
  if (typeof document === 'undefined') return
  const head = document.head
  if (title) document.title = title

  /**
   * Write a head tag, or REMOVE it when the new page has no value for it.
   *
   * Skipping empty values left the previous route's head in place on a soft
   * navigation: opening a product set `og:description`, `og:image` and
   * `keywords`, and clicking through to a page without them kept all three, so
   * sharing that URL previewed the product you had just left — the exact stale
   * -head bug this module exists to fix.
   */
  const upsert = (selector: string, make: () => HTMLElement, content: string) => {
    const existing = head.querySelector(selector)
    if (!content) {
      // Only ever remove a tag this function owns, never one the document
      // shipped with that we have no replacement for.
      if (existing && existing.getAttribute('data-tq-head') === 'true') existing.remove()
      return
    }
    let el = existing
    if (!el) {
      el = make()
      el.setAttribute('data-tq-head', 'true')
      head.appendChild(el)
    }
    if (el.tagName === 'LINK') el.setAttribute('href', content)
    else el.setAttribute('content', content)
  }
  const meta = (name: string, content: string) =>
    upsert(`meta[name="${name}"]`, () => {
      const m = document.createElement('meta')
      m.setAttribute('name', name)
      return m
    }, content)
  const prop = (property: string, content: string) =>
    upsert(`meta[property="${property}"]`, () => {
      const m = document.createElement('meta')
      m.setAttribute('property', property)
      return m
    }, content)

  const url = window.location.origin + window.location.pathname

  meta('description', description)
  meta('keywords', keywords.join(', '))

  upsert('link[rel="canonical"]', () => {
    const l = document.createElement('link')
    l.setAttribute('rel', 'canonical')
    return l
  }, url)

  prop('og:type', type)
  prop('og:url', url)
  prop('og:title', title)
  prop('og:description', description)
  prop('og:site_name', siteName)
  prop('og:image', image)

  meta('twitter:card', image ? 'summary_large_image' : 'summary')
  meta('twitter:title', title)
  meta('twitter:description', description)
  meta('twitter:image', image)

  // JSON-LD: written for a product, removed on the next route that has none (soft navigation must not leave the
  // previous product's structured data behind). Same ownership rule as the other tags.
  const ld = head.querySelector('script[type="application/ld+json"][data-tq-head="true"]')
  if (jsonLd) {
    const el = ld ?? document.createElement('script')
    el.setAttribute('type', 'application/ld+json')
    el.setAttribute('data-tq-head', 'true')
    el.textContent = serializeJsonLd(jsonLd)
    if (!ld) head.appendChild(el)
  } else if (ld) {
    ld.remove()
  }

  if (favicon) {
    upsert(
      'link[rel="icon"]',
      () => {
        const l = document.createElement('link')
        l.setAttribute('rel', 'icon')
        return l
      },
      favicon,
    )
  }
}

// ── Title: the theme's shop name, like the header ───────────────────────
/**
 * The shop's name as the storefront shows it: the theme's `shopName` setting
 * (an AI-built theme names the brand it was built for), else the store's own
 * name, else 'Store'.
 */
export function shopNameOf(themeShopName: unknown, storeName: unknown): string {
  const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')
  return text(themeShopName) || text(storeName) || 'Store'
}

/**
 * A route's title: the resource's SEO title verbatim (the merchant owns it),
 * else "<resource title> — <shop>", else the shop name alone.
 */
export function documentTitle(input: {
  seoTitle?: string | null
  resourceTitle?: string | null
  shopName: string
}): string {
  const seo = input.seoTitle?.trim()
  if (seo) return seo
  const title = input.resourceTitle?.trim()
  return title ? `${title} — ${input.shopName}` : input.shopName
}
