/**
 * Storefront API extensions for the live data layer.
 *
 * `data.tsx` boots a small homepage prefetch (collections + products + page +
 * localization) and exposes a raw `graphql()` escape hatch. This module layers
 * the REST of the storefront-standard surface on top of that same
 * requester so a theme can build every standard storefront page:
 *
 *   - Navigation menus (header/footer, recursive)
 *   - Blog + articles
 *   - Search + predictive search (autocomplete)
 *   - Product recommendations
 *   - Metaobjects (custom content)
 *   - Shop info + legal policies
 *   - Full customer account flow (login / register / orders / addresses)
 *
 * Every field hit here ALREADY EXISTS on tanqory-platform-store-api's Storefront
 * GraphQL schema (`POST /api/v1/stores/{id}/graphql`). These methods attach to
 * the LIVE DataApi only — mock data leaves them undefined, so themes feature-
 * detect (`data.search?.(...)`, `data.customer?.login(...)`).
 *
 * Token storage: the customer flow returns/accepts a `customerAccessToken`
 * (commerce-standard). The theme persists it (localStorage) and passes it
 * back — exactly like the cart's `cartId`. `customerTokenStore` is a tiny
 * localStorage helper for the common case.
 */
import type { Money, Product } from './data'

type GraphqlFn = <T = unknown>(query: string, variables?: Record<string, unknown>) => Promise<T>

/** Normalizers injected from data.tsx (avoids a runtime import cycle). */
export interface StorefrontHelpers {
  normalizeProduct: (node: any) => Product
}

// ───────────────────────── Shared shapes ─────────────────────────

export interface Image {
  url: string
  altText?: string
  width?: number | null
  height?: number | null
  aspectRatio?: number | null
}
export interface Seo {
  title?: string | null
  description?: string | null
}

// ───────────────────────── Navigation ────────────────────────────

export type MenuItemType =
  | 'FRONTPAGE'
  | 'COLLECTION'
  | 'COLLECTIONS'
  | 'PRODUCT'
  | 'CATALOG'
  | 'PAGE'
  | 'BLOG'
  | 'ARTICLE'
  | 'SEARCH'
  | 'SHOP_POLICY'
  | 'HTTP'

export interface MenuItem {
  id: string
  title: string
  url: string | null
  type: MenuItemType
  resourceId?: string | null
  items: MenuItem[]
}
export interface Menu {
  id: string
  handle: string
  title: string
  items: MenuItem[]
}

// ───────────────────────── Blog / Article ────────────────────────

export interface Article {
  id: string
  handle: string
  title: string
  excerpt?: string | null
  contentHtml: string
  image?: Image | null
  author?: string | null
  publishedAt?: string
  tags: string[]
  blogHandle?: string
  seo?: { title?: string | null; description?: string | null; keywords?: string[] | null } | null
  templateSuffix?: string | null
}
export interface Blog {
  id: string
  handle: string
  title: string
  articles: Article[]
  seo?: { title?: string | null; description?: string | null; keywords?: string[] | null } | null
  templateSuffix?: string | null
}

// ───────────────────────── Pagination + filters ──────────────────

/** Relay-style page info — drives "load more" / infinite scroll. */
export interface PageInfo {
  hasNextPage: boolean
  hasPreviousPage: boolean
  startCursor: string | null
  endCursor: string | null
}
/** A faceted filter (price / vendor / type / option) available in a result set. */
export interface Filter {
  id: string
  label: string
  type: string
  /** How to render values (`filter.presentation`): TEXT | IMAGE | SWATCH. */
  presentation?: string | null
  values: Array<{ id: string; label: string; count: number; input: string }>
}

const EMPTY_PAGE_INFO: PageInfo = {
  hasNextPage: false,
  hasPreviousPage: false,
  startCursor: null,
  endCursor: null,
}
function normalizePageInfo(n: any): PageInfo {
  if (!n) return EMPTY_PAGE_INFO
  return {
    hasNextPage: Boolean(n.hasNextPage),
    hasPreviousPage: Boolean(n.hasPreviousPage),
    startCursor: n.startCursor ?? null,
    endCursor: n.endCursor ?? null,
  }
}
function normalizeFilters(arr: any): Filter[] {
  return (arr ?? []).map((f: any) => ({
    id: f.id,
    label: f.label,
    type: f.type,
    ...(f.presentation ? { presentation: f.presentation } : {}),
    values: (f.values ?? []).map((v: any) => ({
      id: v.id,
      label: v.label,
      count: Number(v.count ?? 0),
      input: typeof v.input === 'string' ? v.input : JSON.stringify(v.input),
    })),
  }))
}

// ───────────────────────── Search ────────────────────────────────

export interface SearchResults {
  totalCount: number
  products: Product[]
  pages: Array<{ handle: string; title: string }>
  articles: Article[]
  /** Faceted filters available for this result set (product results). */
  filters: Filter[]
  pageInfo: PageInfo
}
/** A page of products from a collection (collection page + faceted filtering). */
export interface CollectionProductsPage {
  products: Product[]
  filters: Filter[]
  pageInfo: PageInfo
}
export interface PredictiveSearchResults {
  queries: string[]
  products: Product[]
  collections: Array<{ handle: string; title: string; image?: Image | null }>
  pages: Array<{ handle: string; title: string }>
  articles: Article[]
}

// ───────────────────────── Metaobjects ───────────────────────────

export interface MetaobjectField {
  key: string
  value: string | null
  type: string
}
export interface Metaobject {
  id: string
  handle: string
  type: string
  fields: MetaobjectField[]
  /** Convenience map: field key → value. */
  values: Record<string, string | null>
}

// ───────────────────────── Shop / policies ───────────────────────

export interface ShopPolicy {
  handle: string
  title: string
  url: string
  body?: string
}
export interface Shop {
  name: string
  description?: string | null
  /** Store contact (standard `shop.email` / `shop.phone`). */
  email?: string | null
  phone?: string | null
  brand?: {
    logo?: Image | null
    squareLogo?: Image | null
    /** Settings → Brand share banner (`Brand.coverImage`) — the merchant's
     *  purpose-built og:image. */
    coverImage?: Image | null
    slogan?: string | null
    shortDescription?: string | null
    /** Settings → Brand. `primary[0]` is the brand colour; themes should treat
     *  the rest as an ordered palette. Every field is nullable — an
     *  unconfigured store yields nulls, never an error. */
    colors?: {
      primary: { background?: string | null; foreground?: string | null }[]
      secondary: { background?: string | null; foreground?: string | null }[]
    } | null
    /** Settings → Brand fonts (`Brand.fonts: [String!]!`), family names in
     *  priority order — e.g. `["Playfair Display", "Inter"]`. Themes map
     *  `[0]` → display and `[1]` → body. An unconfigured store returns `[]`. */
    fonts?: string[] | null
  } | null
  /** Custom shop metafields ("namespace.key" → value) for dynamic sources. */
  metafields?: Record<string, string | null>
  policies: {
    privacy?: ShopPolicy | null
    refund?: ShopPolicy | null
    termsOfService?: ShopPolicy | null
    shipping?: ShopPolicy | null
    subscription?: ShopPolicy | null
  }
  /** Cookie-consent banner config (Settings → Customer privacy). */
  cookieBanner?: {
    /** EFFECTIVE requirement for THIS shopper (jurisdiction ∨ merchant toggle). */
    enabled: boolean
    /** 'OPT_IN' | 'OPT_OUT' | 'NONE' — the server's per-buyer consent regime (journey-matrix 0.5). */
    mode?: string | null
    dataSharingTitle?: string | null
    dataSharingVisible?: boolean
    title?: string | null
    body?: string | null
    acceptLabel?: string | null
    declineLabel?: string | null
    manageLabel?: string | null
    position?: string | null
    colorTheme?: string | null
  } | null
  /** Primary storefront domain (for canonical URLs / SEO). */
  primaryDomain?: {
    host: string
    url: string
    sslEnabled: boolean
  } | null
  /** Accepted payment methods (for footer/checkout payment icons). */
  paymentSettings?: {
    acceptedCardBrands: string[]
    supportedDigitalWallets: string[]
    currencyCode?: string | null
  } | null
}

// ───────────────────────── Customer ──────────────────────────────

export interface CustomerAddress {
  id: string
  firstName?: string | null
  lastName?: string | null
  company?: string | null
  address1?: string | null
  address2?: string | null
  city?: string | null
  province?: string | null
  country?: string | null
  zip?: string | null
  phone?: string | null
  formatted: string[]
}
export interface Customer {
  id: string
  email?: string | null
  firstName?: string | null
  lastName?: string | null
  displayName: string
  phone?: string | null
  acceptsMarketing: boolean
  numberOfOrders: number
  /** Merchant-assigned customer tags (`customer.tags`). */
  tags?: string[]
  defaultAddress?: CustomerAddress | null
  addresses: CustomerAddress[]
  /** Store-credit balances (`store_credit_account`). */
  storeCreditAccounts?: StoreCreditAccount[]
}
/** A customer store-credit account balance (`store_credit_account`). */
export interface StoreCreditAccount {
  id: string
  balance: Money
}
export interface OrderLineItem {
  title: string
  variantTitle?: string | null
  quantity: number
  image?: Image | null
  totalPrice: Money
}
export interface Order {
  id: string
  name: string
  orderNumber: number
  processedAt: string
  financialStatus?: string | null
  fulfillmentStatus: string
  totalPrice: Money
  statusUrl: string
  /** Contact + cancellation (standard `order.email`/`phone`/`cancelled`/`cancel_reason`). */
  email?: string | null
  phone?: string | null
  cancelled?: boolean
  cancelReason?: string | null
  /** Price breakdown (standard `order.subtotal_price`/`tax_price`/`shipping_price`). */
  subtotalPrice?: Money | null
  totalTax?: Money | null
  totalShippingPrice?: Money | null
  /** Shipping / billing address (standard `order.shipping_address`/`billing_address`). */
  shippingAddress?: CustomerAddress | null
  billingAddress?: CustomerAddress | null
  /** Fulfillments with tracking (`order.fulfillments`). */
  fulfillments?: Array<{ trackingCompany?: string | null; trackingInfo: Array<{ number?: string | null; url?: string | null }> }>
  /** Payment transactions (`order.transactions`). */
  transactions?: OrderTransaction[]
  /** Gift cards issued by this order (`gift_card`). Code is masked to last 4. */
  giftCards?: OrderGiftCard[]
  lineItems: OrderLineItem[]
}
/** A gift card issued by an order (`gift_card`). Full code is never exposed. */
export interface OrderGiftCard {
  id: string
  /** Last 4 characters of the code (full code never returned). */
  lastCharacters: string
  balance: Money
  initialValue: Money
  enabled: boolean
  expiresOn?: string | null
}
/** A payment transaction on an order (standard `order.transactions` / `transaction`). */
export interface OrderTransaction {
  id: string
  /** AUTHORIZATION | CAPTURE | SALE | REFUND | VOID */
  kind: string
  /** PENDING | SUCCESS | FAILURE | ERROR */
  status: string
  amount: Money
  gateway?: string | null
  paymentMethod?: string | null
  processedAt: string
}
/** A saved payment method on the customer account (`customer_payment_method`). */
export interface CustomerPaymentMethod {
  id: string
  isDefault: boolean
  isActive: boolean
  /** CARD | BANK_ACCOUNT | PROMPTPAY | TRUEMONEY */
  type: string
  card?: {
    brand?: string | null
    lastDigits?: string | null
    expiryMonth?: number | null
    expiryYear?: number | null
    name?: string | null
  } | null
}
export interface CustomerAddressInput {
  firstName?: string
  lastName?: string
  company?: string
  address1?: string
  address2?: string
  city?: string
  province?: string
  country?: string
  zip?: string
  phone?: string
}
/** Login/register/renew result. `token` present on success; `errors` on failure. */
export interface AuthResult {
  token: string | null
  expiresAt: string | null
  errors: string[]
}
export interface MutationResult<T = void> {
  ok: boolean
  errors: string[]
  data?: T
}

/** Customer account flow — commerce-standard token model. Live-only. */
export interface CustomerApi {
  /** Email + password → access token. Persist `token` (e.g. via customerTokenStore). */
  login(email: string, password: string): Promise<AuthResult>
  /** Invalidate the access token server-side. */
  logout(token: string): Promise<void>
  /** Extend a token nearing expiry. */
  renew(token: string): Promise<AuthResult>
  /** Create an account. Returns the new customer + (no token — call login next). */
  register(input: {
    email: string
    password: string
    firstName?: string
    lastName?: string
    phone?: string
    acceptsMarketing?: boolean
  }): Promise<MutationResult<Customer>>
  /** Current customer (account page). null when the token is invalid/expired. */
  get(token: string): Promise<Customer | null>
  /** Order history. */
  orders(token: string, opts?: { first?: number }): Promise<Order[]>
  /** Saved payment methods (`customer.payment_methods`). */
  paymentMethods(token: string): Promise<CustomerPaymentMethod[]>
  /** Guest order lookup — orderNumber + email (no account needed). */
  orderByLookup(orderNumber: string, email: string): Promise<Order | null>
  createAddress(token: string, address: CustomerAddressInput): Promise<MutationResult<{ id: string }>>
  updateAddress(token: string, id: string, address: CustomerAddressInput): Promise<MutationResult>
  deleteAddress(token: string, id: string): Promise<MutationResult>
  setDefaultAddress(token: string, addressId: string): Promise<MutationResult>
}

/** The full set of live-only methods this module attaches to a DataApi. */
export interface StorefrontExtensions {
  /** Shop info + legal policies (prefetched at boot). null = mock data. */
  shop?: Shop | null
  /** A navigation menu by handle. `main-menu` + `footer` are prefetched at boot
   *  (sync); other handles return null until `fetchMenu()` caches them. */
  menu?: (handle: string) => Menu | null
  /** Fetch (and cache) an arbitrary menu by handle. */
  fetchMenu?: (handle: string) => Promise<Menu | null>
  /** Full-text search across products, pages and articles (paginated + faceted). */
  search?: (
    query: string,
    opts?: {
      first?: number
      after?: string
      types?: Array<'PRODUCT' | 'PAGE' | 'ARTICLE'>
    },
  ) => Promise<SearchResults>
  /** Autocomplete suggestions (header search dropdown). */
  predictiveSearch?: (query: string, opts?: { limit?: number }) => Promise<PredictiveSearchResults>
  /** Products in a collection — paginated, sortable, faceted (collection page). */
  collectionProducts?: (
    handle: string,
    opts?: {
      first?: number
      after?: string
      sortKey?: 'TITLE' | 'PRICE' | 'BEST_SELLING' | 'CREATED' | 'MANUAL' | 'COLLECTION_DEFAULT'
      reverse?: boolean
      filters?: Array<Record<string, unknown>>
    },
  ) => Promise<CollectionProductsPage>
  /** "You may also like" — related products for a product node id. */
  productRecommendations?: (productId: string) => Promise<Product[]>
  /** A blog with its articles. */
  blogByHandle?: (handle: string, opts?: { articles?: number }) => Promise<Blog | null>
  /** A single article within a blog. */
  articleByHandle?: (blogHandle: string, articleHandle: string) => Promise<Article | null>
  /** A metaobject (custom content) by type + handle. */
  metaobject?: (type: string, handle: string) => Promise<Metaobject | null>
  /** All ACTIVE metaobjects of a type. */
  metaobjects?: (type: string, opts?: { first?: number }) => Promise<Metaobject[]>
  /** Customer account flow (login/register/orders/addresses). */
  customer?: CustomerApi
}

// ───────────────────────── GraphQL fragments ─────────────────────

const MENU_FIELDS = /* GraphQL */ `
  fragment MenuFields on Menu {
    id
    handle
    title
    items {
      ...MenuItemFields
      items { ...MenuItemFields items { ...MenuItemFields } }
    }
  }
  fragment MenuItemFields on MenuItem { id title url type resourceId }
`

const ARTICLE_FIELDS = /* GraphQL */ `
  fragment ArticleFields on Article {
    id
    handle
    title
    excerpt
    contentHtml
    image { url altText width height }
    author: authorV2 { name }
    publishedAt
    tags
    seo { title description keywords }
    templateSuffix
  }
`

const PRODUCT_CARD = /* GraphQL */ `
  fragment ProductCard on Product {
    id
    handle
    title
    availableForSale
    vendor
    productType
    tags
    featuredImage { url altText width height }
    priceRange { minVariantPrice { amount currencyCode } }
    compareAtPriceRange { maxVariantPrice { amount currencyCode } }
    firstAvailableVariant { id }
  }
`

const CUSTOMER_FIELDS = /* GraphQL */ `
  fragment AddressFields on MailingAddress {
    id firstName lastName company address1 address2 city province country zip phone
    formatted(withName: true)
  }
  fragment CustomerFields on Customer {
    id email firstName lastName displayName phone acceptsMarketing numberOfOrders tags
    defaultAddress { ...AddressFields }
    addresses(first: 20) { nodes { ...AddressFields } }
    storeCreditAccounts { id balance { amount currencyCode } }
  }
`

const ORDER_FIELDS = /* GraphQL */ `
  fragment OrderFields on Order {
    id name orderNumber processedAt financialStatus fulfillmentStatus statusUrl
    email phone cancelled cancelReason
    currentTotalPrice { amount currencyCode }
    subtotalPrice { amount currencyCode }
    totalTax { amount currencyCode }
    totalShippingPrice { amount currencyCode }
    totalPrice { amount currencyCode }
    shippingAddress { id firstName lastName company address1 address2 city province country zip phone }
    billingAddress { id firstName lastName company address1 address2 city province country zip phone }
    fulfillments(first: 5) { trackingCompany trackingInfo { number url } }
    transactions { id kind status amount { amount currencyCode } gateway paymentMethod processedAt }
    giftCards { id lastCharacters balance { amount currencyCode } initialValue { amount currencyCode } enabled expiresOn }
    lineItems(first: 50) {
      nodes {
        title variantTitle quantity
        discountedTotalPrice { amount currencyCode }
        variant { image { url altText width height } }
      }
    }
  }
`

// ───────────────────────── Normalizers ───────────────────────────

const ZERO: Money = { amount: '0', currencyCode: 'USD' }

function img(node: any): Image | null {
  if (!node || !node.url) return null
  return node.altText ? { url: node.url, altText: node.altText } : { url: node.url }
}

function normalizeMenuItem(n: any): MenuItem {
  return {
    id: n.id,
    title: n.title,
    url: n.url ?? null,
    type: n.type,
    resourceId: n.resourceId ?? null,
    items: (n.items ?? []).map(normalizeMenuItem),
  }
}
function normalizeMenu(n: any): Menu | null {
  if (!n) return null
  return { id: n.id, handle: n.handle, title: n.title, items: (n.items ?? []).map(normalizeMenuItem) }
}

function normalizeArticle(n: any, blogHandle?: string): Article {
  return {
    id: n.id,
    handle: n.handle,
    title: n.title,
    excerpt: n.excerpt ?? null,
    contentHtml: n.contentHtml ?? '',
    image: img(n.image),
    author: n.author?.name ?? null,
    ...(n.publishedAt ? { publishedAt: n.publishedAt } : {}),
    tags: n.tags ?? [],
    ...(blogHandle ? { blogHandle } : {}),
    ...(n.seo ? { seo: { title: n.seo.title ?? null, description: n.seo.description ?? null, keywords: n.seo.keywords ?? [] } } : {}),
    ...(n.templateSuffix ? { templateSuffix: n.templateSuffix } : {}),
  }
}

function normalizeMetaobject(n: any): Metaobject {
  const fields: MetaobjectField[] = (n.fields ?? []).map((f: any) => ({
    key: f.key,
    value: f.value ?? null,
    type: f.type,
  }))
  const values: Record<string, string | null> = {}
  for (const f of fields) values[f.key] = f.value
  return { id: n.id, handle: n.handle, type: n.type, fields, values }
}

function normalizeAddress(n: any): CustomerAddress {
  return {
    id: n.id,
    firstName: n.firstName ?? null,
    lastName: n.lastName ?? null,
    company: n.company ?? null,
    address1: n.address1 ?? null,
    address2: n.address2 ?? null,
    city: n.city ?? null,
    province: n.province ?? null,
    country: n.country ?? null,
    zip: n.zip ?? null,
    phone: n.phone ?? null,
    formatted: n.formatted ?? [],
  }
}
function normalizeCustomer(n: any): Customer {
  return {
    id: n.id,
    email: n.email ?? null,
    firstName: n.firstName ?? null,
    lastName: n.lastName ?? null,
    displayName: n.displayName ?? '',
    phone: n.phone ?? null,
    acceptsMarketing: Boolean(n.acceptsMarketing),
    numberOfOrders: Number(n.numberOfOrders ?? 0),
    tags: n.tags ?? [],
    defaultAddress: n.defaultAddress ? normalizeAddress(n.defaultAddress) : null,
    addresses: (n.addresses?.nodes ?? []).map(normalizeAddress),
    ...(n.storeCreditAccounts?.length
      ? { storeCreditAccounts: n.storeCreditAccounts.map((a: any) => ({
          id: a.id,
          balance: a.balance ?? ZERO,
        })) }
      : {}),
  }
}
function normalizeOrder(n: any): Order {
  return {
    id: n.id,
    name: n.name,
    orderNumber: Number(n.orderNumber ?? 0),
    processedAt: n.processedAt,
    financialStatus: n.financialStatus ?? null,
    fulfillmentStatus: n.fulfillmentStatus ?? 'UNFULFILLED',
    totalPrice: n.currentTotalPrice ?? n.totalPrice ?? ZERO,
    statusUrl: n.statusUrl ?? '',
    email: n.email ?? null,
    phone: n.phone ?? null,
    ...(typeof n.cancelled === 'boolean' ? { cancelled: n.cancelled } : {}),
    cancelReason: n.cancelReason ?? null,
    ...(n.subtotalPrice ? { subtotalPrice: n.subtotalPrice } : {}),
    ...(n.totalTax ? { totalTax: n.totalTax } : {}),
    ...(n.totalShippingPrice ? { totalShippingPrice: n.totalShippingPrice } : {}),
    ...(n.shippingAddress ? { shippingAddress: normalizeAddress(n.shippingAddress) } : {}),
    ...(n.billingAddress ? { billingAddress: normalizeAddress(n.billingAddress) } : {}),
    ...(n.fulfillments?.length
      ? { fulfillments: n.fulfillments.map((f: any) => ({
          trackingCompany: f.trackingCompany ?? null,
          trackingInfo: (f.trackingInfo ?? []).map((t: any) => ({ number: t.number ?? null, url: t.url ?? null })),
        })) }
      : {}),
    ...(n.transactions?.length
      ? { transactions: n.transactions.map((t: any) => ({
          id: t.id,
          kind: t.kind,
          status: t.status,
          amount: t.amount ?? ZERO,
          gateway: t.gateway ?? null,
          paymentMethod: t.paymentMethod ?? null,
          processedAt: t.processedAt,
        })) }
      : {}),
    ...(n.giftCards?.length
      ? { giftCards: n.giftCards.map((g: any) => ({
          id: g.id,
          lastCharacters: g.lastCharacters ?? '',
          balance: g.balance ?? ZERO,
          initialValue: g.initialValue ?? ZERO,
          enabled: Boolean(g.enabled),
          expiresOn: g.expiresOn ?? null,
        })) }
      : {}),
    lineItems: (n.lineItems?.nodes ?? []).map((li: any) => ({
      title: li.title,
      variantTitle: li.variantTitle ?? null,
      quantity: Number(li.quantity ?? 0),
      image: img(li.variant?.image),
      totalPrice: li.discountedTotalPrice ?? ZERO,
    })),
  }
}
function normalizeShopPolicy(n: any): ShopPolicy | null {
  if (!n) return null
  return { handle: n.handle, title: n.title, url: n.url, ...(n.body ? { body: n.body } : {}) }
}
function normalizeShop(n: any): Shop | null {
  if (!n) return null
  return {
    name: n.name,
    description: n.description ?? null,
    email: n.email ?? null,
    phone: n.phone ?? null,
    brand: n.brand
      ? {
          logo: img(n.brand.logo),
          squareLogo: img(n.brand.squareLogo),
          coverImage: img(n.brand.coverImage),
          slogan: n.brand.slogan ?? null,
          shortDescription: n.brand.shortDescription ?? null,
          // `fonts` is non-null in the SDL but a snapshot rebuilt from an older
          // bootstrap won't carry it — normalise to [] so a theme can map over
          // it without guarding.
          fonts: Array.isArray(n.brand.fonts)
            ? n.brand.fonts.filter((f: unknown): f is string => typeof f === 'string' && f.trim() !== '')
            : [],
          // Colour groups arrive as arrays and can be empty; keep the shape
          // stable so a theme can index `primary[0]` without guarding twice.
          colors: n.brand.colors
            ? {
                primary: n.brand.colors.primary ?? [],
                secondary: n.brand.colors.secondary ?? [],
              }
            : null,
        }
      : null,
    policies: {
      privacy: normalizeShopPolicy(n.privacyPolicy),
      refund: normalizeShopPolicy(n.refundPolicy),
      termsOfService: normalizeShopPolicy(n.termsOfService),
      shipping: normalizeShopPolicy(n.shippingPolicy),
      subscription: normalizeShopPolicy(n.subscriptionPolicy),
    },
    cookieBanner: n.cookieBanner
      ? {
          enabled: Boolean(n.cookieBanner.enabled),
          mode: n.cookieBanner.mode ?? null,
          dataSharingTitle: n.cookieBanner.dataSharingTitle ?? null,
          dataSharingVisible: n.cookieBanner.dataSharingVisible !== false,
          title: n.cookieBanner.title ?? null,
          body: n.cookieBanner.body ?? null,
          acceptLabel: n.cookieBanner.acceptLabel ?? null,
          declineLabel: n.cookieBanner.declineLabel ?? null,
          manageLabel: n.cookieBanner.manageLabel ?? null,
          position: n.cookieBanner.position ?? null,
          colorTheme: n.cookieBanner.colorTheme ?? null,
        }
      : null,
    primaryDomain: n.primaryDomain
      ? {
          host: n.primaryDomain.host,
          url: n.primaryDomain.url,
          sslEnabled: Boolean(n.primaryDomain.sslEnabled),
        }
      : null,
    paymentSettings: n.paymentSettings
      ? {
          acceptedCardBrands: n.paymentSettings.acceptedCardBrands ?? [],
          supportedDigitalWallets: n.paymentSettings.supportedDigitalWallets ?? [],
          currencyCode: n.paymentSettings.currencyCode ?? null,
        }
      : null,
  }
}

/** UserError[] → message strings. */
function errs(arr: any): string[] {
  return (arr ?? []).map((e: any) => e?.message).filter((m: any): m is string => Boolean(m))
}

// ─── Bootstrap fields (merged into data.tsx's boot query) ─────────

/** GraphQL selection for shop + the two standard menus, spliced into the
 *  homepage bootstrap so the layout (nav + footer + policies) renders sync. */
export const BOOTSTRAP_SHOP_MENU = /* GraphQL */ `
  shop {
    name
    description
    email
    phone
    # Ask for the whole brand, not a third of it. Settings → Brand persists a
    # logo, a square logo and brand colours; the SDL has carried them all along
    # and this selection took only logo/slogan/shortDescription, so a merchant
    # could upload a logo and set colours and their storefront never changed.
    # Nullable throughout (BrandColorGroup.background/foreground are String),
    # so an unconfigured store returns nulls rather than failing the query.
    brand {
      logo { url altText width height }
      squareLogo { url altText width height }
      coverImage { url altText width height }
      slogan
      shortDescription
      colors {
        primary { background foreground }
        secondary { background foreground }
      }
      # Settings → Brand typography. Selected here because a theme cannot fetch
      # it separately without a second bootstrap round-trip, and without it a
      # merchant who picks brand fonts sees no change on their storefront.
      fonts
    }
    privacyPolicy { handle title url }
    refundPolicy { handle title url }
    termsOfService { handle title url }
    shippingPolicy { handle title url }
    subscriptionPolicy { handle title url }
    cookieBanner { enabled mode dataSharingTitle dataSharingVisible title body acceptLabel declineLabel manageLabel position colorTheme }
    primaryDomain { host url sslEnabled }
    paymentSettings { acceptedCardBrands supportedDigitalWallets currencyCode }
  }
  mainMenu: menu(handle: "main-menu") { ...MenuFields }
  footerMenu: menu(handle: "footer") { ...MenuFields }
`
/** Fragment defs the bootstrap query must include when it uses BOOTSTRAP_SHOP_MENU. */
export const BOOTSTRAP_SHOP_MENU_FRAGMENTS = MENU_FIELDS

/** Pull shop + the prefetched menus out of a bootstrap response. */
export function readBootstrapShopMenu(boot: any): {
  shop: Shop | null
  menus: Map<string, Menu>
} {
  const menus = new Map<string, Menu>()
  const main = normalizeMenu(boot?.mainMenu)
  if (main) menus.set('main-menu', main)
  const footer = normalizeMenu(boot?.footerMenu)
  if (footer) menus.set('footer', footer)
  return { shop: normalizeShop(boot?.shop), menus }
}

// ───────────────────────── Factory ───────────────────────────────

/**
 * Build the live storefront extension methods on top of a `graphql()` requester.
 * `menuCache` is shared with the boot-prefetched menus so `fetchMenu()` warms
 * the same map that the sync `menu()` reads.
 */
export function createStorefrontMethods(
  graphql: GraphqlFn,
  helpers: StorefrontHelpers,
  menuCache: Map<string, Menu>,
): Required<Omit<StorefrontExtensions, 'shop' | 'menu'>> {
  const { normalizeProduct } = helpers

  const fetchMenu = async (handle: string): Promise<Menu | null> => {
    const cached = menuCache.get(handle)
    if (cached) return cached
    const res = await graphql<{ menu: any }>(
      `${MENU_FIELDS}\n query Menu($handle: String!) { menu(handle: $handle) { ...MenuFields } }`,
      { handle },
    )
    const menu = normalizeMenu(res?.menu)
    if (menu) menuCache.set(handle, menu)
    return menu
  }

  const search: NonNullable<StorefrontExtensions['search']> = async (query, opts) => {
    const res = await graphql<{ search: any }>(
      `${PRODUCT_CARD}${ARTICLE_FIELDS}
       query Search($query: String!, $first: Int!, $after: String, $types: [SearchType!]) {
         search(query: $query, first: $first, after: $after, types: $types) {
           totalCount
           productFilters { id label type values { id label count input } }
           pageInfo { hasNextPage hasPreviousPage startCursor endCursor }
           nodes {
             __typename
             ... on Product { ...ProductCard }
             ... on Page { handle title }
             ... on Article { ...ArticleFields }
           }
         }
       }`,
      { query, first: opts?.first ?? 24, after: opts?.after ?? null, types: opts?.types ?? null },
    )
    const s = res?.search ?? {}
    const nodes: any[] = s.nodes ?? []
    return {
      totalCount: Number(s.totalCount ?? 0),
      products: nodes.filter((n) => n.__typename === 'Product').map(normalizeProduct),
      pages: nodes
        .filter((n) => n.__typename === 'Page')
        .map((n) => ({ handle: n.handle, title: n.title })),
      articles: nodes.filter((n) => n.__typename === 'Article').map((n) => normalizeArticle(n)),
      filters: normalizeFilters(s.productFilters),
      pageInfo: normalizePageInfo(s.pageInfo),
    }
  }

  const collectionProducts: NonNullable<StorefrontExtensions['collectionProducts']> = async (
    handle,
    opts,
  ) => {
    const res = await graphql<{ collection: any }>(
      `${PRODUCT_CARD}
       query CollectionProducts(
         $handle: String!, $first: Int!, $after: String,
         $sortKey: ProductCollectionSortKey, $reverse: Boolean, $filters: [ProductFilterInput!]
       ) {
         collection(handle: $handle) {
           products(first: $first, after: $after, sortKey: $sortKey, reverse: $reverse, filters: $filters) {
             nodes { ...ProductCard }
             filters { id label type presentation values { id label count input } }
             pageInfo { hasNextPage hasPreviousPage startCursor endCursor }
           }
         }
       }`,
      {
        handle,
        first: opts?.first ?? 24,
        after: opts?.after ?? null,
        sortKey: opts?.sortKey ?? null,
        reverse: opts?.reverse ?? null,
        filters: opts?.filters ?? null,
      },
    )
    const c = res?.collection?.products ?? {}
    return {
      products: (c.nodes ?? []).map(normalizeProduct),
      filters: normalizeFilters(c.filters),
      pageInfo: normalizePageInfo(c.pageInfo),
    }
  }

  const predictiveSearch: NonNullable<StorefrontExtensions['predictiveSearch']> = async (
    query,
    opts,
  ) => {
    const res = await graphql<{ predictiveSearch: any }>(
      `${PRODUCT_CARD}${ARTICLE_FIELDS}
       query Predictive($query: String!, $limit: Int!) {
         predictiveSearch(query: $query, limit: $limit) {
           queries { text }
           products { ...ProductCard }
           collections { handle title image { url altText width height } }
           pages { handle title }
           articles { ...ArticleFields }
         }
       }`,
      { query, limit: opts?.limit ?? 4 },
    )
    const ps = res?.predictiveSearch ?? {}
    return {
      queries: (ps.queries ?? []).map((q: any) => q.text),
      products: (ps.products ?? []).map(normalizeProduct),
      collections: (ps.collections ?? []).map((c: any) => ({
        handle: c.handle,
        title: c.title,
        image: img(c.image),
      })),
      pages: (ps.pages ?? []).map((p: any) => ({ handle: p.handle, title: p.title })),
      articles: (ps.articles ?? []).map((a: any) => normalizeArticle(a)),
    }
  }

  const productRecommendations: NonNullable<
    StorefrontExtensions['productRecommendations']
  > = async (productId) => {
    const res = await graphql<{ productRecommendations: any[] }>(
      `${PRODUCT_CARD}
       query Recs($productId: ID!) {
         productRecommendations(productId: $productId) { ...ProductCard }
       }`,
      { productId },
    )
    return (res?.productRecommendations ?? []).map(normalizeProduct)
  }

  const blogByHandle: NonNullable<StorefrontExtensions['blogByHandle']> = async (handle, opts) => {
    const res = await graphql<{ blog: any }>(
      `${ARTICLE_FIELDS}
       query Blog($handle: String!, $first: Int!) {
         blog(handle: $handle) {
           id handle title
           seo { title description keywords }
           templateSuffix
           articles(first: $first) { nodes { ...ArticleFields } }
         }
       }`,
      { handle, first: opts?.articles ?? 20 },
    )
    const b = res?.blog
    if (!b) return null
    return {
      id: b.id,
      handle: b.handle,
      title: b.title,
      articles: (b.articles?.nodes ?? []).map((a: any) => normalizeArticle(a, b.handle)),
      ...(b.seo ? { seo: { title: b.seo.title ?? null, description: b.seo.description ?? null, keywords: b.seo.keywords ?? [] } } : {}),
      ...(b.templateSuffix ? { templateSuffix: b.templateSuffix } : {}),
    }
  }

  const articleByHandle: NonNullable<StorefrontExtensions['articleByHandle']> = async (
    blogHandle,
    articleHandle,
  ) => {
    const res = await graphql<{ article: any }>(
      `${ARTICLE_FIELDS}
       query Article($handle: ArticleHandleInput!) {
         article(handle: $handle) { ...ArticleFields }
       }`,
      { handle: { blogHandle, articleHandle } },
    )
    return res?.article ? normalizeArticle(res.article, blogHandle) : null
  }

  const metaobject: NonNullable<StorefrontExtensions['metaobject']> = async (type, handle) => {
    const res = await graphql<{ metaobject: any }>(
      `query Metaobject($handle: MetaobjectHandleInput!) {
         metaobject(handle: $handle) { id handle type fields { key value type } }
       }`,
      { handle: { type, handle } },
    )
    return res?.metaobject ? normalizeMetaobject(res.metaobject) : null
  }

  const metaobjects: NonNullable<StorefrontExtensions['metaobjects']> = async (type, opts) => {
    const res = await graphql<{ metaobjects: any }>(
      `query Metaobjects($type: String!, $first: Int!) {
         metaobjects(type: $type, first: $first) {
           nodes { id handle type fields { key value type } }
         }
       }`,
      { type, first: opts?.first ?? 50 },
    )
    return (res?.metaobjects?.nodes ?? []).map(normalizeMetaobject)
  }

  // ─── Customer account flow ──────────────────────────────────────

  const customer: CustomerApi = {
    async login(email, password) {
      const res = await graphql<{ customerAccessTokenCreate: any }>(
        `mutation Login($input: CustomerAccessTokenCreateInput!) {
           customerAccessTokenCreate(input: $input) {
             customerAccessToken { accessToken expiresAt }
             customerUserErrors { message }
           }
         }`,
        { input: { email, password } },
      )
      const p = res?.customerAccessTokenCreate
      return {
        token: p?.customerAccessToken?.accessToken ?? null,
        expiresAt: p?.customerAccessToken?.expiresAt ?? null,
        errors: errs(p?.customerUserErrors),
      }
    },
    async logout(token) {
      await graphql(
        `mutation Logout($t: String!) {
           customerAccessTokenDelete(customerAccessToken: $t) { deletedAccessToken userErrors { message } }
         }`,
        { t: token },
      )
    },
    async renew(token) {
      const res = await graphql<{ customerAccessTokenRenew: any }>(
        `mutation Renew($t: String!) {
           customerAccessTokenRenew(customerAccessToken: $t) {
             customerAccessToken { accessToken expiresAt }
             userErrors { message }
           }
         }`,
        { t: token },
      )
      const p = res?.customerAccessTokenRenew
      return {
        token: p?.customerAccessToken?.accessToken ?? null,
        expiresAt: p?.customerAccessToken?.expiresAt ?? null,
        errors: errs(p?.userErrors),
      }
    },
    async register(input) {
      const res = await graphql<{ customerCreate: any }>(
        `${CUSTOMER_FIELDS}
         mutation Register($input: CustomerCreateInput!) {
           customerCreate(input: $input) {
             customer { ...CustomerFields }
             customerUserErrors { message }
           }
         }`,
        { input },
      )
      const p = res?.customerCreate
      const errors = errs(p?.customerUserErrors)
      return {
        ok: Boolean(p?.customer) && errors.length === 0,
        errors,
        ...(p?.customer ? { data: normalizeCustomer(p.customer) } : {}),
      }
    },
    async get(token) {
      const res = await graphql<{ customer: any }>(
        `${CUSTOMER_FIELDS}
         query Me($t: String) { customer(customerAccessToken: $t) { ...CustomerFields } }`,
        { t: token },
      )
      return res?.customer ? normalizeCustomer(res.customer) : null
    },
    async paymentMethods(token) {
      const res = await graphql<{ customer: { paymentMethods?: any[] } | null }>(
        `query PaymentMethods($t: String) {
           customer(customerAccessToken: $t) {
             paymentMethods {
               id isDefault isActive type
               card { brand lastDigits expiryMonth expiryYear name }
             }
           }
         }`,
        { t: token },
      )
      return (res?.customer?.paymentMethods ?? []).map((m: any) => ({
        id: m.id,
        isDefault: Boolean(m.isDefault),
        isActive: Boolean(m.isActive),
        type: m.type,
        ...(m.card ? { card: {
          brand: m.card.brand ?? null,
          lastDigits: m.card.lastDigits ?? null,
          expiryMonth: m.card.expiryMonth ?? null,
          expiryYear: m.card.expiryYear ?? null,
          name: m.card.name ?? null,
        } } : {}),
      }))
    },
    async orders(token, opts) {
      const res = await graphql<{ customer: any }>(
        `${ORDER_FIELDS}
         query Orders($t: String, $first: Int!) {
           customer(customerAccessToken: $t) {
             orders(first: $first, sortKey: PROCESSED_AT, reverse: true) { nodes { ...OrderFields } }
           }
         }`,
        { t: token, first: opts?.first ?? 20 },
      )
      return (res?.customer?.orders?.nodes ?? []).map(normalizeOrder)
    },
    async orderByLookup(orderNumber, email) {
      const res = await graphql<{ orderByLookup: any }>(
        `${ORDER_FIELDS}
         query Lookup($n: String!, $e: String!) {
           orderByLookup(orderNumber: $n, email: $e) { ...OrderFields }
         }`,
        { n: orderNumber, e: email },
      )
      return res?.orderByLookup ? normalizeOrder(res.orderByLookup) : null
    },
    async createAddress(token, address) {
      const res = await graphql<{ customerAddressCreate: any }>(
        `mutation AddrCreate($t: String!, $a: MailingAddressInput!) {
           customerAddressCreate(customerAccessToken: $t, address: $a) {
             customerAddress { id }
             customerUserErrors { message }
           }
         }`,
        { t: token, a: address },
      )
      const p = res?.customerAddressCreate
      const errors = errs(p?.customerUserErrors)
      return {
        ok: Boolean(p?.customerAddress?.id) && errors.length === 0,
        errors,
        ...(p?.customerAddress?.id ? { data: { id: p.customerAddress.id as string } } : {}),
      }
    },
    async updateAddress(token, id, address) {
      const res = await graphql<{ customerAddressUpdate: any }>(
        `mutation AddrUpdate($t: String!, $id: ID!, $a: MailingAddressInput!) {
           customerAddressUpdate(customerAccessToken: $t, id: $id, address: $a) {
             customerAddress { id }
             customerUserErrors { message }
           }
         }`,
        { t: token, id, a: address },
      )
      const errors = errs(res?.customerAddressUpdate?.customerUserErrors)
      return { ok: errors.length === 0, errors }
    },
    async deleteAddress(token, id) {
      const res = await graphql<{ customerAddressDelete: any }>(
        `mutation AddrDelete($t: String!, $id: ID!) {
           customerAddressDelete(customerAccessToken: $t, id: $id) {
             deletedCustomerAddressId
             customerUserErrors { message }
           }
         }`,
        { t: token, id },
      )
      const errors = errs(res?.customerAddressDelete?.customerUserErrors)
      return { ok: errors.length === 0, errors }
    },
    async setDefaultAddress(token, addressId) {
      const res = await graphql<{ customerDefaultAddressUpdate: any }>(
        `mutation AddrDefault($t: String!, $id: ID!) {
           customerDefaultAddressUpdate(customerAccessToken: $t, addressId: $id) {
             customer { id }
             customerUserErrors { message }
           }
         }`,
        { t: token, id: addressId },
      )
      const errors = errs(res?.customerDefaultAddressUpdate?.customerUserErrors)
      return { ok: errors.length === 0, errors }
    },
  }

  return {
    fetchMenu,
    search,
    collectionProducts,
    predictiveSearch,
    productRecommendations,
    blogByHandle,
    articleByHandle,
    metaobject,
    metaobjects,
    customer,
  }
}

// ───────────────────────── Token storage helper ──────────────────

const CUSTOMER_TOKEN_KEY = 'tq-customer-token'

/** Tiny localStorage helper for the customer access token (SSR-safe no-ops). */
export const customerTokenStore = {
  get(): string | null {
    if (typeof localStorage === 'undefined') return null
    return localStorage.getItem(CUSTOMER_TOKEN_KEY)
  },
  set(token: string): void {
    if (typeof localStorage === 'undefined') return
    localStorage.setItem(CUSTOMER_TOKEN_KEY, token)
  },
  clear(): void {
    if (typeof localStorage === 'undefined') return
    localStorage.removeItem(CUSTOMER_TOKEN_KEY)
  },
}
