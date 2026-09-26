/**
 * S8 #2549 B-1 — the jurisdiction answer must come from a LIVE per-buyer request, never from the build-time snapshot.
 *
 * `prerender.mjs` renders once after `vite build` and embeds the bootstrap (incl. `shop.cookieBanner`) in index.html, so
 * every buyer would get the answer computed for the BUILD machine's location. The SSG branch therefore ignores the
 * snapshot for consent (mode stays OPT_IN), holds every emit (pixels, page_viewed) and arms + emits only when the live
 * per-request answer arrives — once. A failed live fetch keeps everything closed.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DataApi } from '../lib/tanqory/index'
import {
  getConsentMode,
  hasConsent,
  setConsentMode,
} from '../lib/tanqory/consent'
import { createSsgConsentGate } from '../lib/tanqory/ssg-consent-gate'
const shop = (cookieBanner: unknown) =>
  ({ shop: { name: 'S', cookieBanner } }) as unknown as DataApi
describe('createSsgConsentGate', () => {
  beforeEach(() => {
    localStorage.clear()
    setConsentMode('NONE'); // worst case: something earlier left the gate open
  })
  it('a snapshot that says NONE (built from a no-statute region) does NOT open the gate: OPT_IN, nothing emitted', () => {
    const emit = vi.fn()
    createSsgConsentGate(emit)
    expect(getConsentMode()).toBe('OPT_IN')
    expect(hasConsent('marketing')).toBe(false)
    expect(hasConsent('analytics')).toBe(false)
    expect(emit).not.toHaveBeenCalled()
  })
  it('the live answer for an EU buyer arms OPT_IN and then emits ONCE', () => {
    const emit = vi.fn()
    const gate = createSsgConsentGate(emit)
    gate.onLive(shop({ enabled: true, mode: 'OPT_IN' }))
    expect(getConsentMode()).toBe('OPT_IN')
    expect(hasConsent('marketing')).toBe(false)
    expect(emit).toHaveBeenCalledTimes(1)
  })
  it('the live answer for a no-statute buyer opens the gate, then emits once', () => {
    const emit = vi.fn()
    const gate = createSsgConsentGate(emit)
    gate.onLive(shop({ enabled: false, mode: 'NONE' }))
    expect(getConsentMode()).toBe('NONE')
    expect(hasConsent('marketing')).toBe(true)
    expect(emit).toHaveBeenCalledTimes(1)
  })
  it('arming happens BEFORE the emit (the emit already sees the live mode)', () => {
    let modeAtEmit = ''
    const gate = createSsgConsentGate(
      () => void (modeAtEmit = getConsentMode()),
    )
    gate.onLive(shop({ enabled: false, mode: 'NONE' }))
    expect(modeAtEmit).toBe('NONE')
  })
  it('a later live answer (SWR revalidate again) never emits twice', () => {
    const emit = vi.fn()
    const gate = createSsgConsentGate(emit)
    gate.onLive(shop({ enabled: true, mode: 'OPT_IN' }))
    gate.onLive(shop({ enabled: true, mode: 'OPT_IN' }))
    expect(emit).toHaveBeenCalledTimes(1)
  })
  it('a failed live fetch (null) keeps everything CLOSED: OPT_IN, no emit', () => {
    const emit = vi.fn()
    const gate = createSsgConsentGate(emit)
    gate.onLive(null)
    expect(getConsentMode()).toBe('OPT_IN')
    expect(hasConsent('analytics')).toBe(false)
    expect(emit).not.toHaveBeenCalled()
  })
  it('a live answer with no cookieBanner data is OPT_IN (fail closed), and still emits nothing the gate forbids', () => {
    const emit = vi.fn()
    const gate = createSsgConsentGate(emit)
    gate.onLive(shop(null))
    expect(getConsentMode()).toBe('OPT_IN')
    expect(hasConsent('marketing')).toBe(false)
  })
})
describe('main.tsx SSG branch uses the gate (no snapshot arming)', () => {
  it('the SSG branch no longer calls armConsent(data) on the snapshot data', async () => {
    const { readFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    const src = readFileSync(join(process.cwd(), 'main.tsx'), 'utf8')
    const ssg = src.slice(
      src.indexOf('DETERMINISTIC HYDRATION'),
      src.indexOf('No usable snapshot'),
    )
    expect(ssg).toMatch(/createSsgConsentGate/)
    expect(ssg).toMatch(/onLive\(/)
    expect(ssg).not.toMatch(/armConsent\(data\)/)
    expect(ssg).not.toMatch(/emitRouteEvents\(data\)/)
  })
})