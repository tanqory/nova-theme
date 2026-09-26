/**
 * journey-matrix 0.5 — the storefront consent gate is DENY-UNTIL-DECIDED by default.
 *
 * The defect: `bannerRequired` started false and was set from the MERCHANT's banner toggle, so any shop whose owner
 * never enabled the banner allowed every tracker for every buyer (EU included), and so did the window before shop data
 * arrived. The server now sends the buyer-jurisdiction verdict (`cookieBanner.mode`); this is the client half.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  consentModeFromShop,
  hasConsent,
  setConsent,
  setConsentMode,
  isBannerRequired,
} from '../lib/tanqory/consent'

const clear = () => {
  localStorage.clear()
  Object.defineProperty(navigator, 'globalPrivacyControl', { value: undefined, configurable: true })
}

describe('consent gate', () => {
  beforeEach(clear)
  afterEach(clear)

  it('BEFORE any shop data arrives nothing is allowed (fail closed at module load)', async () => {
    // fresh module = the state trackers see at first paint
    vi.resetModules()
    const fresh = await import('../lib/tanqory/consent')
    expect(fresh.hasConsent('analytics')).toBe(false)
    expect(fresh.hasConsent('marketing')).toBe(false)
    expect(fresh.isBannerRequired()).toBe(true)
  })

  describe('consentModeFromShop', () => {
    it('shop not loaded → OPT_IN', () => expect(consentModeFromShop(undefined)).toBe('OPT_IN'))
    it('shop without a cookieBanner (null / older API) and no signal → OPT_IN', () => {
      expect(consentModeFromShop({})).toBe('OPT_IN')
      expect(consentModeFromShop({ cookieBanner: null })).toBe('OPT_IN')
    })
    it('server verdict wins', () => {
      expect(consentModeFromShop({ cookieBanner: { enabled: true, mode: 'OPT_IN' } })).toBe('OPT_IN')
      expect(consentModeFromShop({ cookieBanner: { enabled: true, mode: 'OPT_OUT' } })).toBe('OPT_OUT')
      expect(consentModeFromShop({ cookieBanner: { enabled: false, mode: 'NONE' } })).toBe('NONE')
    })
    it('unknown mode string → OPT_IN (never permissive on garbage)', () =>
      expect(consentModeFromShop({ cookieBanner: { enabled: false, mode: 'WHATEVER' } })).toBe('OPT_IN'))
    it('older API (no `mode`): enabled → OPT_IN; not enabled → NONE (cannot know better)', () => {
      expect(consentModeFromShop({ cookieBanner: { enabled: true } })).toBe('OPT_IN')
      expect(consentModeFromShop({ cookieBanner: { enabled: false } })).toBe('NONE')
    })
  })

  describe('OPT_IN', () => {
    beforeEach(() => setConsentMode('OPT_IN'))
    it('undecided → everything denied', () => {
      expect(hasConsent('analytics')).toBe(false)
      expect(hasConsent('marketing')).toBe(false)
    })
    it('decided → the stored purpose flags', () => {
      setConsent({ analytics: true, marketing: false })
      expect(hasConsent('analytics')).toBe(true)
      expect(hasConsent('marketing')).toBe(false)
    })
    it('GPC never grants', () => {
      Object.defineProperty(navigator, 'globalPrivacyControl', { value: true, configurable: true })
      expect(hasConsent('marketing')).toBe(false)
    })
  })

  describe('OPT_OUT (US opt-out states)', () => {
    beforeEach(() => setConsentMode('OPT_OUT'))
    it('undecided → allowed until declined', () => {
      expect(hasConsent('analytics')).toBe(true)
      expect(hasConsent('marketing')).toBe(true)
    })
    it('GPC counts as a decline of MARKETING without a click; analytics unaffected', () => {
      Object.defineProperty(navigator, 'globalPrivacyControl', { value: true, configurable: true })
      expect(hasConsent('marketing')).toBe(false)
      expect(hasConsent('analytics')).toBe(true)
    })
    it('an explicit decision beats the default', () => {
      setConsent({ analytics: false, marketing: false })
      expect(hasConsent('analytics')).toBe(false)
      expect(hasConsent('marketing')).toBe(false)
    })
  })

  describe('NONE', () => {
    it('no banner required → allowed, and isBannerRequired says so', () => {
      setConsentMode('NONE')
      expect(hasConsent('marketing')).toBe(true)
      expect(isBannerRequired()).toBe(false)
    })
  })

  describe('GPC forces MARKETING off in EVERY mode (W4/W2: honoured globally)', () => {
    const gpc = () => Object.defineProperty(navigator, 'globalPrivacyControl', { value: true, configurable: true })
    it('NONE + GPC: marketing denied, analytics still allowed', () => {
      setConsentMode('NONE')
      gpc()
      expect(hasConsent('marketing')).toBe(false)
      expect(hasConsent('analytics')).toBe(true)
    })
    it('NONE without GPC is unchanged (allowed)', () => {
      setConsentMode('NONE')
      expect(hasConsent('marketing')).toBe(true)
    })
    it('GPC beats even a stored accept-all: marketing STILL denied, analytics allowed (W4 case; conservative — Legal may relax)', () => {
      for (const m of ['NONE', 'OPT_OUT', 'OPT_IN'] as const) {
        setConsentMode(m)
        gpc()
        setConsent({ analytics: true, marketing: true })
        expect(hasConsent('marketing')).toBe(false)
        expect(hasConsent('analytics')).toBe(true)
      }
    })
    it('a missing navigator never throws and is not GPC', () => {
      const orig = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
      // @ts-expect-error simulate an environment with no navigator
      delete globalThis.navigator
      setConsentMode('NONE')
      expect(hasConsent('marketing')).toBe(true)
      if (orig) Object.defineProperty(globalThis, 'navigator', orig)
    })
    it('isBannerRequired stays false for NONE (GPC does not force a banner)', () => {
      setConsentMode('NONE')
      gpc()
      expect(isBannerRequired()).toBe(false)
    })
  })
})
