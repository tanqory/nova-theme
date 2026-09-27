import { createContext, useContext, type ReactNode } from 'react'
import {
  type StorefrontExtensions,
  type Menu,
  type MenuItem,
  type MenuItemType,
  type Article,
  type Blog,
  type Shop,
  createStorefrontMethods,
  BOOTSTRAP_SHOP_MENU,
  BOOTSTRAP_SHOP_MENU_FRAGMENTS,
  readBootstrapShopMenu,
} from './storefront'

export interface Money {
  amount: string
  currencyCode: string
}
export interface ProductOption {
  name: string
  values: string[]
}
export interface ImageRef {
  url: string
  altText?: string
  /** Intrinsic pixel dimensions (standard `image.width`/`image.height`). */
  width?: number | null
  height?: number | null
  /** width / height (`image.aspect_ratio`) — for responsive layouts. */
  aspectRatio?: number | null
}
/** SEO snapshot (Product/Page/Article). */
export interface Seo {
  title?: string | null
  description?: string | null
  keywords?: string[] | null
}

// ─── Commerce object shapes ────────────────────────────────────────────
// Type-level commerce object model that map to metafield values /
// media sources. Themes use these to type props + parse typed metafields; not
// every one is populated by a loader yet (rating/measurement come from a
// `rating`/`dimension` metafield the theme reads via `product.metafields`).

/** standard `measurement` (a `dimension`/`volume`/`weight` metafield value). */
export interface Measurement {
  value: number
  unit: string
}
/** standard `rating` metafield value. */
export interface Rating {
  value: number
  scaleMin: number
  scaleMax: number
}
/** standard `focal_point` — normalized 0..1 crop centre. */
export interface FocalPoint {
  x: number
  y: number
}
/** standard `image_presentation`. */
export interface ImagePresentation {
  focalPoint?: FocalPoint | null
}
/** standard `model_source` (a 3D model file source). */
export interface ModelSource {
  url: string
  format?: string | null
  mimeType?: string | null
  filesize?: number | null
}
/** standard `video_source` (one encoding of a hosted video). */
export interface VideoSource {
  url: string
  format?: string | null
  mimeType?: string | null
  width?: number | null
  height?: number | null
}
/** standard `generic_file` (a File reference from a metafield). */
export interface GenericFile {
  id?: string
  url: string
  previewImage?: ImageRef | null
  mimeType?: string | null
  originalFileSize?: number | null
}
/** standard `recommendations` object — wraps the `productRecommendations()` list. */
export interface Recommendations {
  products: Product[]
  productsCount: number
  intent?: 'related' | 'complementary' | string
  performed?: boolean
}
/** Build a `recommendations` object from a product list (parity with the commerce standard
 *  `recommendations` legacy templating object, whose `.products` our API returns directly). */
export function toRecommendations(products: Product[], intent = 'related'): Recommendations {
  return { products, productsCount: products.length, intent, performed: true }
}
/** Per-variant cart quantity bounds (wholesale / case-of-N). Storefront cart enforces these. */
export interface QuantityRule {
  minimum: number
  maximum: number | null
  increment: number
}
/** Per-unit pricing ("$2.50 / 100ml"). */
export interface UnitPriceMeasurement {
  measuredType: string
  quantityValue: number
  quantityUnit: string
  referenceValue: number
  referenceUnit: string
}
/** Pickup / in-store stock for one location. */
export interface StoreAvailability {
  available: boolean
  quantityAvailable: number
  pickUpTime?: string | null
  location: { id: string; name: string }
}
export interface SellingPlanOption {
  name: string
  value: string
}
export interface SellingPlan {
  id: string
  name: string
  description?: string | null
  recurringDeliveries: boolean
  options: SellingPlanOption[]
}
export interface SellingPlanGroup {
  name: string
  appName?: string | null
  options: Array<{ name: string; values: string[] }>
  sellingPlans: SellingPlan[]
}
export interface ProductVariant {
  id: string
  title: string
  price: Money
  /** "Was" price — present when the variant is on sale (compareAtPrice > price). */
  compareAtPrice?: Money | null
  availableForSale: boolean
  selectedOptions?: { name: string; value: string }[]
  image?: ImageRef | null
  /** Stock-keeping unit. Only after `fetchProduct()`. */
  sku?: string | null
  /** Barcode (ISBN, UPC, GTIN…). Only after `fetchProduct()`. */
  barcode?: string | null
  /** On-hand stock for this variant (`inventory_quantity`). */
  inventoryQuantity?: number | null
  /** `DENY` (stop selling at 0) or `CONTINUE` (oversell) — standard `inventory_policy`. */
  inventoryPolicy?: 'DENY' | 'CONTINUE' | null
  /** Whether the variant needs shipping (physical vs digital/service). */
  requiresShipping?: boolean | null
  /** Whether tax applies to the variant. */
  taxable?: boolean | null
  /** Physical weight (for shipping display). */
  weight?: { value: number; unit: string } | null
  /** Cart quantity bounds (min/max/increment). */
  quantityRule?: QuantityRule
  /** Per-unit price ("$2.50 / 100ml") for measured products. */
  unitPrice?: Money | null
  unitPriceMeasurement?: UnitPriceMeasurement | null
  /** Pickup availability per location (only after `fetchProduct()`). */
  storeAvailability?: StoreAvailability[]
}
export interface Product {
  /** Storefront GraphQL node id (present for live data). */
  id?: string
  /** commerce-standard theme template variant (e.g. "bundle"). */
  templateSuffix?: string | null
  handle: string
  title: string
  price: Money
  /** Range "was" price (max compareAtPrice across variants) — sale badge on cards. */
  compareAtPrice?: Money | null
  featuredImage?: ImageRef | null
  /** Default purchasable variant id (`firstAvailableVariant`) — enough to add
   *  to cart from a grid/card without loading the full variant list. */
  variantId?: string
  availableForSale?: boolean
  /** Catalog facets (card badges / filtering). Present from boot. */
  vendor?: string | null
  productType?: string | null
  tags?: string[]
  /** Publish/create timestamps (standard `product.published_at`/`created_at`). */
  publishedAt?: string | null
  createdAt?: string | null
  /** Canonical storefront URL (`product.url`). */
  onlineStoreUrl?: string | null
  /** Long description as PLAINTEXT — only populated by `fetchProduct()` (PDP). */
  description?: string
  /**
   * The same body WITH the merchant's formatting (`Product.descriptionHtml`,
   * `@cost(value: 0)`), already sanitised by store-api. Only populated by
   * `fetchProduct()` (PDP). A theme renders it as HTML and must not re-sanitise
   * it; `description` is the plaintext fallback for text-only surfaces.
   */
  descriptionHtml?: string
  /** Image gallery — only after `fetchProduct()` (PDP). */
  images?: ImageRef[]
  /** Full media gallery incl. video / 3D (`product.media`) — after `fetchProduct()`. */
  media?: ProductMedia[]
  /** Option definitions (Size, Color…) — only after `fetchProduct()`. */
  options?: ProductOption[]
  /** Full variant list — only after `fetchProduct()` (PDP). */
  variants?: ProductVariant[]
  /** Subscription / selling-plan groups — only after `fetchProduct()`. */
  sellingPlanGroups?: SellingPlanGroup[]
  /** Collections this product belongs to (`product.collections`) — after `fetchProduct()`. */
  collections?: Array<{ handle: string; title: string }>
  /** True for gift-card products (`product.gift_card`) — after `fetchProduct()`. */
  isGiftCard?: boolean
  /** Total on-hand stock across variants (`product.totalInventory`). */
  totalInventory?: number | null
  /** Requested custom metafields ("namespace.key" → value) — pass identifiers to fetchProduct(). */
  metafields?: Record<string, string | null>
  /** SEO override — only after `fetchProduct()`. */
  seo?: Seo | null
}
/** A product media node — image, video, 3D model, or external (YouTube/Vimeo) video. */
export interface ProductMedia {
  id: string
  type: 'image' | 'video' | 'model_3d' | 'external_video'
  alt?: string | null
  /** Present for `image`. */
  image?: ImageRef | null
  /** Poster frame for video / 3D. */
  previewImage?: ImageRef | null
  /** Playable/loadable sources for `video` / `model_3d`. */
  sources?: { url: string; mimeType?: string | null; format?: string | null }[]
  /** For `external_video` — 'YOUTUBE' | 'VIMEO'. */
  host?: string | null
  /** For `external_video` — the embed URL. */
  embedUrl?: string | null
}

export interface Collection {
  /** Backend collection id (`collection.id`). */
  id?: string
  /** commerce-standard theme template variant (e.g. "featured"). */
  templateSuffix?: string | null
  handle: string
  title: string
  /** Collection body/description HTML (`collection.description`). */
  description?: string | null
  /** Optional hero image; falls back to first product's featuredImage. */
  image?: { url?: string; altText?: string } | null
  products: Product[]
  /** Total number of products in the collection (`products_count`). */
  productsCount?: number
  /** Custom metafields ("namespace.key" → value) for dynamic sources. */
  metafields?: Record<string, string | null>
  /** SEO title/description (merchant-edited) for the document head. */
  seo?: Seo | null
}
export interface Page {
  handle: string
  title: string
  /** HTML body — rendered via dangerouslySetInnerHTML by the PageBody section. */
  body: string
  bodySummary?: string
  author?: string | null
  publishedAt?: string
  updatedAt?: string
  /** commerce-standard template suffix (e.g. "contact"); the theme renders
   *  templates/page.<suffix>.json when set, else the default page template. */
  templateSuffix?: string | null
  /** SEO title/description (merchant-edited) for the document head. */
  seo?: Seo | null
}

/**
 * The data interface every block consumes. Themes provide an implementation.
 *
 * Core read methods (collections/products/pages/localization) are always
 * present. The commerce-standard extensions (shop, menus, search, blog,
 * recommendations, metaobjects, customer account) come from `StorefrontExtensions`
 * and are LIVE-ONLY — undefined under mock data, so themes feature-detect them
 * (`data.search?.(...)`, `data.customer?.login(...)`).
 */
export interface DataApi extends StorefrontExtensions {
  collectionByHandle: (handle: string) => Collection | null
  /** All known collections (used by CollectionList). */
  allCollections: () => Collection[]
  /**
   * List every navigation menu the store has (Dashboard → Navigation), for the
   * editor's `link_list` picker. Identity only (handle/title/count) — fetch a
   * menu's items with `fetchMenu(handle)`. Optional: older payloads may omit it.
   */
  listMenus?: () => Promise<Array<{ handle: string; title: string; itemsCount: number }>>
  /** Connected tracking pixels (Settings → Customer events) to inject on the
   *  storefront. Optional — older payloads / mock mode return []. */
  pixels?: () => Promise<
    Array<{
      id: string
      name: string
      provider: string | null
      providerPixelId: string | null
      code: string | null
    }>
  >
  /**
   * "Notify me when it's back": ask store-api to email `email` ONCE when a sold-out variant is available
   * again. `available` = it is in stock right now (nothing stored). Resolves for both; rejects on a
   * transport/HTTP failure so the form can say so. The address is used for this one email only — there is
   * no marketing opt-in on this path.
   */
  notifyBackInStock?: (input: {
    variantId: string
    email: string
    locale?: string
    country?: string
  }) => Promise<'subscribed' | 'available'>
  /** Physical store locations (Settings → Locations) for a store-locator. */
  locations?: () => Promise<
    Array<{
      id: string
      name: string
      code: string | null
      address: {
        country: string | null
        address: string | null
        city: string | null
        province: string | null
        postalCode: string | null
        phone: string | null
      } | null
    }>
  >
  /**
   * Look up a single product by its handle. Returns null when the handle
   * isn't found. Required by FeaturedProduct / ProductDetails sections
   * (ported from the canonical examples/react theme in PR #2).
   */
  productByHandle: (handle: string) => Product | null
  /**
   * Look up a Page by handle (the storefront's `/pages/<handle>` content).
   * Returns null if the handle wasn't prefetched at boot or the merchant
   * hasn't published a page with that handle. Live data prefetches only the
   * page matching the current URL, so other handles return null even when
   * they exist in the backend — themes should only call this for the page
   * the user is on.
   */
  pageByHandle: (handle: string) => Page | null
  /** Localization snapshot — what markets/countries the store has live.
   *  null = mock data; the country switcher should hide itself. */
  localization: Localization | null
  /**
   * Raw GraphQL escape hatch against the same storefront endpoint the live
   * data source was booted with. Present ONLY for live data — undefined for
   * mock data. Powers post-boot interactions (the cart's mutations live here).
   */
  graphql?: <T = unknown>(query: string, variables?: Record<string, unknown>) => Promise<T>
  /**
   * Fetch a single product WITH its full options + variants on demand (for the
   * product page's variant picker). Live data hits the backend; mock data
   * resolves synchronously from the prefetched cache. Returns null if missing.
   */
  fetchProduct?: (
    handle: string,
    opts?: { metafields?: Array<{ namespace: string; key: string }> },
  ) => Promise<Product | null>
  /**
   * Fetch the shop's custom metafields by identifier (for dynamic sources).
   * Live data queries `shop { metafields(identifiers) }`; mock data returns {}
   * (no metafields offline). Result keys are "namespace.key".
   */
  fetchShopMetafields?: (
    identifiers: Array<{ namespace: string; key: string }>,
  ) => Promise<Record<string, string | null>>
  /**
   * Fetch a collection's custom metafields by identifier (for dynamic sources).
   * Result keys are "namespace.key".
   */
  fetchCollectionMetafields?: (
    handle: string,
    identifiers: Array<{ namespace: string; key: string }>,
  ) => Promise<Record<string, string | null>>
  /**
   * The raw serializable bootstrap payload this live DataApi was built from
   * (null for mock data). The SSG step embeds it into the page as
   * `window.__TQ_STATE__` so the client can rebuild the identical DataApi
   * synchronously at hydration via createLiveDataFromSnapshot — SSR markup and
   * the client's first render match by construction.
   */
  getSnapshot?: () => unknown
}

/** Country/market shape mirrored from storefront GraphQL `Localization`. */
export interface LocalizedCurrency {
  isoCode: string
  name?: string
  symbol?: string
}
export interface LocalizedMarket {
  id: string
  handle: string
  name: string
}
export interface LocalizedCountry {
  isoCode: string
  name: string
  currency: LocalizedCurrency
  market: LocalizedMarket | null
}
/** A language the store has published (dashboard → Markets / Languages). */
export interface LocalizedLanguage {
  isoCode: string
  name: string
}
export interface Localization {
  /** Currently-active country (resolved from the request's X-Tanqory-Country). */
  country: LocalizedCountry
  /** Every country the store has an active Market for — what the picker shows. */
  availableCountries: LocalizedCountry[]
  /**
   * Currently-active language + every language the store has PUBLISHED. These
   * are STORE/dashboard data (the merchant's published locales), not a theme
   * config list — the theme only ships the translations. Optional so older live
   * payloads (countries only) still satisfy the type; the picker falls back to a
   * single default when absent.
   */
  language?: LocalizedLanguage
  availableLanguages?: LocalizedLanguage[]
}

const DataContext = createContext<DataApi | null>(null)

/**
 * Handles are Unicode now (a Thai title no longer collapses to "4" or ""), and
 * a theme reads the handle out of `location.pathname`, which hands it back
 * PERCENT-ENCODED — "เสื้อยืด" arrives as "%E0%B9%80…". Our indexes are keyed by
 * the real handle, so an exact lookup misses and the theme quietly renders a
 * fallback: nova's PDP showed a different product's data, and computeHead fell
 * back to the shop name, so every non-Latin product lost its SEO title.
 *
 * Fixing the themes is not enough — a marketplace theme ships its own copy of
 * the code and cannot be force-updated. Normalizing here reaches every theme,
 * old and new, on the next rebuild (theme-kit is part of the runtime's dist
 * fingerprint). A handle can't contain `%`, so this is a no-op for one that is
 * already decoded; malformed input falls back to the raw string.
 */
function decodeHandle(handle: string): string {
  if (!handle || !handle.includes('%')) return handle
  try {
    return decodeURIComponent(handle)
  } catch {
    return handle
  }
}


/** Wraps the app with a theme-provided data source (mock or live). */
export function DataProvider({ value, children }: { value: DataApi; children: ReactNode }): JSX.Element {
  return <DataContext.Provider value={value}>{children}</DataContext.Provider>
}

export function useData(): DataApi {
  const ctx = useContext(DataContext)
  if (!ctx) throw new Error('useData must be used within <DataProvider>')
  return ctx
}

/** Build an offline data source from fixture collections (theme passes its JSON). */
export function createMockData(collections: Collection[]): DataApi {
  // Flatten products from every collection once; subsequent lookups are O(1)
  // by handle. A product appearing in multiple collections returns the first
  // occurrence — matching the storefront's "canonical product page" semantics.
  //
  // Exception: the SAME product arrives in two shapes. Collection/top listings
  // come from the card fragment, which carries no `seo`; the current route's
  // product is fetched with `seo { title description keywords }` and appended
  // afterwards. First-wins therefore indexed the seo-less card and dropped the
  // detail copy, so computeHead() found no seo.title and fell back to
  // "<product> — <shop>", emitting no description at all. Let the record that
  // actually has SEO win, whatever order it arrives in.
  const productsByHandle = new Map<string, Product>()
  const allProducts: Product[] = []
  for (const c of collections) {
    for (const p of c.products) {
      const prev = productsByHandle.get(p.handle)
      if (!prev) {
        productsByHandle.set(p.handle, p)
        allProducts.push(p)
      } else if (!prev.seo && p.seo) {
        productsByHandle.set(p.handle, p)
        const i = allProducts.indexOf(prev)
        if (i !== -1) allProducts[i] = p
      }
    }
  }

  // ── Offline fixtures so EVERY commerce-standard object resolves in mock mode ──
  // The live source (createLiveData) serves these from the Storefront GraphQL
  // API; mock mode must mirror the same shapes so a developer can build header
  // menus, blog, search, customer + shop sections fully offline (no store).
  const mkItem = (id: string, title: string, url: string, type: MenuItemType = 'HTTP'): MenuItem =>
    ({ id, title, url, type, items: [] })
  const mkMenu = (handle: string, title: string, items: MenuItem[]): Menu =>
    ({ id: `mock/menu/${handle}`, handle, title, items })

  const mainMenu = mkMenu('main-menu', 'Main menu', [
    { ...mkItem('mm-shop', 'Shop', '/collections/all', 'COLLECTIONS'),
      // submenu: the store's collections, so the header dropdown is real data
      items: collections.slice(0, 6).map((c, i) => mkItem(`mm-shop-${i}`, c.title, `/collections/${c.handle}`, 'COLLECTION')) },
    mkItem('mm-collections', 'Collections', '/collections', 'CATALOG'),
    mkItem('mm-about', 'About', '/pages/about', 'PAGE'),
    mkItem('mm-journal', 'Journal', '/blogs/news', 'BLOG'),
  ])
  const menus = new Map<string, Menu>([
    ['main-menu', mainMenu],
    ['footer', mkMenu('footer', 'Footer', [
      mkItem('fm-privacy', 'Privacy policy', '/policies/privacy-policy', 'SHOP_POLICY'),
      mkItem('fm-contact', 'Contact', '/pages/contact', 'PAGE'),
    ])],
    ['footer-shop', mkMenu('footer-shop', 'Shop', [
      mkItem('fs-all', 'All products', '/collections/all'),
      mkItem('fs-new', 'New arrivals', '/collections/new'),
      mkItem('fs-sale', 'Sale', '/collections/sale'),
      mkItem('fs-gift', 'Gift cards', '/products/gift-card'),
    ])],
    ['footer-help', mkMenu('footer-help', 'Help', [
      mkItem('fh-contact', 'Contact', '/pages/contact'),
      mkItem('fh-ship', 'Shipping', '/pages/shipping'),
      mkItem('fh-returns', 'Returns', '/pages/returns'),
      mkItem('fh-faq', 'FAQ', '/pages/faq'),
    ])],
    ['footer-company', mkMenu('footer-company', 'Company', [
      mkItem('fc-about', 'About', '/pages/about'),
      mkItem('fc-journal', 'Journal', '/blogs/news'),
      mkItem('fc-sustain', 'Sustainability', '/pages/sustainability'),
      mkItem('fc-press', 'Press', '/pages/press'),
    ])],
  ])

  const articles: Article[] = [
    {
      id: 'mock/article/welcome',
      handle: 'welcome',
      title: 'Welcome to the shop',
      excerpt: 'A quick hello and what to expect.',
      contentHtml: '<p>Welcome — this is mock article content for local development.</p>',
      image: null,
      author: 'Studio',
      publishedAt: '2024-01-01T00:00:00.000Z',
      tags: ['news'],
      blogHandle: 'news',
    },
    {
      id: 'mock/article/behind-the-design',
      handle: 'behind-the-design',
      title: 'Behind the design',
      excerpt: 'How this starter theme is built.',
      contentHtml: '<p>Built with Tanqory theme-kit sections.</p>',
      image: null,
      author: 'Studio',
      publishedAt: '2024-01-02T00:00:00.000Z',
      tags: ['design'],
      blogHandle: 'news',
    },
  ]
  const blog: Blog = { id: 'mock/blog/news', handle: 'news', title: 'News', articles }

  const shop: Shop = {
    name: 'nova',
    description: 'A clean starter storefront powered by Tanqory.',
    brand: { logo: null, slogan: 'Modern essentials', shortDescription: 'Starter theme' },
    policies: {
      privacy: { handle: 'privacy-policy', title: 'Privacy policy', url: '/policies/privacy-policy', body: '<p>Mock privacy policy.</p>' },
      refund: { handle: 'refund-policy', title: 'Refund policy', url: '/policies/refund-policy', body: '<p>Mock refund policy.</p>' },
      termsOfService: { handle: 'terms-of-service', title: 'Terms of service', url: '/policies/terms-of-service', body: '<p>Mock terms of service.</p>' },
      shipping: { handle: 'shipping-policy', title: 'Shipping policy', url: '/policies/shipping-policy', body: '<p>Mock shipping policy.</p>' },
      subscription: null,
    },
    cookieBanner: { enabled: true, dataSharingTitle: 'Do not sell or share my personal information', dataSharingVisible: true },
  }

  const EMPTY_PI = { hasNextPage: false, hasPreviousPage: false, startCursor: null, endCursor: null }
  const match = (q: string) => {
    const needle = q.trim().toLowerCase()
    return needle ? allProducts.filter((p) => p.title.toLowerCase().includes(needle)) : []
  }

  return {
    collectionByHandle: (handle) =>
      collections.find((c) => c.handle === handle || c.handle === decodeHandle(handle)) ?? null,
    allCollections: () => collections,
    productByHandle: (handle) =>
      productsByHandle.get(handle) ?? productsByHandle.get(decodeHandle(handle)) ?? null,
    pageByHandle: () => null,
    // Localization mirrors what the store DASHBOARD (Markets) would publish —
    // NOT a theme config list. Countries carry their currency; languages are the
    // store's published locales. The live source fills this from store-api.
    localization: {
      country: { isoCode: 'TH', name: 'Thailand', currency: { isoCode: 'THB', symbol: '฿' }, market: null },
      availableCountries: [
        { isoCode: 'TH', name: 'Thailand', currency: { isoCode: 'THB', symbol: '฿' }, market: null },
        { isoCode: 'US', name: 'United States', currency: { isoCode: 'USD', symbol: '$' }, market: null },
        { isoCode: 'JP', name: 'Japan', currency: { isoCode: 'JPY', symbol: '¥' }, market: null },
        { isoCode: 'SG', name: 'Singapore', currency: { isoCode: 'SGD', symbol: 'S$' }, market: null },
        { isoCode: 'GB', name: 'United Kingdom', currency: { isoCode: 'GBP', symbol: '£' }, market: null },
      ],
      language: { isoCode: 'en', name: 'English' },
      availableLanguages: [
        { isoCode: 'en', name: 'English' },
        { isoCode: 'th', name: 'ไทย' },
        { isoCode: 'ja', name: '日本語' },
      ],
    },

    // ── commerce-standard extensions, served offline from the fixtures above so
    //    themes built against `useData()` behave the same in mock + live. ──
    shop,
    menu: (handle) => menus.get(handle) ?? menus.get(decodeHandle(handle)) ?? null,
    fetchMenu: async (handle) => menus.get(handle) ?? menus.get(decodeHandle(handle)) ?? null,
    notifyBackInStock: async () => 'subscribed',
    listMenus: async () =>
      Array.from(menus.values()).map((m) => ({
        handle: m.handle,
        title: m.title,
        itemsCount: m.items.length,
      })),
    pixels: async () => [],
    locations: async () => [],
    search: async (query, opts) => {
      const types = opts?.types ?? ['PRODUCT', 'PAGE', 'ARTICLE']
      const products = types.includes('PRODUCT') ? match(query) : []
      const arts = types.includes('ARTICLE')
        ? articles.filter((a) => a.title.toLowerCase().includes(query.trim().toLowerCase()))
        : []
      return { totalCount: products.length + arts.length, products, pages: [], articles: arts, filters: [], pageInfo: EMPTY_PI }
    },
    predictiveSearch: async (query, opts) => {
      const products = match(query).slice(0, opts?.limit ?? 4)
      return {
        queries: products.slice(0, 3).map((p) => p.title),
        products,
        collections: collections
          .filter((c) => c.title.toLowerCase().includes(query.trim().toLowerCase()))
          .slice(0, 3)
          .map((c) => ({ handle: c.handle, title: c.title, image: null })),
        pages: [],
        articles: [],
      }
    },
    collectionProducts: async (handle, opts) => {
      const c = collections.find((x) => x.handle === handle)
      return { products: (c?.products ?? []).slice(0, opts?.first ?? 24), filters: [], pageInfo: EMPTY_PI }
    },
    productRecommendations: async (productId) => allProducts.filter((p) => p.id !== productId).slice(0, 4),
    blogByHandle: async (handle) =>
      handle === blog.handle || decodeHandle(handle) === blog.handle ? blog : null,
    articleByHandle: async (blogHandle, articleHandle) =>
      blogHandle === blog.handle || decodeHandle(blogHandle) === blog.handle
        ? articles.find(
            (a) => a.handle === articleHandle || a.handle === decodeHandle(articleHandle),
          ) ?? null
        : null,
    metaobject: async () => null,
    metaobjects: async () => [],
    customer: {
      login: async () => ({ token: null, expiresAt: null, errors: ['Customer accounts need live data (mock mode).'] }),
      logout: async () => {},
      renew: async () => ({ token: null, expiresAt: null, errors: ['Customer accounts need live data (mock mode).'] }),
      register: async () => ({ ok: false, errors: ['Customer accounts need live data (mock mode).'] }),
      get: async () => null,
      orders: async () => [],
      paymentMethods: async () => [],
      orderByLookup: async () => null,
      createAddress: async () => ({ ok: false, errors: ['mock mode'] }),
      updateAddress: async () => ({ ok: false, errors: ['mock mode'] }),
      deleteAddress: async () => ({ ok: false, errors: ['mock mode'] }),
      setDefaultAddress: async () => ({ ok: false, errors: ['mock mode'] }),
    },
  }
}

/**
 * Live data source backed by the Tanqory Storefront GraphQL API.
 *
 *   const data = await createLiveData({
 *     endpoint: 'https://api-do-sgp1.tanqory.com',
 *     storeId:  '<store-uuid>',
 *     token:    '<publishable-storefront-token>',
 *     prefetch: { collectionLimit: 20, productLimitPerCollection: 24 },
 *   })
 *
 * Returns the same `DataApi` shape as `createMockData` (sync read methods)
 * by pre-fetching collections + their products at boot and serving every
 * subsequent lookup from an in-memory cache. The trade-off: a single GraphQL
 * round-trip at boot, then zero network on render — exactly what the SSG
 * step + first hydration need.
 *
 * Per-handle pages (e.g. /products/<handle>) that miss the prefetch can
 * still be fetched lazily via `dataApi.refresh()` (TODO) — for now, raise
 * `prefetch.productLimitPerCollection` to cover the catalogue size.
 */
export interface LiveDataOptions {
  /** Base URL of the store-api (e.g. https://api-do-sgp1.tanqory.com). */
  endpoint: string
  /** Store UUID (the `:storeId` path param). */
  storeId: string
  /** Publishable storefront token — passed as `x-publishable-key`. */
  token?: string
  /**
   * ISO 3166 alpha-2 (e.g. "TH", "SG", "US"). When set, the backend resolves
   * the matching Market for this country, applies its currency + exchange
   * rate, and returns Money fields in that currency. Falls back to store
   * base currency if no Market matches the country.
   */
  country?: string
  /**
   * Content language (BCP-47-ish, e.g. "th", "zh-TW"). When set, the backend
   * overlays the merchant's translations for this locale onto product/
   * collection/page content (X-Tanqory-Lang). Falls back to default-language
   * content when a resource has no translation. Independent of `country`.
   */
  locale?: string
  /** Optional fetch override (testing / SSR). */
  fetcher?: typeof fetch
  /**
   * Page handle (from `/pages/<handle>`) to fetch alongside the homepage
   * bootstrap. The theme entry resolves the current URL once at boot and
   * passes the matching handle here so the PageBody section can read
   * `dataApi.pageByHandle(handle)` synchronously during hydration.
   */
  pageHandle?: string
  /** Handle of the product/collection detail route being loaded, so its
   *  template variant (templateSuffix) is prefetched into the bootstrap. */
  productHandle?: string
  collectionHandle?: string
  /** Tune how much to load at boot. */
  prefetch?: {
    /** Max collections to fetch (default 20). */
    collectionLimit?: number
    /** Max products to inline under each collection (default 24). */
    productLimitPerCollection?: number
    /** Max products to fetch at the top level (default 24) — these power the
     *  synthesized `featured` / `all` virtual collections when the store has
     *  no real collections yet. */
    topProductLimit?: number
  }
}

// Bootstrap fetches BOTH collections AND a flat product list. The flat list
// powers a synthesized "featured" virtual collection when the store has live
// products but the merchant hasn't built a real collection yet — without it,
// a brand-new merchant's first Active product would never appear on the
// storefront (collections-only bootstrap = empty homepage).
// Shared product-card selection for every grid/list. Scalars + featuredImage +
// price + compareAtPrice (sale badge) + facets (vendor/type/tags) — all cheap
// (cost 0–1). Heavy fields (gallery, variants, metafields, sellingPlans,
// storeAvailability) stay on the PDP query only.
const PRODUCT_CARD_FIELDS = /* GraphQL */ `
  fragment ProductCardBoot on Product {
    id
    handle
    title
    availableForSale
    vendor
    productType
    tags
    publishedAt
    createdAt
    onlineStoreUrl
    featuredImage { url altText width height }
    priceRange { minVariantPrice { amount currencyCode } }
    compareAtPriceRange { maxVariantPrice { amount currencyCode } }
    firstAvailableVariant { id }
    templateSuffix
  }
`

const COLLECTIONS_QUERY = /* GraphQL */ `
  ${BOOTSTRAP_SHOP_MENU_FRAGMENTS}
  ${PRODUCT_CARD_FIELDS}
  query NovaBootstrap($first: Int!, $productFirst: Int!, $productsTop: Int!, $pageHandle: String, $productHandle: String, $collectionHandle: String) {
    ${BOOTSTRAP_SHOP_MENU}
    page(handle: $pageHandle) {
      handle
      title
      body
      bodySummary
      author
      publishedAt
      updatedAt
      templateSuffix
      seo { title description keywords }
    }
    product(handle: $productHandle) { ...ProductCardBoot seo { title description keywords } }
    collection(handle: $collectionHandle) {
      id
      handle
      title
      description
      image { url altText width height }
      productsCount { count }
      templateSuffix
      seo { title description keywords }
    }
    collections(first: $first) {
      edges {
        node {
          id
          handle
          title
          image { url altText width height }
          productsCount { count }
          templateSuffix
          products(first: $productFirst) {
            edges {
              node { ...ProductCardBoot }
            }
          }
        }
      }
    }
    products(first: $productsTop) {
      edges {
        node { ...ProductCardBoot }
      }
    }
    localization {
      country {
        isoCode
        name
        currency { isoCode name symbol }
        market { id handle name }
      }
      availableCountries {
        isoCode
        name
        currency { isoCode name symbol }
        market { id handle name }
      }
      language { isoCode name }
      availableLanguages { isoCode name }
    }
  }
`

// Reduced bootstrap. `localization` and the nested `collections.products` are
// non-nullable in the storefront schema, so if a cell errors on either (e.g. an
// older / partially-broken store-api) GraphQL nulls the ENTIRE response and the
// whole boot falls back to mock. This variant drops both optional pieces so the
// essentials — shop, menus, page, collections, top products — still load.
const SAFE_COLLECTIONS_QUERY = /* GraphQL */ `
  ${BOOTSTRAP_SHOP_MENU_FRAGMENTS}
  ${PRODUCT_CARD_FIELDS}
  query NovaBootstrapSafe($first: Int!, $productsTop: Int!, $pageHandle: String, $productHandle: String, $collectionHandle: String) {
    ${BOOTSTRAP_SHOP_MENU}
    page(handle: $pageHandle) {
      handle
      title
      body
      bodySummary
      author
      publishedAt
      updatedAt
      templateSuffix
      seo { title description keywords }
    }
    product(handle: $productHandle) { ...ProductCardBoot seo { title description keywords } }
    collection(handle: $collectionHandle) {
      id
      handle
      title
      description
      image { url altText width height }
      productsCount { count }
      templateSuffix
      seo { title description keywords }
    }
    collections(first: $first) {
      edges {
        node {
          id
          handle
          title
          image { url altText width height }
          productsCount { count }
          templateSuffix
        }
      }
    }
    products(first: $productsTop) {
      edges {
        node { ...ProductCardBoot }
      }
    }
  }
`

interface GqlMoney { amount: string; currencyCode: string }
type GqlImg = { url?: string; altText?: string | null; width?: number | null; height?: number | null } | null | undefined
interface GqlProductNode {
  id: string
  handle: string
  title: string
  availableForSale?: boolean
  vendor?: string | null
  productType?: string | null
  tags?: string[]
  publishedAt?: string | null
  createdAt?: string | null
  onlineStoreUrl?: string | null
  featuredImage?: GqlImg
  priceRange?: { minVariantPrice?: GqlMoney }
  compareAtPriceRange?: { maxVariantPrice?: GqlMoney } | null
  firstAvailableVariant?: { id: string } | null
  templateSuffix?: string | null
  seo?: { title?: string | null; description?: string | null; keywords?: string[] | null } | null
}
interface GqlCollectionNode {
  id: string
  handle: string
  title: string
  description?: string | null
  image?: GqlImg
  productsCount?: { count: number } | null
  products: { edges: Array<{ node: GqlProductNode }> }
  templateSuffix?: string | null
  seo?: { title?: string | null; description?: string | null; keywords?: string[] | null } | null
}
interface GqlPageNode {
  handle: string
  title: string
  body: string
  bodySummary?: string | null
  author?: string | null
  publishedAt?: string | null
  updatedAt?: string | null
  templateSuffix?: string | null
  seo?: { title?: string | null; description?: string | null; keywords?: string[] | null } | null
}
interface BootstrapData {
  collections: { edges: Array<{ node: GqlCollectionNode }> }
  products: { edges: Array<{ node: GqlProductNode }> }
  page: GqlPageNode | null
  product: GqlProductNode | null
  collection: GqlCollectionNode | null
  localization: {
    country: LocalizedCountry
    availableCountries: LocalizedCountry[]
    language?: LocalizedLanguage
    availableLanguages?: LocalizedLanguage[]
  }
  /** Shop info + the two standard menus — parsed by readBootstrapShopMenu. */
  shop?: unknown
  mainMenu?: unknown
  footerMenu?: unknown
}

function normalizeImage(img: GqlImg): ImageRef | null {
  if (!img || !img.url) return null
  const width = img.width ?? null
  const height = img.height ?? null
  return {
    url: img.url,
    ...(img.altText ? { altText: img.altText } : {}),
    ...(width != null ? { width } : {}),
    ...(height != null ? { height } : {}),
    ...(width && height ? { aspectRatio: width / height } : {}),
  }
}

function normalizeProduct(p: GqlProductNode): Product {
  const price = p.priceRange?.minVariantPrice ?? { amount: '0', currencyCode: 'USD' }
  // Only surface compareAtPrice when it's a REAL sale (was > now) — the backend
  // returns the range even when equal, which would render a pointless strikethrough.
  const compareAt = p.compareAtPriceRange?.maxVariantPrice
  const onSale = compareAt && Number(compareAt.amount) > Number(price.amount)
  return {
    id: p.id,
    handle: p.handle,
    title: p.title,
    price,
    featuredImage: normalizeImage(p.featuredImage),
    ...(onSale ? { compareAtPrice: compareAt } : {}),
    ...(p.vendor ? { vendor: p.vendor } : {}),
    ...(p.productType ? { productType: p.productType } : {}),
    ...(p.tags?.length ? { tags: p.tags } : {}),
    ...(p.publishedAt ? { publishedAt: p.publishedAt } : {}),
    ...(p.createdAt ? { createdAt: p.createdAt } : {}),
    ...(p.onlineStoreUrl ? { onlineStoreUrl: p.onlineStoreUrl } : {}),
    ...(p.firstAvailableVariant?.id ? { variantId: p.firstAvailableVariant.id } : {}),
    ...(typeof p.availableForSale === 'boolean' ? { availableForSale: p.availableForSale } : {}),
    ...(p.templateSuffix ? { templateSuffix: p.templateSuffix } : {}),
    ...(p.seo ? { seo: { title: p.seo.title ?? null, description: p.seo.description ?? null, keywords: p.seo.keywords ?? [] } } : {}),
  }
}

function normalizeCollection(c: GqlCollectionNode): Collection {
  return {
    ...(c.id ? { id: c.id } : {}),
    handle: c.handle,
    title: c.title,
    ...(c.description ? { description: c.description } : {}),
    image: normalizeImage(c.image),
    ...(typeof c.productsCount?.count === 'number'
      ? { productsCount: c.productsCount.count }
      : {}),
    // Nested products are optional — the reduced bootstrap (used when a cell
    // errors on the nested products field) omits them.
    ...(c.templateSuffix ? { templateSuffix: c.templateSuffix } : {}),
    ...(c.seo ? { seo: { title: c.seo.title ?? null, description: c.seo.description ?? null, keywords: c.seo.keywords ?? [] } } : {}),
    products: (c.products?.edges ?? []).map((e) => normalizeProduct(e.node)),
  }
}

// Single-product fetch (PDP) — full options + variants for the variant picker.
// Kept out of the bootstrap (variants(first:100) @cost=100/product would blow
// the cost budget) and fetched lazily only on the product page.
const PRODUCT_QUERY = /* GraphQL */ `
  query NovaProduct($handle: String!, $identifiers: [MetafieldIdentifier!]!) {
    product(handle: $handle) {
      id
      handle
      title
      description
      descriptionHtml
      vendor
      productType
      tags
      availableForSale
      isGiftCard
      totalInventory
      featuredImage { url altText width height }
      images(first: 20) { nodes { url altText width height } }
      media(first: 20) {
        nodes {
          __typename
          ... on MediaImage { id alt image { url altText width height } }
          ... on Video { id alt previewImage { url altText width height } sources { url mimeType format } }
          ... on Model3d { id alt previewImage { url altText width height } sources { url mimeType format } }
          ... on ExternalVideo { id alt host embedUrl previewImage { url altText width height } }
        }
      }
      priceRange { minVariantPrice { amount currencyCode } }
      compareAtPriceRange { maxVariantPrice { amount currencyCode } }
      options(first: 10) { name values }
      collections(first: 10) { nodes { handle title } }
      seo { title description keywords }
      templateSuffix
      variants(first: 50) {
        nodes {
          id
          title
          availableForSale
          sku
          barcode
          inventoryQuantity
          inventoryPolicy
          requiresShipping
          taxable
          weight { value unit }
          price { amount currencyCode }
          compareAtPrice { amount currencyCode }
          image { url altText width height }
          selectedOptions { name value }
          unitPrice { amount currencyCode }
          unitPriceMeasurement { measuredType quantityValue quantityUnit referenceValue referenceUnit }
          quantityRule { minimum maximum increment }
          storeAvailability(first: 5) {
            nodes { available quantityAvailable pickUpTime location { id name } }
          }
        }
      }
      sellingPlanGroups(first: 5) {
        nodes {
          name
          appName
          options { name values }
          sellingPlans(first: 10) {
            nodes { id name description recurringDeliveries options { name value } }
          }
        }
      }
      metafields(identifiers: $identifiers) { namespace key value }
      firstAvailableVariant { id }
    }
  }
`

interface GqlVariantNode {
  id: string
  title: string
  availableForSale: boolean
  sku?: string | null
  barcode?: string | null
  inventoryQuantity?: number | null
  inventoryPolicy?: 'DENY' | 'CONTINUE' | null
  requiresShipping?: boolean | null
  taxable?: boolean | null
  weight?: { value: number; unit: string } | null
  price?: GqlMoney
  compareAtPrice?: GqlMoney | null
  image?: GqlImg
  selectedOptions?: Array<{ name: string; value: string }>
  unitPrice?: GqlMoney | null
  unitPriceMeasurement?: UnitPriceMeasurement | null
  quantityRule?: QuantityRule
  storeAvailability?: {
    nodes: Array<{
      available: boolean
      quantityAvailable: number
      pickUpTime?: string | null
      location: { id: string; name: string }
    }>
  }
}
interface GqlSellingPlanGroupNode {
  name: string
  appName?: string | null
  options?: Array<{ name: string; values: string[] }>
  sellingPlans?: { nodes: Array<{
    id: string
    name: string
    description?: string | null
    recurringDeliveries: boolean
    options?: Array<{ name: string; value: string }>
  }> }
}
interface GqlMediaNode {
  __typename: 'MediaImage' | 'Video' | 'Model3d' | 'ExternalVideo'
  id: string
  alt?: string | null
  image?: GqlImg
  previewImage?: GqlImg
  sources?: Array<{ url: string; mimeType?: string | null; format?: string | null }>
  host?: string | null
  embedUrl?: string | null
}
interface GqlProductDetailNode extends GqlProductNode {
  description?: string | null
  descriptionHtml?: string | null
  isGiftCard?: boolean | null
  totalInventory?: number | null
  images?: { nodes: GqlImg[] }
  media?: { nodes: GqlMediaNode[] }
  options?: Array<{ name: string; values: string[] }>
  seo?: { title?: string | null; description?: string | null; keywords?: string[] | null } | null
  variants?: { nodes: GqlVariantNode[] }
  sellingPlanGroups?: { nodes: GqlSellingPlanGroupNode[] }
  collections?: { nodes: Array<{ handle: string; title: string }> }
  metafields?: Array<{ namespace: string; key: string; value: string | null } | null>
}

function normalizeProductDetail(p: GqlProductDetailNode): Product {
  const base = normalizeProduct(p)
  const variants: ProductVariant[] = (p.variants?.nodes ?? []).map((v) => ({
    id: v.id,
    title: v.title,
    price: v.price ?? base.price,
    ...(v.compareAtPrice && Number(v.compareAtPrice.amount) > Number((v.price ?? base.price).amount)
      ? { compareAtPrice: v.compareAtPrice }
      : {}),
    availableForSale: v.availableForSale,
    ...(v.sku ? { sku: v.sku } : {}),
    ...(v.barcode ? { barcode: v.barcode } : {}),
    ...(typeof v.inventoryQuantity === 'number' ? { inventoryQuantity: v.inventoryQuantity } : {}),
    ...(v.inventoryPolicy ? { inventoryPolicy: v.inventoryPolicy } : {}),
    ...(typeof v.requiresShipping === 'boolean' ? { requiresShipping: v.requiresShipping } : {}),
    ...(typeof v.taxable === 'boolean' ? { taxable: v.taxable } : {}),
    ...(v.weight ? { weight: v.weight } : {}),
    ...(v.selectedOptions?.length ? { selectedOptions: v.selectedOptions } : {}),
    image: normalizeImage(v.image),
    ...(v.unitPrice ? { unitPrice: v.unitPrice } : {}),
    ...(v.unitPriceMeasurement ? { unitPriceMeasurement: v.unitPriceMeasurement } : {}),
    ...(v.quantityRule ? { quantityRule: v.quantityRule } : {}),
    ...(v.storeAvailability?.nodes?.length
      ? {
          storeAvailability: v.storeAvailability.nodes.map((s) => ({
            available: s.available,
            quantityAvailable: s.quantityAvailable,
            pickUpTime: s.pickUpTime ?? null,
            location: s.location,
          })),
        }
      : {}),
  }))
  const images: ImageRef[] = (p.images?.nodes ?? [])
    .map(normalizeImage)
    .filter((i): i is ImageRef => i !== null)
  const TYPE_MAP: Record<GqlMediaNode['__typename'], ProductMedia['type']> = {
    MediaImage: 'image',
    Video: 'video',
    Model3d: 'model_3d',
    ExternalVideo: 'external_video',
  }
  const media: ProductMedia[] = (p.media?.nodes ?? []).map((m) => ({
    id: m.id,
    type: TYPE_MAP[m.__typename] ?? 'image',
    alt: m.alt ?? null,
    ...(m.image ? { image: normalizeImage(m.image) } : {}),
    ...(m.previewImage ? { previewImage: normalizeImage(m.previewImage) } : {}),
    ...(m.sources?.length ? { sources: m.sources } : {}),
    ...(m.host ? { host: m.host } : {}),
    ...(m.embedUrl ? { embedUrl: m.embedUrl } : {}),
  }))
  const sellingPlanGroups: SellingPlanGroup[] = (p.sellingPlanGroups?.nodes ?? []).map((g) => ({
    name: g.name,
    appName: g.appName ?? null,
    options: g.options ?? [],
    sellingPlans: (g.sellingPlans?.nodes ?? []).map((sp) => ({
      id: sp.id,
      name: sp.name,
      description: sp.description ?? null,
      recurringDeliveries: sp.recurringDeliveries,
      options: sp.options ?? [],
    })),
  }))
  const metafields: Record<string, string | null> = {}
  for (const m of p.metafields ?? []) {
    if (m) metafields[`${m.namespace}.${m.key}`] = m.value
  }
  return {
    ...base,
    ...(p.description ? { description: p.description } : {}),
    ...(p.descriptionHtml ? { descriptionHtml: p.descriptionHtml } : {}),
    ...(typeof p.isGiftCard === 'boolean' ? { isGiftCard: p.isGiftCard } : {}),
    ...(typeof p.totalInventory === 'number' ? { totalInventory: p.totalInventory } : {}),
    ...(images.length ? { images } : {}),
    ...(media.length ? { media } : {}),
    ...(p.options?.length ? { options: p.options } : {}),
    ...(p.seo ? { seo: { title: p.seo.title ?? null, description: p.seo.description ?? null, keywords: p.seo.keywords ?? [] } } : {}),
    ...(variants.length ? { variants } : {}),
    ...(sellingPlanGroups.length ? { sellingPlanGroups } : {}),
    ...(p.collections?.nodes?.length
      ? { collections: p.collections.nodes.map((c: { handle: string; title: string }) => ({ handle: c.handle, title: c.title })) }
      : {}),
    ...(Object.keys(metafields).length ? { metafields } : {}),
  }
}

type GraphqlRequester = <T = unknown>(
  query: string,
  variables?: Record<string, unknown>,
) => Promise<T>

/**
 * One request path for the bootstrap AND every post-boot interaction (the
 * cart's mutations, the PDP's lazy product fetch) — same endpoint, same
 * publishable-key + country headers, same error handling.
 */
function makeGraphqlRequest(opts: LiveDataOptions): GraphqlRequester {
  const maybeFetch = opts.fetcher ?? (globalThis.fetch as typeof fetch | undefined)
  if (!maybeFetch) {
    throw new Error('[theme-kit] createLiveData: fetch is not available in this environment')
  }
  // Capture into a definitely-defined const so the narrowing survives into the
  // graphqlRequest closure below (TS drops `!undefined` narrowing across scopes).
  const f: typeof fetch = maybeFetch
  const endpoint = opts.endpoint.replace(/\/$/, '')
  const url = `${endpoint}/api/v1/stores/${encodeURIComponent(opts.storeId)}/graphql`
  return async function graphqlRequest<T = unknown>(
    query: string,
    variables?: Record<string, unknown>,
  ): Promise<T> {
    const res = await f(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(opts.token ? { 'x-publishable-key': opts.token } : {}),
        // X-Tanqory-Country triggers backend Market resolution; if the store
        // has an active Market with this country, Money.currencyCode + amount
        // come back already-converted in the target currency.
        ...(opts.country ? { 'x-tanqory-country': opts.country.toUpperCase() } : {}),
        // X-Tanqory-Lang triggers translation overlay: product/collection/page
        // content comes back in this locale where the merchant has translations.
        ...(opts.locale ? { 'x-tanqory-lang': opts.locale.toLowerCase() } : {}),
      },
      body: JSON.stringify({ query, variables }),
    })
    if (!res.ok) {
      throw new Error(
        `[theme-kit] GraphQL HTTP ${res.status} from ${url} — ${await res.text().catch(() => '')}`,
      )
    }
    const json = (await res.json()) as { data?: T; errors?: Array<{ message: string }> }
    if (json.errors?.length) {
      const msg = json.errors.map((e) => e.message).join('; ')
      // Partial success: GraphQL nulls the failed field(s) but still returns the
      // rest of `data`. Only fail hard when NOTHING came back — otherwise log and
      // use what we got, so one flaky field (e.g. `localization` on an older
      // cell) can't blank the entire storefront / fall the whole boot to mock.
      if (json.data == null) {
        throw new Error(`[theme-kit] GraphQL errors: ${msg}`)
      }
      if (typeof console !== 'undefined') {
        // eslint-disable-next-line no-console
        console.warn(`[theme-kit] GraphQL partial errors (using partial data): ${msg}`)
      }
    }
    return json.data as T
  }
}

export async function createLiveData(opts: LiveDataOptions): Promise<DataApi> {
  const graphqlRequest = makeGraphqlRequest(opts)
  // Defaults stay under store-api's GraphQL cost budget (1000). Cost formula
  // for the bootstrap query: 3*N + 4*N*M + 4*T  (N = collectionLimit,
  // M = productLimitPerCollection, T = topProductLimit). 10 + 10 + 24 = 526
  // — plenty of headroom for a homepage prefetch. Bump in opts.prefetch only
  // if you're sure the store's cost-budget limit is higher than 1000.
  const collectionLimit = opts.prefetch?.collectionLimit ?? 10
  const productLimitPerCollection = opts.prefetch?.productLimitPerCollection ?? 10
  const topProductLimit = opts.prefetch?.topProductLimit ?? 24

  let boot: BootstrapData | undefined
  try {
    boot = await graphqlRequest<BootstrapData>(COLLECTIONS_QUERY, {
      first: collectionLimit,
      productFirst: productLimitPerCollection,
      productsTop: topProductLimit,
      pageHandle: opts.pageHandle ?? null,
      productHandle: opts.productHandle ?? null,
      collectionHandle: opts.collectionHandle ?? null,
    })
  } catch (err) {
    // The full query nulls out entirely if the cell errors on an optional field
    // (localization, nested collection products). Retry once with the reduced
    // query so the storefront still renders real shop/menus/collections/products
    // instead of falling all the way back to mock.
    if (typeof console !== 'undefined') {
      // eslint-disable-next-line no-console
      console.warn(
        `[theme-kit] full bootstrap failed, retrying without optional fields: ${(err as Error).message}`,
      )
    }
    boot = await graphqlRequest<BootstrapData>(SAFE_COLLECTIONS_QUERY, {
      first: collectionLimit,
      productsTop: topProductLimit,
      pageHandle: opts.pageHandle ?? null,
      productHandle: opts.productHandle ?? null,
      collectionHandle: opts.collectionHandle ?? null,
    })
  }
  return buildLiveData(boot, graphqlRequest, opts)
}

/**
 * Build a live DataApi SYNCHRONOUSLY from a previously-fetched bootstrap
 * payload (`data.getSnapshot()`, serialized into the SSG HTML as
 * `window.__TQ_STATE__` by the prerender step). This is what makes hydration
 * deterministic: the client's first render uses the EXACT data the server
 * rendered with — no network round-trip, no drift, no mock fallback — and
 * mount()'s `revalidate` swaps in fresh data after hydration (SWR).
 */
export function createLiveDataFromSnapshot(snapshot: unknown, opts: LiveDataOptions): DataApi {
  const graphqlRequest = makeGraphqlRequest(opts)
  return buildLiveData((snapshot ?? undefined) as BootstrapData | undefined, graphqlRequest, opts)
}

/** Assemble the DataApi from a bootstrap payload + a live requester. Shared by
 *  createLiveData (fetches the bootstrap) and createLiveDataFromSnapshot
 *  (reuses the serialized one) so both paths render identically. */
function buildLiveData(
  boot: BootstrapData | undefined,
  graphqlRequest: GraphqlRequester,
  opts: LiveDataOptions,
): DataApi {
  const productLimitPerCollection = opts.prefetch?.productLimitPerCollection ?? 10
  const collections: Collection[] = (boot?.collections.edges ?? []).map((e) =>
    normalizeCollection(e.node),
  )
  const topProducts: Product[] = (boot?.products.edges ?? []).map((e) =>
    normalizeProduct(e.node),
  )
  // Index the current detail route's product/collection (prefetched by handle)
  // so productByHandle/collectionByHandle resolve it even when it isn't in the
  // top set — this is what lets the theme pick its templateSuffix variant.
  if (boot?.product) topProducts.push(normalizeProduct(boot.product))

  // Themes commonly reference `featured` / `frontpage` / `all` as their homepage
  // collection. Synthesize one when the merchant hasn't created a real
  // collection yet but DOES have Active products — otherwise their first
  // product would never appear on the storefront. Also ensure `allProducts`
  // is wired even when no products exist outside of collections.
  if (boot?.collection && !collections.some((c) => c.handle === boot!.collection!.handle)) {
    collections.push(normalizeCollection(boot.collection))
  }
  if (topProducts.length > 0 && !collections.some((c) => c.handle === 'featured')) {
    collections.unshift({
      handle: 'featured',
      title: 'Featured',
      image: topProducts[0].featuredImage ?? null,
      products: topProducts.slice(0, productLimitPerCollection),
    })
  }
  // Mirror as `all` too — many themes (incl. our nova templates) reference it.
  if (topProducts.length > 0 && !collections.some((c) => c.handle === 'all')) {
    collections.push({
      handle: 'all',
      title: 'All products',
      image: topProducts[0].featuredImage ?? null,
      products: topProducts,
    })
  }

  // Reuse the createMockData factory — same cache shape, same DataApi.
  // It also indexes products by handle so productByHandle() works even for
  // products fetched only via the top-level products() query.
  const data = createMockData(collections)
  const pageNode = boot?.page
  if (pageNode) {
    // Cache only the page that matched the URL. pageByHandle returns null
    // for everything else — themes should only call it for the current page.
    const page: Page = {
      handle: pageNode.handle,
      title: pageNode.title,
      body: pageNode.body,
      ...(pageNode.bodySummary ? { bodySummary: pageNode.bodySummary } : {}),
      ...(pageNode.author ? { author: pageNode.author } : {}),
      ...(pageNode.publishedAt ? { publishedAt: pageNode.publishedAt } : {}),
      ...(pageNode.updatedAt ? { updatedAt: pageNode.updatedAt } : {}),
      ...(pageNode.templateSuffix ? { templateSuffix: pageNode.templateSuffix } : {}),
    }
    data.pageByHandle = (handle) =>
      handle === page.handle || decodeHandle(handle) === page.handle ? page : null
  }
  const loc = boot?.localization
  if (loc) {
    // Only expose the localization payload when the store actually has Markets
    // (availableCountries non-empty). With zero markets, leave `null` so the
    // theme's country picker hides itself instead of showing a hardcoded list
    // that doesn't match what the merchant has configured.
    data.localization =
      loc.availableCountries.length > 0
        ? {
            country: loc.country,
            availableCountries: loc.availableCountries,
            // Published languages come straight from the store (StoreLanguage →
            // SDL `availableLanguages`); the theme just renders the picker.
            language: loc.language,
            availableLanguages: loc.availableLanguages,
          }
        : null
  }

  // Post-boot capabilities: the raw GraphQL escape hatch (cart mutations live
  // on top of this) and an on-demand single-product fetch (PDP variant picker).
  data.graphql = graphqlRequest
  data.fetchProduct = async (
    handle: string,
    fpOpts?: { metafields?: Array<{ namespace: string; key: string }> },
  ): Promise<Product | null> => {
    // Never reject: a failed detail fetch (cost budget, cold cell, network)
    // must degrade to the prefetched card data, not crash the product page
    // with an unhandled rejection mid-hydration.
    try {
      const res = await graphqlRequest<{ product: GqlProductDetailNode | null }>(PRODUCT_QUERY, {
        handle,
        identifiers: fpOpts?.metafields ?? [],
      })
      return res?.product ? normalizeProductDetail(res.product) : null
    } catch (err) {
      if (typeof console !== 'undefined') {
        // eslint-disable-next-line no-console
        console.warn(`[theme-kit] fetchProduct(${handle}) failed: ${(err as Error).message}`)
      }
      return null
    }
  }

  // Dynamic-source metafields for the shop + a collection. Both query the
  // storefront's `metafields(identifiers)` (Shop/Collection both expose it) and
  // flatten to a "namespace.key" → value map the resolver reads.
  type GqlMf = { namespace: string; key: string; value: string | null } | null
  const toMfMap = (arr: GqlMf[] | undefined): Record<string, string | null> => {
    const out: Record<string, string | null> = {}
    for (const m of arr ?? []) if (m) out[`${m.namespace}.${m.key}`] = m.value
    return out
  }
  data.fetchShopMetafields = async (identifiers) => {
    if (!identifiers.length) return {}
    const res = await graphqlRequest<{ shop: { metafields: GqlMf[] } | null }>(
      `query NovaShopMetafields($identifiers: [MetafieldIdentifier!]!) {
        shop { metafields(identifiers: $identifiers) { namespace key value } }
      }`,
      { identifiers },
    )
    return toMfMap(res?.shop?.metafields)
  }
  data.fetchCollectionMetafields = async (handle, identifiers) => {
    if (!identifiers.length || !handle) return {}
    const res = await graphqlRequest<{ collection: { metafields: GqlMf[] } | null }>(
      `query NovaCollectionMetafields($handle: String!, $identifiers: [MetafieldIdentifier!]!) {
        collection(handle: $handle) { metafields(identifiers: $identifiers) { namespace key value } }
      }`,
      { handle, identifiers },
    )
    return toMfMap(res?.collection?.metafields)
  }

  // ─── commerce-standard storefront extensions ───────────────────
  // Shop info + the two standard menus came back in the bootstrap → expose
  // them synchronously (the layout's header/footer render at hydration).
  const { shop, menus } = readBootstrapShopMenu(boot)
  data.shop = shop
  data.menu = (handle: string) => menus.get(handle) ?? menus.get(decodeHandle(handle)) ?? null
  // The rest (search, blog, recommendations, metaobjects, customer account)
  // are lazy — attach them on the same requester. fetchMenu shares `menus` so
  // a later fetch warms the same cache the sync menu() reads.
  Object.assign(
    data,
    createStorefrontMethods(graphqlRequest, { normalizeProduct }, menus),
  )
  // List every store menu (Dashboard → Navigation) for the editor's link_list
  // picker — the storefront `menus` query (id/handle/title/itemsCount).
  data.listMenus = async () => {
    const res = await graphqlRequest<{
      menus: Array<{ handle: string; title: string; itemsCount: number }>
    }>(`query NovaMenus { menus { handle title itemsCount } }`)
    return res?.menus ?? []
  }
  data.notifyBackInStock = async (input) => {
    const f: typeof fetch | undefined = opts.fetcher ?? (globalThis.fetch as typeof fetch | undefined)
    if (!f) throw new Error('[theme-kit] notifyBackInStock: fetch is not available')
    const res = await f(
      `${opts.endpoint.replace(/\/$/, '')}/api/v1/stores/${encodeURIComponent(opts.storeId)}/storefront/back-in-stock`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(opts.token ? { 'x-publishable-key': opts.token } : {}),
        },
        body: JSON.stringify({
          // store-api wants the bare UUID; tolerate a `gid://…/<uuid>` form
          variantId: input.variantId.split('/').pop(),
          email: input.email,
          ...(input.locale ? { locale: input.locale } : {}),
          ...(input.country ? { country: input.country.toUpperCase() } : {}),
        }),
      },
    )
    if (!res.ok) throw new Error(`[theme-kit] notify-me HTTP ${res.status}`)
    const json = (await res.json().catch(() => ({}))) as { status?: string }
    return json.status === 'available' ? 'available' : 'subscribed'
  }
  data.pixels = async () => {
    const res = await graphqlRequest<{
      customPixels: Array<{
        id: string
        name: string
        provider: string | null
        providerPixelId: string | null
        code: string | null
      }>
    }>(`query NovaPixels { customPixels { id name provider providerPixelId code } }`)
    return res?.customPixels ?? []
  }
  data.locations = async () => {
    const res = await graphqlRequest<{
      locations: Array<{
        id: string
        name: string
        code: string | null
        address: {
          country: string | null
          address: string | null
          city: string | null
          province: string | null
          postalCode: string | null
          phone: string | null
        } | null
      }>
    }>(
      `query NovaLocations { locations { id name code address { country address city province postalCode phone } } }`,
    )
    return res?.locations ?? []
  }
  // The raw serializable bootstrap this DataApi was built from. entry-server
  // embeds it into the SSG HTML (window.__TQ_STATE__) so the client can
  // rebuild the SAME DataApi synchronously at hydration — see
  // createLiveDataFromSnapshot. null when there was no live bootstrap.
  data.getSnapshot = () => boot ?? null
  return data
}

// ─── Deterministic money formatting ─────────────────────────────────────────
// Intl.NumberFormat's currency output depends on the environment's ICU data
// (the build pod's Node vs each visitor's browser can format the SAME Money
// differently, e.g. "THB 120.00" vs "฿120.00") — which breaks SSR hydration
// (React #425 text mismatch). Format manually instead: identical output
// everywhere, by construction.
const CURRENCY_FORMAT: Record<string, { symbol: string; decimals: number }> = {
  THB: { symbol: '฿', decimals: 2 },
  USD: { symbol: '$', decimals: 2 },
  EUR: { symbol: '€', decimals: 2 },
  GBP: { symbol: '£', decimals: 2 },
  JPY: { symbol: '¥', decimals: 0 },
  KRW: { symbol: '₩', decimals: 0 },
  VND: { symbol: '₫', decimals: 0 },
  IDR: { symbol: 'Rp', decimals: 0 },
  SGD: { symbol: 'S$', decimals: 2 },
  HKD: { symbol: 'HK$', decimals: 2 },
  TWD: { symbol: 'NT$', decimals: 2 },
  AUD: { symbol: 'A$', decimals: 2 },
  NZD: { symbol: 'NZ$', decimals: 2 },
  CAD: { symbol: 'CA$', decimals: 2 },
  CNY: { symbol: 'CN¥', decimals: 2 },
  INR: { symbol: '₹', decimals: 2 },
  MYR: { symbol: 'RM', decimals: 2 },
  PHP: { symbol: '₱', decimals: 2 },
}

/** The grouped numeric part of a Money, without symbol or code.
 *  `stripZeros` drops a `.00`-style fraction (`money_without_trailing_zeros`). */
function moneyDigits(money: Money, stripZeros = false): string | null {
  const n = Number(money.amount)
  if (!Number.isFinite(n)) return null
  const info = CURRENCY_FORMAT[money.currencyCode]
  const decimals = info?.decimals ?? 2
  let [int, frac] = Math.abs(n).toFixed(decimals).split('.')
  if (stripZeros && frac && /^0+$/.test(frac)) frac = ''
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return `${n < 0 ? '-' : ''}${grouped}${frac ? `.${frac}` : ''}`
}

/** standard `money` — symbol + amount (e.g. "฿120.00"). */
export function formatMoney(money: Money): string {
  const num = moneyDigits(money)
  if (num === null) return `${money.amount} ${money.currencyCode}`
  const info = CURRENCY_FORMAT[money.currencyCode]
  return info ? `${info.symbol}${num}` : `${num} ${money.currencyCode}`
}

/** standard `money_with_currency` — symbol + amount + ISO code (e.g. "฿120.00 THB"). */
export function formatMoneyWithCurrency(money: Money): string {
  const num = moneyDigits(money)
  if (num === null) return `${money.amount} ${money.currencyCode}`
  const info = CURRENCY_FORMAT[money.currencyCode]
  return info
    ? `${info.symbol}${num} ${money.currencyCode}`
    : `${num} ${money.currencyCode}`
}

/** standard `money_without_currency` — bare grouped amount (e.g. "120.00"). */
export function formatMoneyWithoutCurrency(money: Money): string {
  return moneyDigits(money) ?? `${money.amount}`
}

/** standard `money_without_trailing_zeros` — symbol + amount, dropping a `.00`
 *  fraction (e.g. "฿120", but "฿120.50" stays). */
export function formatMoneyWithoutTrailingZeros(money: Money): string {
  const num = moneyDigits(money, true)
  if (num === null) return `${money.amount} ${money.currencyCode}`
  const info = CURRENCY_FORMAT[money.currencyCode]
  return info ? `${info.symbol}${num}` : `${num} ${money.currencyCode}`
}

/** standard `date` / `time_tag` — format an ISO date deterministically (identical
 *  output on server + client to keep SSR hydration stable). Defaults to a medium
 *  date; pass Intl options to customize. */
export function formatDate(
  input: string | number | Date | null | undefined,
  opts: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'short', day: 'numeric' },
  locale = 'en-US',
): string {
  if (!input) return ''
  const d = input instanceof Date ? input : new Date(input)
  if (Number.isNaN(d.getTime())) return ''
  try {
    return new Intl.DateTimeFormat(locale, { ...opts, timeZone: 'UTC' }).format(d)
  } catch {
    return d.toISOString().slice(0, 10)
  }
}

/** standard `weight_with_unit` — format a variant weight (e.g. "1.5 kg"). */
export function formatWeight(
  weight: { value: number; unit: string } | null | undefined,
): string {
  if (!weight || !Number.isFinite(weight.value)) return ''
  const unit = { GRAMS: 'g', KILOGRAMS: 'kg', OUNCES: 'oz', POUNDS: 'lb' }[weight.unit] ?? weight.unit.toLowerCase()
  const n = Number.isInteger(weight.value) ? weight.value : Number(weight.value.toFixed(2))
  return `${n} ${unit}`
}

/** standard `image_url` — append CDN transform params (width/height/crop) to an
 *  image URL. No-op when the src is empty or no transform is requested. React
 *  themes render the `<img>` themselves, so there is no separate `image_tag`. */
export function imageUrl(
  src: string | null | undefined,
  opts: { width?: number; height?: number; crop?: string } = {},
): string {
  if (!src) return ''
  const { width, height, crop } = opts
  if (!width && !height && !crop) return src
  try {
    const url = new URL(src, 'https://cdn.tanqory.com')
    if (width) url.searchParams.set('width', String(width))
    if (height) url.searchParams.set('height', String(height))
    if (crop) url.searchParams.set('crop', crop)
    // Preserve relative URLs (return path+query) vs absolute.
    return /^https?:\/\//i.test(src) ? url.toString() : `${url.pathname}${url.search}`
  } catch {
    return src
  }
}
