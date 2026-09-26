/**
 * journey-matrix 0.5 — the banner shows by the SERVER's per-buyer verdict, not only the merchant toggle.
 */
import { describe, expect, it, beforeEach } from 'vitest'
import { CookieConsent } from '../components/CookieConsent'
import { consentModeFromShop, getConsentMode, hasConsent, setConsentMode } from '../lib/tanqory/consent'
import { renderSection, stubData } from './helpers/render'

const shop = (cookieBanner: unknown) => {
  const d = stubData()
  d.shop = { name: 'Test Shop', policies: {}, cookieBanner } as never
  return d
}

/** The LIVE per-request verdict arriving (what main.tsx's armConsent / the SSG gate's onLive do) — the only thing that arms the gate. */
const live = (d: ReturnType<typeof shop>): ReturnType<typeof shop> => {
  setConsentMode(consentModeFromShop(d.shop))
  return d
}

describe('CookieConsent by jurisdiction', () => {
  beforeEach(() => localStorage.clear())

  it('EU buyer, merchant toggle OFF (server says OPT_IN) → banner shown, marketing denied', async () => {
    const { container, unmount } = await renderSection(
      <CookieConsent />,
      live(shop({ enabled: true, mode: 'OPT_IN', merchantEnabled: false })),
    )
    expect(container.querySelector('.cookie-consent')).not.toBeNull()
    expect(getConsentMode()).toBe('OPT_IN')
    expect(hasConsent('marketing')).toBe(false)
    unmount()
  })

  it('no-statute buyer, toggle OFF → no banner, allowed', async () => {
    const { container, unmount } = await renderSection(
      <CookieConsent />,
      live(shop({ enabled: false, mode: 'NONE', merchantEnabled: false })),
    )
    expect(container.querySelector('.cookie-consent')).toBeNull()
    expect(hasConsent('marketing')).toBe(true)
    unmount()
  })

  it('shop without any cookieBanner data → banner shown (fail closed), not silently allowed', async () => {
    const { container, unmount } = await renderSection(<CookieConsent />, live(shop(null)))
    expect(container.querySelector('.cookie-consent')).not.toBeNull()
    expect(hasConsent('marketing')).toBe(false)
    unmount()
  })

  it('US opt-out buyer → banner shown but trackers allowed until declined', async () => {
    const { container, unmount } = await renderSection(
      <CookieConsent />,
      live(shop({ enabled: true, mode: 'OPT_OUT', merchantEnabled: false })),
    )
    expect(container.querySelector('.cookie-consent')).not.toBeNull()
    expect(hasConsent('analytics')).toBe(true)
    unmount()
  })
})
