/**
 * S8 C-1 (#36 5847829684) — CookieConsent must NOT arm the consent mode from the shop data it renders with.
 *
 * On the SSG-hydrated boot `useData().shop` is the BUILD-TIME SNAPSHOT (computed for the build machine's location). The
 * component used to call `setConsentMode(consentModeFromShop(shop))` from it, so a snapshot saying NONE re-opened the gate
 * — analytics + marketing allowed — right after `createSsgConsentGate` had forced OPT_IN, before the live per-buyer
 * answer arrived. Only the live answer (the gate's `onLive`, or `armConsent` on the live boot) may set the mode; the
 * component only READS it.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { act } from 'react'
import { CookieConsent } from '../components/CookieConsent'
import { getConsentMode, hasConsent, setConsentMode } from '../lib/tanqory/consent'
import { createSsgConsentGate } from '../lib/tanqory/ssg-consent-gate'
import type { DataApi } from '../lib/tanqory/index'
import { renderSection, stubData } from './helpers/render'

const shopWith = (cookieBanner: unknown): DataApi => {
  const d = stubData()
  d.shop = { name: 'S', policies: {}, cookieBanner } as never
  return d
}

describe('C-1: the snapshot never opens the gate through CookieConsent', () => {
  beforeEach(() => {
    localStorage.clear()
    setConsentMode('NONE')
  })

  it('SSG boot: a SNAPSHOT saying NONE rendered by CookieConsent leaves the gate CLOSED (OPT_IN) until the live answer', async () => {
    const gate = createSsgConsentGate(() => undefined)
    const { unmount, settle } = await renderSection(<CookieConsent />, shopWith({ enabled: false, mode: 'NONE' }))
    await settle()
    expect(getConsentMode()).toBe('OPT_IN')
    expect(hasConsent('analytics')).toBe(false)
    expect(hasConsent('marketing')).toBe(false)
    // …and the LIVE answer is what opens it
    act(() => gate.onLive(shopWith({ enabled: false, mode: 'NONE' })))
    expect(getConsentMode()).toBe('NONE')
    expect(hasConsent('marketing')).toBe(true)
    unmount()
  })

  it('SSG boot: no banner is shown for a NONE snapshot before the live answer (nothing to flash), and none is forced open by it', async () => {
    createSsgConsentGate(() => undefined)
    const { container, unmount, settle } = await renderSection(<CookieConsent />, shopWith({ enabled: false, mode: 'NONE' }))
    await settle()
    expect(container.querySelector('.cookie-consent')).toBeNull()
    unmount()
  })

  it('once the LIVE verdict is EU (OPT_IN) the banner appears and the gate stays closed until a decision', async () => {
    const gate = createSsgConsentGate(() => undefined)
    const { container, unmount, settle } = await renderSection(<CookieConsent />, shopWith({ enabled: false, mode: 'NONE' }))
    await settle()
    await act(async () => gate.onLive(shopWith({ enabled: true, mode: 'OPT_IN' })))
    await settle()
    expect(container.querySelector('.cookie-consent')).not.toBeNull()
    expect(hasConsent('marketing')).toBe(false)
    unmount()
  })

  it('a snapshot that says OPT_OUT or NONE never relaxes an already-closed gate; a snapshot that says OPT_IN never opens it either', async () => {
    for (const mode of ['OPT_OUT', 'NONE', 'OPT_IN'] as const) {
      createSsgConsentGate(() => undefined)
      const { unmount, settle } = await renderSection(<CookieConsent />, shopWith({ enabled: mode !== 'NONE', mode }))
      await settle()
      expect(getConsentMode()).toBe('OPT_IN')
      expect(hasConsent('marketing')).toBe(false)
      unmount()
    }
  })

  it('the component source no longer calls setConsentMode (single writer: the gate / armConsent)', async () => {
    const { readFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    const src = readFileSync(join(process.cwd(), 'components/CookieConsent.tsx'), 'utf8')
    expect(src).not.toMatch(/setConsentMode\(/)
  })
})
