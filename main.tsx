// Theme entry — picks the page template from window.location.pathname AND
// chooses live vs mock data based on Vite build-time env vars:
//
//   VITE_TANQORY_BACKEND          → https://api-do-sgp1.tanqory.com (prod)
//                                   https://dev-api-do-sgp1.tanqory.com (dev)
//   VITE_TANQORY_STORE_ID         → the store's UUID
//   VITE_TANQORY_STOREFRONT_TOKEN → publishable storefront key (safe to ship)
//
// Either ALL three are set (→ createLiveData) or none are (→ createMockData
// with the bundled lib/collections.json fixtures). Falling back to mocks
// keeps the editor preview + offline dev working unchanged.

import {
  mount,
  createLiveData,
  createLiveDataFromSnapshot,
  createMockData,
  createAnalytics,
  hasConsent,
  setConsentMode,
  consentModeFromShop,
  type DataApi,
  type LiveDataOptions,
  type MountOptions,
} from './lib/tanqory/index'
import { apiBase } from './lib/api-base'
import { createSsgConsentGate } from './lib/tanqory/ssg-consent-gate'
import { applyHead, computeHead, headFrom, shopNameOf } from './lib/head'
import { emitRoute } from './lib/route-analytics'
import {
  detailHandles,
  matchRoute,
  resolvePageTemplate,
  resolveTemplate,
  variantOf as variantOfBase,
} from './lib/routes'
import { isEditorPreview, isMockDataAllowed } from './lib/runtime'
import { studioOrigins } from './lib/live-settings'
import { localeStrings, themeLocaleOf } from './lib/theme-locale'
import './assets/styles.css'
import mockCollections from './lib/collections.json'
import bundledSettings from './config/settings.json'

// All bundled UI-string maps, e.g. { './locales/en.json': {default:{…}}, './locales/th.json': … }.
// The active locale is chosen at boot from ?locale= / localStorage / the theme's own.
const localeModules = import.meta.glob('./locales/*.json', { eager: true }) as Record<
  string,
  { default: Record<string, string> }
>
const localeMaps: Record<string, Record<string, string>> = Object.fromEntries(
  Object.entries(localeModules).map(([path, mod]) => [
    path.match(/\/([^/]+)\.json$/)?.[1] ?? 'en',
    mod.default,
  ]),
)
/**
 * The theme's own language (`config/settings.json` `locale`, blank = English):
 * the string map a visitor sees before choosing one, and the one the SSG bakes.
 * A theme built for a Thai shop draws its account menu, contact form and policy
 * headings in Thai (lib/theme-locale.ts).
 */
const settings: Record<string, unknown> = { ...(bundledSettings as Record<string, unknown>), ...(typeof window !== 'undefined' ? window.__TQ_CONTENT__?.settings ?? {} : {}) }

const DEFAULT_LOCALE = themeLocaleOf(
  (settings as { locale?: unknown }).locale,
  Object.keys(localeMaps),
)

const env = import.meta.env as ImportMetaEnv & {
  VITE_TANQORY_BACKEND?: string
  VITE_TANQORY_STORE_ID?: string
  VITE_TANQORY_STOREFRONT_TOKEN?: string
}

const page =
  typeof window !== 'undefined' ? resolveTemplate(window.location.pathname) : 'index'

// The store's content revision, embedded by entry.ts (spec v1). When present it
// replaces the theme's bundled starter templates/groups/settings, so the client
// hydrates exactly what the server rendered — and the theme never needs a
// rebuild for a content or settings change.
declare global {
  interface Window {
    __TQ_CONTENT__?: { revision: string | null; templates: Record<string, unknown>; groups: Record<string, unknown>; settings: Record<string, unknown> }
  }
}
const revisionContent = typeof window !== 'undefined' ? window.__TQ_CONTENT__ : undefined
const asGlob = (map: Record<string, unknown> | undefined, dir: string) =>
  map && Object.keys(map).length ? Object.fromEntries(Object.entries(map).map(([n, d]) => [`./${dir}/${n}.json`, { default: d }])) : null

// Read the template glob once so both the mount and the variant check share it.
const templateModules = asGlob(revisionContent?.templates, 'templates') ?? import.meta.glob('./templates/*.json', { eager: true })
const groupModules = asGlob(revisionContent?.groups, 'groups') ?? import.meta.glob('./groups/*.json', { eager: true })

/** True when `templates/<name>.json` exists in this theme. */
function templateExists(name: string): boolean {
  return Object.keys(templateModules).some((k) => k.endsWith(`/${name}.json`))
}

/** `<type>.<suffix>` when the variant file exists, else the default `<type>`. */
function variantOf(base: string, suffix: string | null | undefined): string {
  return variantOfBase(base, suffix, templateExists)
}

// Settings → Brand fonts (store#510) are no longer applied here, client-only,
// after hydration. The layout's ThemeSettingsProvider (components/ThemeSettings.tsx)
// resolves the fonts — Theme settings first, then Settings → Brand — into the
// same --font-display / --font-body variables inside the rendered tree, so the
// SSG prerender carries them too and a theme font can override the brand one.

/**
 * Pick the country (ISO 3166 alpha-2) for this page load:
 *
 *   URL ?country=SG  →  localStorage tq-country  →  null (no Market header,
 *                                                    backend uses store base)
 *
 * Mirrors the precedence the LocaleSwitch component uses in layout.tsx so
 * that what the user sees in the picker stays in sync with what GraphQL
 * actually returns. Runs at boot; switching country in the picker writes
 * to BOTH URL + localStorage and reloads the page.
 */
function resolveCountry(): string | undefined {
  if (typeof window === 'undefined') return undefined
  const fromUrl = new URLSearchParams(window.location.search).get('country')
  if (fromUrl && /^[A-Za-z]{2}$/.test(fromUrl)) return fromUrl.toUpperCase()
  try {
    const stored = window.localStorage.getItem('tq-country')
    if (stored && /^[A-Za-z]{2}$/.test(stored)) return stored.toUpperCase()
  } catch {
    /* private mode etc. */
  }
  return undefined
}

/**
 * Active UI locale code — URL ?locale= → localStorage `tq-locale` → default.
 * Mirrors resolveCountry + the LocaleSwitch precedence, and only accepts a code
 * we actually bundle a string map for (else the switcher would blank the UI).
 */
function resolveLocale(): string {
  if (typeof window === 'undefined') return DEFAULT_LOCALE
  const norm = (v: string | null): string | null =>
    v && /^[A-Za-z]{2}(-[A-Za-z]{2})?$/.test(v) ? v.toLowerCase() : null
  const u = norm(new URLSearchParams(window.location.search).get('locale'))
  if (u && localeMaps[u]) return u
  try {
    const s = norm(window.localStorage.getItem('tq-locale'))
    if (s && localeMaps[s]) return s
  } catch {
    /* private mode etc. */
  }
  return DEFAULT_LOCALE
}

/** The active locale's strings, laid over English so a partially-translated
 *  locale shows English (not raw keys). */
const activeLocale = localeStrings(resolveLocale(), localeMaps)

// The page's language for the browser, screen readers and search engines.
if (typeof document !== 'undefined') document.documentElement.lang = resolveLocale()

/** The locale code to send to the backend (X-Tanqory-Lang) for content
 *  translation — only when non-default, so default-language requests skip the
 *  translation overlay entirely. */
function localeHeader(): string | undefined {
  const code = resolveLocale()
  return code !== DEFAULT_LOCALE ? code : undefined
}

/**
 * Boot the data layer.
 *
 * A CONFIGURED storefront (backend + store id present) gets live data or an
 * error — never fixtures. The previous behaviour caught the failure and
 * returned `createMockData(mockCollections)`, which put "Example product ·
 * $99" with a working Add to cart button on a real shop whenever its cell was
 * unreachable: a shopper cannot tell that page from the real one, and neither
 * can a crawler.
 *
 * Mock data stays the right answer for an UNCONFIGURED build (offline `pnpm
 * dev`) and inside the editor preview, where there may be no store attached at
 * all. `isMockDataAllowed()` is the single place that decides.
 */
async function bootData(): Promise<{ data: DataApi; mode: 'live' | 'mock' } | { error: Error }> {
  const { VITE_TANQORY_BACKEND, VITE_TANQORY_STORE_ID, VITE_TANQORY_STOREFRONT_TOKEN } = env
  if (VITE_TANQORY_BACKEND && VITE_TANQORY_STORE_ID) {
    try {
      const data = await createLiveData({
        endpoint: apiBase(VITE_TANQORY_BACKEND),
        storeId: VITE_TANQORY_STORE_ID,
        token: VITE_TANQORY_STOREFRONT_TOKEN,
        country: resolveCountry(),
        locale: localeHeader(),
        ...(typeof window !== 'undefined' ? detailHandles(window.location.pathname) : {}),
      })
      return { data, mode: 'live' }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[nova] live data fetch failed:', err)
      if (!isMockDataAllowed()) {
        return { error: err instanceof Error ? err : new Error(String(err)) }
      }
      // Editor preview on a configured build: fixtures are acceptable here
      // because nobody can buy anything, but say so in the console.
      // eslint-disable-next-line no-console
      console.warn('[nova] editor preview — falling back to mock fixtures')
    }
  }
  return { data: createMockData(mockCollections), mode: 'mock' }
}

/**
 * Last-resort shopper-visible failure. Rendered without React (the tree never
 * mounted) and without fixtures, so nothing on screen can be mistaken for the
 * merchant's catalogue.
 */
function renderBootError(err: Error): void {
  // eslint-disable-next-line no-console
  console.error('[nova] storefront could not load:', err)
  const root = document.getElementById('root')
  if (!root) return
  const t = (key: string, fallback: string): string => activeLocale[key] ?? fallback
  root.textContent = ''
  const wrap = document.createElement('div')
  wrap.setAttribute('role', 'alert')
  wrap.style.cssText =
    'min-height:60vh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1rem;padding:2rem;text-align:center;font-family:system-ui,sans-serif'
  const h = document.createElement('h1')
  h.textContent = t('error.storefront.title', 'This store is temporarily unavailable')
  h.style.cssText = 'font-size:1.25rem;margin:0'
  const p = document.createElement('p')
  p.textContent = t('error.storefront.sub', 'Please try again in a moment.')
  p.style.cssText = 'margin:0;opacity:.7'
  const retry = document.createElement('button')
  retry.type = 'button'
  retry.textContent = t('error.storefront.retry', 'Reload')
  retry.style.cssText =
    'padding:.625rem 1.25rem;border-radius:.5rem;border:1px solid currentColor;background:transparent;cursor:pointer;font:inherit'
  retry.addEventListener('click', () => window.location.reload())
  wrap.append(h, p, retry)
  root.appendChild(wrap)
}

/** The SSG data snapshot the prerender step embedded into the page (see
 *  entry-server.tsx) — present only on prerendered storefront HTML. */
declare global {
  interface Window {
    __TQ_STATE__?: { page?: string; bootstrap?: unknown }
  }
}

const baseMountOptions = (data: DataApi): MountOptions => ({
  sections: import.meta.glob('./sections/*.tsx', { eager: true }),
  pages: templateModules,
  // Shared header/footer. A template binds them with `groups: { header, footer }`;
  // the kit's `resolvePage` — the same function the editor and the AI tools
  // use — turns template + groups into the section list that renders.
  groups: groupModules,
  shell: import.meta.glob('./layouts/*.tsx', { eager: true }),
  data,
  settings,
  locale: activeLocale,
  page,
  // The studio hosts allowed to drive the editor canvas — the same list the
  // live theme-settings preview trusts (components/ThemeSettings.tsx).
  previewOrigins: studioOrigins(
    (env as { VITE_TQ_STUDIO_ORIGINS?: string }).VITE_TQ_STUDIO_ORIGINS,
    Boolean(env.DEV),
  ),
})

const ssgState = typeof window !== 'undefined' ? window.__TQ_STATE__ : undefined
const { VITE_TANQORY_BACKEND, VITE_TANQORY_STORE_ID, VITE_TANQORY_STOREFRONT_TOKEN } = env

// Storefront analytics — ONLY on the real published storefront (live data, not
// the editor/preview plane). page_viewed events create sessions + device rows,
// which power the merchant's Analytics/Reports/Live View. Beacons go same-origin
// to /api/v1/analytics/events/batch (the edge worker forwards to the cell).
//
// This ARMS theme-kit's analytics singleton; everything that emits afterwards —
// including the SPA router in layout.tsx — reads it back with `getAnalytics()`,
// which is a no-op until this runs. That is what keeps preview and mock builds
// silent without every call site repeating the check.
if (VITE_TANQORY_BACKEND && VITE_TANQORY_STORE_ID && !isEditorPreview()) {
  createAnalytics({ storeId: VITE_TANQORY_STORE_ID, consent: () => hasConsent('analytics') })
}

/** Set the consent gate from shop data BEFORE the first pageViewed, so a store
 *  whose buyer needs consent first doesn't emit until the shopper has consented. */
function armConsent(data: DataApi): void {
  // The SERVER's per-buyer verdict (jurisdiction + merchant toggle); missing/unknown ⇒ OPT_IN, never permissive.
  setConsentMode(consentModeFromShop(data.shop))
}

/** Emit the route events for the CURRENT url. Thin wrapper so both the boot
 *  path and the SPA router in layout.tsx go through one implementation. */
function emitRouteEvents(data: DataApi): void {
  emitRoute({ pathname: window.location.pathname, search: window.location.search }, data)
}

if (
  ssgState?.bootstrap &&
  VITE_TANQORY_BACKEND &&
  VITE_TANQORY_STORE_ID &&
  page === (ssgState.page ?? 'index') &&
  // SSG bakes the theme's DEFAULT locale's strings; a different ?locale= would render
  // different useT() text than the server did → hydration mismatch (#418). Those
  // visitors take the client-render path below instead.
  resolveLocale() === DEFAULT_LOCALE
) {
  // DETERMINISTIC HYDRATION: rebuild the DataApi synchronously from the exact
  // bootstrap the server rendered with — the first client render matches the
  // SSG markup byte-for-byte (no network, no drift, no React #418/#425). Fresh
  // data is fetched AFTER hydration and reconciled in place (SWR).
  const liveOpts: LiveDataOptions = {
    endpoint: apiBase(VITE_TANQORY_BACKEND),
    storeId: VITE_TANQORY_STORE_ID,
    token: VITE_TANQORY_STOREFRONT_TOKEN,
    country: resolveCountry(),
    locale: localeHeader(),
  }
  const data = createLiveDataFromSnapshot(ssgState.bootstrap, liveOpts)
  // CONSENT: the snapshot was built for the BUILD machine's location and must never decide a buyer's consent (S8 #2549
  // B-1). Everything stays closed (OPT_IN) and nothing is emitted until the LIVE per-request answer arrives.
  const consentGate = createSsgConsentGate(emitRouteEvents)
  mount({
    ...baseMountOptions(data),
    revalidate: async () => {
      try {
        const live = await createLiveData({ ...liveOpts, ...detailHandles(window.location.pathname) })
        consentGate.onLive(live)
        return live
      } catch {
        return null // keep the snapshot data — a failed refresh must not blank the page (consent stays closed)
      }
    },
  })
  applyHead(computeHead(window.location.pathname, data, settings))
} else {
  // No usable snapshot (mock build, or this route isn't the prerendered page).
  // Fetch first, then CLIENT-render: any SSG markup in #root belongs to a
  // different page/data, and hydrating against it would mismatch (#418). Because
  // this path always client-renders, choosing a `/pages/<handle>` template
  // variant here is safe (no prerendered markup to mismatch).
  void bootData().then(async (result) => {
    if ('error' in result) {
      renderBootError(result.error)
      return
    }
    const { data } = result
    const pathname = window.location.pathname
    let finalPage = resolvePageTemplate(pathname, data, templateExists)
    let head = computeHead(pathname, data, settings)
    // Blog + article are fetched on demand (not in the sync bootstrap), so
    // resolve their template variant + SEO head asynchronously before mount.
    const shop = data.shop as { name?: string } | undefined
    const shopName = shopNameOf((settings as { shopName?: unknown }).shopName, shop?.name)
    const route = matchRoute(pathname)
    const am =
      route.resource === 'article' && route.blogHandle && route.handle
        ? { blogHandle: route.blogHandle, articleHandle: route.handle }
        : undefined
    const bh = route.resource === 'blog' ? route.handle : undefined
    if (page === 'article' && am && data.articleByHandle) {
      const a = await data.articleByHandle(am.blogHandle, am.articleHandle)
      if (a) {
        finalPage = variantOf('article', a.templateSuffix)
        head = headFrom(a.seo, a.title, shopName, a.excerpt)
      }
    } else if (page === 'blog' && bh && data.blogByHandle) {
      const b = await data.blogByHandle(bh)
      if (b) {
        finalPage = variantOf('blog', b.templateSuffix)
        head = headFrom(b.seo, b.title, shopName)
      }
    }
    mount({ ...baseMountOptions(data), page: finalPage, forceClientRender: true })
    applyHead(head)
    armConsent(data)
    emitRouteEvents(data)
  })
}
