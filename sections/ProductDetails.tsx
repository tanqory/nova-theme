import {
  defineSection,
  getAnalytics,
  useCart,
  useData,
  useT,
  type Product,
  type SectionProps,
} from '../lib/tanqory/index'
import { localizedCopy } from '../lib/theme-locale'
import { handleFromPath } from '../lib/handle'
import { isEditorPreview } from '../lib/runtime'
import { Children, useEffect, useMemo, useState } from 'react'
import { Price } from '../components/Price'
import { ProductGallery } from '../components/ProductGallery'
import { VariantPicker, InventoryStatus } from '../components/VariantPicker'
import { Breadcrumb } from '../components/Disclosure'
import { Button } from '../components/Button'
import { NotifyMe } from '../components/NotifyMe'
import { QuantityStepper } from '../components/QuantityStepper'
import { openOverlay } from '../components/useOverlayChannel'
import { ProductProvider, type ProductContextValue } from '../components/product-context'
import { ProductDescription } from './ProductDescription'
import { withShared, sharedRootProps } from '../lib/shared-section-props'

const DEFAULT_VARIANT_TITLE = 'Default Title'

/**
 * Product metafields the PDP asks for by identifier. `fetchProduct` only
 * returns the metafields it is given identifiers for, so this list is what
 * makes the Materials / Shipping disclosures merchant-owned rather than
 * theme-invented.
 */
const PRODUCT_FACT_METAFIELDS = [
  { namespace: 'custom', key: 'materials' },
  { namespace: 'custom', key: 'shipping' },
]

/**
 * A merchant-authored product fact, from a product metafield.
 *
 * Returns undefined when the merchant has not set one, so the disclosure is
 * omitted entirely rather than rendering an empty panel — or worse, a claim the
 * theme invented on their behalf.
 */
function productFact(product: Product, key: string): string | undefined {
  const value = product.metafields?.[key]
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined
}

/** Collapsible product fact. Renders nothing when the merchant has no value. */
function ProductFact({
  label,
  body,
  first = false,
}: {
  label: string
  body: string | undefined
  first?: boolean
}): JSX.Element | null {
  if (!body) return null
  return (
    <details
      style={
        first
          ? { borderTop: '1px solid var(--color-border)', paddingTop: 'var(--space-4)' }
          : undefined
      }
    >
      <summary
        style={{
          cursor: 'pointer',
          listStyle: 'none',
          display: 'flex',
          justifyContent: 'space-between',
          fontWeight: 500,
        }}
      >
        {label}
        <span aria-hidden>+</span>
      </summary>
      <p
        className="u-text-muted"
        style={{ marginTop: 'var(--space-3)', lineHeight: 'var(--leading-loose)' }}
      >
        {body}
      </p>
    </details>
  )
}

/**
 * The rich-text product body.
 *
 * theme-kit's own product query selects only `description`, which store-api
 * returns as PLAINTEXT — so no theme-kit payload carries the merchant's
 * formatting, and every PDP rendered one unbroken paragraph. The storefront
 * schema does expose `Product.descriptionHtml` (`@cost(value: 0)`), so the
 * theme asks for it directly through the kit's `graphql` escape hatch. One
 * extra field, one cheap request, and it stays correct if the kit later adds
 * the field itself.
 */
const PRODUCT_DESCRIPTION_HTML_QUERY = /* GraphQL */ `
  query ThemeProductDescriptionHtml($handle: String!) {
    product(handle: $handle) {
      descriptionHtml
    }
  }
`

export function ProductDetails({ attributes, children }: SectionProps): JSX.Element {
  const { productByHandle, fetchProduct, graphql } = useData()
  const cart = useCart()
  const t = useT()
  const isLive = typeof graphql === 'function'

  // The URL is canonical. `attributes.product` is a PREVIEW override and only
  // the editor may use it — on a published storefront it must never decide
  // which product a `/products/<handle>` URL shows. Off a product route (the
  // section dropped onto another page, or an editor canvas with no URL) the
  // setting is the only source there is, so it applies there.
  const routeHandle = handleFromPath(/\/products\/([^/]+)/)
  const previewHandle = (attributes.product as string | undefined)?.trim() || undefined
  const handle = isEditorPreview() ? previewHandle ?? routeHandle : routeHandle ?? previewHandle

  // A handle that isn't in the catalogue is NOT a reason to show a different
  // product. The old fallback (`collectionByHandle('all').products[0]`) meant
  // every dead link rendered a real, buyable product page for something the
  // shopper never asked for.
  const bootstrapProduct = handle ? productByHandle(handle) ?? null : null

  // Lazily upgrade to the full product (options + variants) for the picker.
  // The bootstrap only carries a default variant id; the full variant list is
  // fetched on demand here (keeps the homepage bootstrap cheap).
  //
  // `detail` and `descriptionHtml` are keyed to `handle`, so they are cleared
  // the moment the handle changes. Holding them across a soft navigation is
  // what let product A's description and gallery render under product B's
  // title while B was still loading.
  const [detail, setDetail] = useState<Product | null>(null)
  const [descriptionHtml, setDescriptionHtml] = useState<string | null>(null)
  const [fetchState, setFetchState] = useState<'idle' | 'loading' | 'done' | 'missing'>('idle')
  const [addError, setAddError] = useState<string | null>(null)
  // Selected option values (Size → "M", Color → "Black"). Seeded from the
  // first available variant once the full product loads.
  const [selected, setSelected] = useState<Record<string, string>>({})
  const [activeIdx, setActiveIdx] = useState(0)
  const [adding, setAdding] = useState(false)
  const [quantity, setQuantity] = useState(1)

  useEffect(() => {
    let cancelled = false
    setDetail(null)
    setDescriptionHtml(null)
    setAddError(null)
    setActiveIdx(0)
    setQuantity(1)
    setSelected({})
    if (!handle) {
      setFetchState('missing')
      return
    }
    if (!fetchProduct) {
      // Offline/mock data has no detail fetch — the bootstrap record is all
      // there is, so resolution is already final.
      setFetchState(bootstrapProduct ? 'done' : 'missing')
      return
    }
    setFetchState('loading')
    void fetchProduct(handle, { metafields: PRODUCT_FACT_METAFIELDS })
      .then((p) => {
        if (cancelled) return
        if (p) {
          setDetail(p)
          setFetchState('done')
        } else {
          // theme-kit's `fetchProduct` resolves to null for BOTH "no such
          // handle" and "the detail request failed" — it catches internally and
          // degrades rather than rejecting. So null alone is not proof the
          // product is gone: if the bootstrap (which prefetches the route's
          // product) has a record, keep rendering it. Only when neither source
          // has anything is not-found the honest answer.
          setFetchState(bootstrapProduct ? 'done' : 'missing')
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return
        // Keep whatever the bootstrap gave us rather than blanking the page,
        // but say so — a silent catch here is indistinguishable from "this
        // product does not exist".
        // eslint-disable-next-line no-console
        console.error(`[nova] fetchProduct(${handle}) failed:`, err)
        setFetchState(bootstrapProduct ? 'done' : 'missing')
      })
    return () => {
      cancelled = true
    }
    // `bootstrapProduct` is derived from `handle`; re-running on its identity
    // would refetch on every bootstrap refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handle, fetchProduct])

  // The formatted body. theme-kit ≤ 0.1.3 selects only the PLAINTEXT
  // `description` in its product query, so the theme asks for the one extra
  // field through the kit's `graphql` escape hatch. The kit repo now selects
  // `descriptionHtml` in `PRODUCT_QUERY` itself — on a kit that does, this
  // effect issues NO request at all.
  //
  // It therefore waits for the detail fetch to settle before deciding. Firing
  // on mount (when `detail` is necessarily still null) would send the extra
  // request on every PDP even once the kit supplies the field, which is the
  // whole cost this is meant to avoid.
  const detailHtml = (detail as { descriptionHtml?: string } | null)?.descriptionHtml
  useEffect(() => {
    let cancelled = false
    if (!handle || typeof graphql !== 'function') return
    if (fetchState === 'loading' || fetchState === 'idle') return
    if (detailHtml) {
      setDescriptionHtml(detailHtml)
      return
    }
    void graphql<{ product: { descriptionHtml?: string | null } | null }>(
      PRODUCT_DESCRIPTION_HTML_QUERY,
      { handle },
    )
      .then((res) => {
        if (!cancelled) setDescriptionHtml(res?.product?.descriptionHtml ?? null)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        // eslint-disable-next-line no-console
        console.warn(`[nova] descriptionHtml(${handle}) failed:`, err)
        setDescriptionHtml(null)
      })
    return () => {
      cancelled = true
    }
    // `graphql` is deliberately NOT a dependency: the kit hands out a new
    // closure after every SWR revalidate, and re-running on it blanked an
    // already-resolved description and refetched it on every refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handle, detailHtml, fetchState])

  const product = detail ?? bootstrapProduct
  const options = product?.options ?? []
  const variants = useMemo(() => product?.variants ?? [], [product])

  useEffect(() => {
    // `?variant=<id>` (feed and share links) names the variant to open on, sold out or not: the page must agree with
    // the feed row it was reached from. Anything unknown falls back to the first available variant.
    const requested =
      typeof window === 'undefined' ? '' : (new URLSearchParams(window.location.search).get('variant') ?? '').trim()
    const seed =
      (requested ? variants.find((v) => v.id === requested) : undefined) ??
      variants.find((v) => v.availableForSale) ??
      variants[0]
    if (seed?.selectedOptions?.length) {
      setSelected(Object.fromEntries(seed.selectedOptions.map((o) => [o.name, o.value])))
    }
  }, [variants])

  const selectedVariant = useMemo(() => {
    if (!variants.length) return undefined
    if (!options.length) return variants[0]
    return variants.find((v) =>
      (v.selectedOptions ?? []).every((o) => selected[o.name] === o.value),
    )
  }, [variants, options, selected])

  // Loading and not-found are different answers and must look different: a
  // shopper on a slow connection should not be told their product is gone.
  if (!product && fetchState === 'loading') {
    return (
      <section {...sharedRootProps(attributes)} className="section">
        <div className="container">
          <p className="u-text-muted" role="status" aria-live="polite">
            {t('product.loading')}
          </p>
        </div>
      </section>
    )
  }

  if (!product) {
    return (
      <section {...sharedRootProps(attributes)} className="section">
        <div className="container">
          <div className="not-found">
            {/* This state IS the page: without an h1 the product route had no
                page heading at all whenever the handle did not resolve. */}
            <h1>{t('product.notFound.title')}</h1>
            <p className="u-text-muted">{t('product.notFound.sub')}</p>
            <Button label={t('common.shopCollection')} link="/collections/all" variant="primary" />
          </div>
        </div>
      </section>
    )
  }

  // `product` is non-null from here. Bind it so the closures below (handleAdd)
  // keep the narrowing — TypeScript widens it back inside a function that could
  // be invoked after this render.
  const current: Product = product

  const displayPrice = selectedVariant?.price ?? current.price
  const variantImage = selectedVariant?.image ?? product.featuredImage
  /**
   * The REAL gallery. This used to be `[variantImage, variantImage,
   * variantImage, variantImage]` — the same photo repeated four times to make
   * a thumbnail strip look populated. Every store on the theme showed four
   * identical thumbnails and no shopper could ever see a second angle.
   *
   * `media` carries video; `images` is the image-only fallback for products
   * fetched before media landed; `featuredImage` is the boot-time card image
   * that is all we have until `fetchProduct()` resolves.
   */
  const gallery: { url: string; altText?: string; type?: 'image' | 'video' }[] = (() => {
    const media = product.media ?? []
    if (media.length > 0) {
      return media.flatMap((m) => {
        const src = m.type === 'video' ? m.sources?.[0]?.url : m.image?.url
        if (!src) return []
        const alt = m.alt ?? product.title
        return [{ url: src, altText: alt, type: m.type === 'video' ? ('video' as const) : ('image' as const) }]
      })
    }
    const imgs = product.images ?? []
    if (imgs.length > 0) return imgs.map((i) => ({ url: i.url, altText: i.altText ?? product.title }))
    return variantImage ? [{ url: variantImage.url, altText: variantImage.altText ?? product.title }] : []
  })()

  // Has the variant list actually arrived? On live data the bootstrap card
  // carries no variants, so "no options" and "options not loaded yet" look
  // identical until `fetchProduct` resolves.
  const variantsResolved = !isLive || fetchState === 'done'
  const hasOptions = options.length > 0

  /**
   * What the buy button is allowed to do right now.
   *
   *  pending      — still resolving variants; do not let anyone buy a guess
   *  unavailable  — the chosen combination does not exist, or is sold out
   *  ready        — a concrete, purchasable merchandise id
   *
   * The rule that matters: when a product HAS options, only a variant whose
   * `selectedOptions` match what is on screen may be added. Falling back to
   * `product.variantId` (the product's first available variant) meant a
   * shopper could pick "Red / XL", find no such variant exists, and still add
   * "Black / S" to their cart at the price shown for Red / XL.
   */
  const purchase: { state: 'pending' | 'unavailable' | 'ready'; variantId?: string } = (() => {
    if (!variantsResolved) return { state: 'pending' }
    if (hasOptions) {
      if (!selectedVariant) return { state: 'unavailable' }
      if (!selectedVariant.availableForSale) return { state: 'unavailable' }
      return { state: 'ready', variantId: selectedVariant.id }
    }
    // Single-variant product. `product.variantId` is this product's own
    // `firstAvailableVariant.id` from the bootstrap card — correct here,
    // because there is exactly one variant to choose.
    const single = selectedVariant?.id ?? product.variantId
    const available = selectedVariant
      ? selectedVariant.availableForSale
      : product.availableForSale !== false
    if (!available) return { state: 'unavailable' }
    // Mock (editor/offline): a stable pseudo id keyed by handle so the
    // in-memory cart still works without a backend. Never on live data —
    // posting `mock:<handle>` to a real cart would fail at checkout.
    const id = single ?? (!isLive ? `mock:${product.handle}` : undefined)
    return id ? { state: 'ready', variantId: id } : { state: 'unavailable' }
  })()

  const variantId = purchase.variantId

  const variantTitle =
    selectedVariant?.title && selectedVariant.title !== DEFAULT_VARIANT_TITLE
      ? selectedVariant.title
      : undefined

  const soldOut = purchase.state === 'unavailable'
  // The concrete variant a shopper can ask to be told about: a real variant that exists and is out of stock
  // (never a combination that does not exist, and never while variants are still loading).
  const notifyVariantId: string | undefined =
    purchase.state === 'unavailable'
      ? selectedVariant
        ? selectedVariant.availableForSale === false
          ? selectedVariant.id
          : undefined
        : !hasOptions && product.availableForSale === false
          ? product.variantId
          : undefined
      : undefined

  // Stock copy follows the theme's language; a merchant's own label is shown as written.
  const buttonLabel = localizedCopy(attributes.buttonLabel, 'Add to cart', 'product.addToCart', t)
  // `quantity: show|hide` was the interim name; the design's key is
  // `showQuantity`. Both are read so a saved value is never lost.
  const showQuantity = attributes.showQuantity !== false && attributes.quantity !== 'hide'
  const galleryLayout = (attributes.galleryLayout as 'thumbnails-left' | 'thumbnails-below' | 'stacked') ?? 'thumbnails-left'
  const mediaRatio = (attributes.mediaRatio as 'adapt' | 'portrait' | 'square') ?? 'portrait'
  const enableZoom = attributes.enableZoom !== false
  const stickyPurchase = (attributes.stickyPurchase as string) ?? 'both'
  const variantStyle = (attributes.variantStyle as string) ?? 'auto'
  const showVendor = attributes.showVendor === true
  const showSku = attributes.showSku === true
  const showInventory = (attributes.showInventory as 'always' | 'low-only' | 'never') ?? 'low-only'
  const lowStockThreshold = (attributes.lowStockThreshold as number) ?? 5
  const showAccordion = attributes.accordionItems !== false
  const buyLabel =
    purchase.state === 'pending'
      ? t('product.loading')
      : purchase.state === 'unavailable'
        ? hasOptions && !selectedVariant
          ? t('product.unavailableCombination')
          : t('product.soldOut')
        : adding
          ? t('product.adding')
          : buttonLabel

  async function handleAdd(): Promise<void> {
    if (!variantId || adding) return
    setAdding(true)
    setAddError(null)
    try {
      const added = await cart.add({
        variantId,
        quantity,
        product: {
          title: current.title,
          price: displayPrice,
          image: variantImage ?? null,
          handle: current.handle,
          ...(variantTitle ? { variantTitle } : {}),
        },
      })
      // `add` resolves false when the backend refused the line (sold out, a
      // quantity rule, an expired cart). Treating that as success emitted a
      // false PRODUCT_ADDED_TO_CART and opened a drawer without the item.
      if (!added) throw new Error('cart refused the line')
      getAnalytics().track('PRODUCT_ADDED_TO_CART', {
        productId: current.id,
        variantId,
        title: current.title,
        handle: current.handle,
        price: displayPrice,
        quantity,
        ...(variantTitle ? { variantTitle } : {}),
      })
      openOverlay('cart')
    } catch (err: unknown) {
      // A failed add used to be invisible: `try/finally` with no `catch` let
      // the rejection escape as an unhandled promise, the spinner stopped, and
      // the shopper saw a button that looked like it had worked.
      // eslint-disable-next-line no-console
      console.error('[nova] add to cart failed:', err)
      setAddError(t('product.addFailed'))
    } finally {
      setAdding(false)
    }
  }

  const hasBlocks = Children.count(children) > 0
  /**
   * The design distinguishes SOLD OUT from UNAVAILABLE, and the old picker
   * conflated them into one flat button list:
   *   sold-out    — a real variant exists for this value but has no stock
   *   unavailable — no variant exists with this value alongside the other
   *                 selections, so it was never a purchasable combination
   * Sold out stays selectable (it is how a shopper reaches "notify me");
   * unavailable does not.
   */
  const optionValueState = (optionName: string, value: string): 'available' | 'sold-out' | 'unavailable' => {
    // Variants matching this value AND every OTHER currently-selected option.
    const candidates = variants.filter((v) => {
      const opts = v.selectedOptions ?? []
      if (!opts.some((o) => o.name === optionName && o.value === value)) return false
      return opts.every((o) => o.name === optionName || !selected[o.name] || selected[o.name] === o.value)
    })
    if (candidates.length === 0) return 'unavailable'
    return candidates.some((v) => v.availableForSale) ? 'available' : 'sold-out'
  }

  const ctx: ProductContextValue = {
    product,
    descriptionHtml,
    options,
    variants,
    selected,
    setOption: (name, value) => setSelected((s) => ({ ...s, [name]: value })),
    optionValueState,
    selectedVariant,
    displayPrice,
    variantImage,
    soldOut,
    quantity,
    setQuantity,
    adding,
    addError,
    canAdd: purchase.state === 'ready',
    add: handleAdd,
  }

  return (
    <ProductProvider value={ctx}>
    <section {...sharedRootProps(attributes)} className="section">
      <div className="container">
        <Breadcrumb
          trail={[
            { label: t('nav.home'), href: '/' },
            ...(product.collections?.[0]
              ? [{ label: product.collections[0].title, href: `/collections/${product.collections[0].handle}` }]
              : []),
            { label: product.title },
          ]}
        />

        <div className="product-details" data-sticky={stickyPurchase}>
          <div className="product-details__gallery">
            <ProductGallery
              media={gallery}
              layout={galleryLayout}
              ratio={mediaRatio}
              enableZoom={enableZoom}
              activeIndex={activeIdx}
              onActiveIndexChange={setActiveIdx}
            />
          </div>

          <div className="product-details__body">
            {hasBlocks ? children : (
            <>
            <div className="stack stack--sm">
              {showVendor && product.vendor && <span className="eyebrow">{product.vendor}</span>}
              <h1 className="product-details__title">{product.title}</h1>
              <div className="product-details__price">
                <Price value={displayPrice} size="pdp" showSave />
              </div>
              {showSku && selectedVariant?.sku && (
                <p className="product-details__sku">{t('product.sku')} {selectedVariant.sku}</p>
              )}
            </div>

            {/* Real option pickers (Size, Color…) — rendered from the product's
                option set once the full product loads. Single-variant products
                (no options) skip this entirely. */}
            <VariantPicker
              options={options.map((opt) => ({
                name: opt.name,
                ...(variantStyle === 'auto' ? {} : { style: variantStyle as 'buttons' | 'swatches' | 'select' }),
                values: opt.values.map((value) => ({
                  value,
                  state: optionValueState(opt.name, value),
                })),
              }))}
              selected={selected}
              onSelect={(name, value) => setSelected((cur) => ({ ...cur, [name]: value }))}
            />

            <div className="stack stack--sm" style={{ marginTop: 'var(--space-3)' }}>
              {/* Quantity and Add to cart sit on ONE row, per the design: the
                  stepper keeps its natural width and the buy button takes the
                  rest. Stacking them pushed the primary action below the fold
                  on a short viewport. */}
              <div className="product-details__buy">
                {showQuantity && (
                  <QuantityStepper
                    value={quantity}
                    onChange={setQuantity}
                    label={`${t('product.quantityFor')} ${product.title}`}
                  />
                )}
                <Button
                  label={buyLabel}
                  onClick={() => void handleAdd()}
                  /* `pending` and `adding` are IN FLIGHT, not unavailable. As a
                     disabled button they rendered their label at 40% opacity,
                     which fails contrast — the design's loading state exists
                     for exactly this: hold the width, hide the label, spin. */
                  loading={purchase.state === 'pending' || adding}
                  disabled={purchase.state === 'unavailable'}
                  variant="primary"
                  size="lg"
                  fullWidth
                />
              </div>
              {notifyVariantId && <NotifyMe variantId={notifyVariantId} />}
              <InventoryStatus
                available={!soldOut}
                {...(typeof selectedVariant?.inventoryQuantity === 'number'
                  ? { quantity: selectedVariant.inventoryQuantity }
                  : {})}
                threshold={lowStockThreshold}
                show={showInventory}
              />
              {addError && (
                <p className="u-text-error" role="alert">
                  {addError}{' '}
                  <button type="button" className="btn btn--link" onClick={() => void handleAdd()}>
                    {t('product.retry')}
                  </button>
                </p>
              )}
            </div>

            {/* Description comes after the purchase decision, not before it. */}
            <ProductDescription attributes={{}} />

            {/* Materials / shipping come from the merchant's own metafields
                (Dashboard → Products → Metafields, `custom.materials` /
                `custom.shipping`) or they do not render at all. The theme used
                to hardcode "100% organic cotton" and "Free shipping on orders
                over $50. 30-day returns" here — claims shown to every shopper
                of every store on the theme, true for approximately none of
                them and legally the merchant's to make. */}
            {showAccordion && (
              <>
                <ProductFact
                  label={t('product.materials')}
                  body={productFact(product, 'custom.materials')}
                  first
                />
                <ProductFact label={t('product.shipping')} body={productFact(product, 'custom.shipping')} />
              </>
            )}
            </>
            )}
          </div>
        </div>
      </div>
    </section>
    </ProductProvider>
  )
}

export default defineSection({
  name: 'product-details',
  role: 'section',
  requiresContext: ['product'],
  title: 'Product details',
  description: 'Gallery, price, variants and Add to cart for the current product.',
  category: 'commerce',
  icon: '◉',
  attributes: withShared({
    product: { type: 'product', label: 'Product (preview only — URL :handle is canonical)' },

    // ── Media ───────────────────────────────────────────────────────────
    galleryLayout: {
      type: 'select',
      default: 'thumbnails-left',
      label: 'Gallery layout',
      options: [
        { value: 'thumbnails-left', label: 'Thumbnails left' },
        { value: 'thumbnails-below', label: 'Thumbnails below' },
        { value: 'stacked', label: 'Stacked' },
      ],
    },
    mediaRatio: {
      type: 'select',
      default: 'portrait',
      label: 'Media shape',
      options: [
        { value: 'adapt', label: 'Adapt to image' },
        { value: 'portrait', label: 'Portrait' },
        { value: 'square', label: 'Square' },
      ],
    },
    enableZoom: { type: 'boolean', default: true, label: 'Enable image zoom' },

    // ── Layout ──────────────────────────────────────────────────────────
    stickyPurchase: {
      type: 'select',
      default: 'both',
      label: 'Sticky purchase',
      options: [
        { value: 'both', label: 'Desktop column and mobile bar' },
        { value: 'desktop', label: 'Desktop column only' },
        { value: 'mobile', label: 'Mobile bar only' },
        { value: 'none', label: 'Never' },
      ],
    },

    // ── Content ─────────────────────────────────────────────────────────
    variantStyle: {
      type: 'select',
      default: 'auto',
      label: 'Variant control',
      info: 'Auto uses swatches for colour and buttons elsewhere, switching to a dropdown past 14 values.',
      options: [
        { value: 'auto', label: 'Automatic' },
        { value: 'buttons', label: 'Buttons' },
        { value: 'swatches', label: 'Swatches' },
        { value: 'select', label: 'Dropdown' },
      ],
    },
    showVendor: { type: 'boolean', default: false, label: 'Show vendor' },
    showSku: { type: 'boolean', default: false, label: 'Show SKU' },
    showInventory: {
      type: 'select',
      default: 'low-only',
      label: 'Inventory status',
      options: [
        { value: 'always', label: 'Always' },
        { value: 'low-only', label: 'Only when low' },
        { value: 'never', label: 'Never' },
      ],
    },
    lowStockThreshold: {
      type: 'range',
      default: 5,
      min: 1,
      max: 20,
      step: 1,
      label: 'Low stock threshold',
      visible_if: "{{ section.settings.showInventory != 'never' }}",
    },
    showQuantity: { type: 'boolean', default: true, label: 'Show quantity selector' },
    accordionItems: {
      type: 'boolean',
      default: true,
      label: 'Show additional information rows',
      info: 'Rows come from `accordion` blocks, or from the product metafields the theme reads.',
    },
    buttonLabel: { type: 'text', default: 'Add to cart', label: 'Add to cart label' },
  }),
  // Block-composed PDP (standard): add blocks into the info column to build
  // the product page from parts. With no blocks, the default layout renders.
  allowedBlocks: [
    'product-title', 'product-price', 'variant-picker', 'swatches', 'quantity',
    'add-to-cart', 'product-description', 'product-sku', 'product-inventory',
    'text', 'heading', 'button', 'image', 'icon', 'spacer', 'accordion', 'social-links', 'payment-icons',
  ],
  presets: [
    {
      blocks: [
        { type: 'product-title', settings: {} },
        { type: 'product-price', settings: {} },
        { type: 'variant-picker', settings: {} },
        { type: 'quantity', settings: {} },
        { type: 'add-to-cart', settings: {} },
        { type: 'product-description', settings: {} },
      ],
    },
  ],
  component: ProductDetails,
})
