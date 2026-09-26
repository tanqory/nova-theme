/**
 * Cookie-consent state — the single source of truth the storefront consults
 * before running any tracking (analytics beacon, marketing pixels), so the
 * shopper's choice is actually ENFORCED.
 *
 * Model: two purposes, `analytics` + `marketing`. The decision persists in
 * localStorage (`tq-cookie-consent`) and a `tq-consent-change` event lets
 * subscribers (pixels, analytics) react live to Accept/Decline/Manage.
 *
 * DENY-UNTIL-DECIDED IS THE DEFAULT (journey-matrix 0.5). This gate used to start
 * "no banner required → everything allowed", set from the MERCHANT's toggle, so an EU
 * shopper in a shop whose owner never enabled the banner was tracked with no consent,
 * and so was everyone before shop data arrived. The mode is now decided by the SERVER
 * from the shopper's jurisdiction (`shop.cookieBanner.mode`) and the merchant's toggle
 * can only add protection. Until that verdict arrives the mode is OPT_IN.
 *
 * Gate semantics (`hasConsent`):
 *   - GPC signalled → MARKETING is denied in every mode, even after an accept-all (analytics unaffected).
 *   - mode NONE    (no consent statute applies to this shopper) → allowed.
 *   - mode OPT_IN  + undecided → denied (GDPR/ePrivacy/UK/CH/LGPD/PDPA/Quebec, and unknown location).
 *   - mode OPT_OUT + undecided → allowed, except MARKETING when the shopper sends
 *     Global Privacy Control (a decline without a click). US opt-out states.
 *   - decided → the stored purpose flag, in every mode.
 */
const KEY = 'tq-cookie-consent'
const EVENT = 'tq-consent-change'

export interface Consent {
  analytics: boolean
  marketing: boolean
}

export type ConsentMode = 'OPT_IN' | 'OPT_OUT' | 'NONE'

// Fail closed until the theme has the shop's verdict.
let mode: ConsentMode = 'OPT_IN'
/**
 * True once an AUTHORITATIVE verdict for THIS shopper has set the mode (the LIVE per-request answer). A snapshot or a
 * default never arms it. The banner is shown only when armed — so a not-yet-armed gate is closed AND silent.
 */
let armed = false
const MODE_EVENT = 'tq-consent-mode'

const announce = (): void => {
  try {
    window.dispatchEvent(new CustomEvent(MODE_EVENT))
  } catch {
    /* SSR / no window */
  }
}

/** Set the mode from an authoritative (live) verdict. The ONLY way the gate opens — components must not call it. */
export function setConsentMode(m: ConsentMode): void {
  mode = m
  armed = true
  announce()
}
/** Force the gate closed (OPT_IN) and un-armed — the SSG boot, until the live answer arrives. */
export function holdConsentClosed(): void {
  mode = 'OPT_IN'
  armed = false
  announce()
}
export function getConsentMode(): ConsentMode {
  return mode
}
export function isConsentArmed(): boolean {
  return armed
}
/** Subscribe to mode/armed changes (banner display); returns an unsubscribe fn. */
export function onConsentModeChange(cb: () => void): () => void {
  try {
    window.addEventListener(MODE_EVENT, cb)
    return () => window.removeEventListener(MODE_EVENT, cb)
  } catch {
    return () => {}
  }
}
/** Back-compat for callers that only know a boolean: true → OPT_IN, false → NONE. */
export function setBannerRequired(v: boolean): void {
  setConsentMode(v ? 'OPT_IN' : 'NONE')
}
export function isBannerRequired(): boolean {
  return mode !== 'NONE'
}

/**
 * The mode for a loaded shop. The server's `cookieBanner.mode` is authoritative; an older API that only sends `enabled`
 * is read as before (enabled → OPT_IN); anything missing or unrecognised is OPT_IN, never permissive.
 */
export function consentModeFromShop(shop: unknown): ConsentMode {
  const cb = (shop as { cookieBanner?: { enabled?: unknown; mode?: unknown } | null } | undefined)
    ?.cookieBanner
  if (!cb || typeof cb !== 'object') return 'OPT_IN'
  if (cb.mode === 'OPT_IN' || cb.mode === 'OPT_OUT' || cb.mode === 'NONE') return cb.mode
  if (cb.mode !== undefined && cb.mode !== null) return 'OPT_IN'
  return cb.enabled ? 'OPT_IN' : 'NONE'
}

function gpcSignalled(): boolean {
  try {
    return (navigator as { globalPrivacyControl?: boolean }).globalPrivacyControl === true
  } catch {
    return false
  }
}

/** The stored decision, or null when the shopper hasn't chosen yet. */
export function getConsent(): Consent | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    if (raw === 'accepted') return { analytics: true, marketing: true }
    if (raw === 'declined') return { analytics: false, marketing: false }
    const p = JSON.parse(raw) as Partial<Consent>
    return { analytics: !!p.analytics, marketing: !!p.marketing }
  } catch {
    return null
  }
}

export function hasDecided(): boolean {
  return getConsent() !== null
}

export function setConsent(c: Consent): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(c))
  } catch {
    /* private mode — the choice just won't persist across reloads */
  }
  try {
    window.dispatchEvent(new CustomEvent(EVENT, { detail: c }))
  } catch {
    /* SSR / no window */
  }
}

/** True when `purpose` may run right now (see gate semantics above). */
export function hasConsent(purpose: keyof Consent): boolean {
  // Global Privacy Control is honoured EVERYWHERE and beats even a stored "accept all": marketing is never allowed while
  // the browser signals GPC (conservative reading, matches admin-api's "GPC always wins"; analytics is unaffected).
  if (purpose === 'marketing' && gpcSignalled()) return false
  const c = getConsent()
  // An explicit decision on this site beats every default.
  if (c) return c[purpose]
  if (mode === 'NONE' || mode === 'OPT_OUT') return true
  return false
}

/** Subscribe to consent changes; returns an unsubscribe fn. */
export function onConsentChange(cb: (c: Consent) => void): () => void {
  const handler = (e: Event) => cb((e as CustomEvent<Consent>).detail)
  try {
    window.addEventListener(EVENT, handler)
    return () => window.removeEventListener(EVENT, handler)
  } catch {
    return () => {}
  }
}
