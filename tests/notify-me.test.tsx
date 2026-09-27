/**
 * PDP "Notify me when it's back" (matrix B1). Consent: the address is used for ONE restock email and there is no
 * marketing opt-in on this form. Localized in 9 languages with an English fallback that is reported.
 */
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ProductProvider, type ProductContextValue } from '../components/product-context'
import { NotifyMe } from '../components/NotifyMe'
import { AddToCart } from '../sections/AddToCart'
import { NOTIFY_ME_LANGS, notifyMeCopy } from '../lib/notify-me-copy'
import { renderSection, stubData } from './helpers/render'

const VARIANT = '33333333-3333-4333-8333-333333333333'

const withNotify = (notify: NonNullable<ReturnType<typeof stubData>['notifyBackInStock']>) => ({
  ...stubData({}),
  notifyBackInStock: notify,
  localization: { country: { isoCode: 'DE' } } as never,
})

function typeInto(input: HTMLInputElement, value: string): void {
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
    setter.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}
async function submit(container: HTMLElement): Promise<void> {
  await act(async () => {
    container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    await Promise.resolve()
    await Promise.resolve()
  })
}

beforeEach(() => {
  document.documentElement.lang = 'en'
  window.history.replaceState({}, '', '/')
})
afterEach(() => {
  vi.restoreAllMocks()
})

describe('NotifyMe', () => {
  it('renders nothing without a backend method, without a variant, or for a mock id', async () => {
    for (const [data, id] of [
      [stubData({}), VARIANT],
      [withNotify(vi.fn()), undefined],
      [withNotify(vi.fn()), 'mock:tee'],
    ] as const) {
      const { container, unmount } = await renderSection(<NotifyMe variantId={id} />, data)
      expect(container.querySelector('form')).toBeNull()
      unmount()
    }
  })

  it('consent: one email about this restock — no marketing checkbox, nothing pre-filled, and it says so', async () => {
    const { container, unmount } = await renderSection(<NotifyMe variantId={VARIANT} />, withNotify(vi.fn()))
    expect(container.querySelector('input[type="checkbox"]')).toBeNull()
    expect(container.querySelector('input[type="email"]')!.getAttribute('value') ?? '').toBe('')
    expect(container.textContent).toMatch(/once/i)
    expect(container.textContent).toMatch(/no marketing/i)
    unmount()
  })

  it('submits the address with the variant, the page language and the market country, then shows success and keeps nothing', async () => {
    document.documentElement.lang = 'de-AT'
    const notify = vi.fn().mockResolvedValue('subscribed')
    const { container, unmount } = await renderSection(<NotifyMe variantId={VARIANT} />, withNotify(notify))
    typeInto(container.querySelector('input[type="email"]') as HTMLInputElement, '  Buyer@Example.com ')
    await submit(container)
    expect(notify).toHaveBeenCalledWith({ variantId: VARIANT, email: 'Buyer@Example.com', locale: 'de-AT', country: 'DE' })
    expect(container.querySelector('[role="status"]')!.textContent).toContain('einmal')
    expect(container.querySelector('input[type="email"]')).toBeNull()
    unmount()
  })

  it('an in-stock answer says so instead of "we will email you"', async () => {
    const { container, unmount } = await renderSection(<NotifyMe variantId={VARIANT} />, withNotify(vi.fn().mockResolvedValue('available')))
    typeInto(container.querySelector('input[type="email"]') as HTMLInputElement, 'a@b.co')
    await submit(container)
    expect(container.querySelector('[role="status"]')!.textContent).toMatch(/in stock now/i)
    unmount()
  })

  it('rejects an invalid address without calling the backend, and reports a failed save so the shopper can retry', async () => {
    const notify = vi.fn().mockRejectedValueOnce(new Error('HTTP 500')).mockResolvedValue('subscribed')
    const { container, unmount } = await renderSection(<NotifyMe variantId={VARIANT} />, withNotify(notify))
    const input = () => container.querySelector('input[type="email"]') as HTMLInputElement
    typeInto(input(), 'not-an-email')
    await submit(container)
    expect(notify).not.toHaveBeenCalled()
    expect(container.querySelector('[role="alert"]')!.textContent).toMatch(/valid email/i)
    typeInto(input(), 'a@b.co')
    await submit(container)
    expect(notify).toHaveBeenCalledTimes(1)
    expect(container.querySelector('[role="alert"]')!.textContent).toMatch(/couldn.t save/i)
    typeInto(input(), 'a@b.co')
    await submit(container)
    expect(container.querySelector('[role="status"]')).not.toBeNull()
    unmount()
  })

  it('is inert in the editor/preview plane', async () => {
    window.history.replaceState({}, '', '/?preview=1')
    const notify = vi.fn()
    const { container, unmount } = await renderSection(<NotifyMe variantId={VARIANT} />, withNotify(notify))
    typeInto(container.querySelector('input[type="email"]') as HTMLInputElement, 'a@b.co')
    await submit(container)
    expect(notify).not.toHaveBeenCalled()
    unmount()
  })
})

describe('localized copy (9 languages, English fallback reported)', () => {
  it('every language has every string', () => {
    expect(NOTIFY_ME_LANGS.sort()).toEqual(['ar', 'de', 'en', 'es', 'fr', 'ja', 'pt', 'th', 'zh'])
    const keys = Object.keys(notifyMeCopy('en').copy)
    for (const l of NOTIFY_ME_LANGS) {
      const { copy, fellBack } = notifyMeCopy(l)
      expect(fellBack).toBe(false)
      for (const k of keys) expect((copy as unknown as Record<string, string>)[k], `${l}.${k}`).toBeTruthy()
    }
  })

  it('renders in the page language; RTL for Arabic', async () => {
    document.documentElement.lang = 'th'
    let h = await renderSection(<NotifyMe variantId={VARIANT} />, withNotify(vi.fn()))
    expect(h.text()).toContain('แจ้งฉันเมื่อสินค้ากลับมา')
    h.unmount()
    document.documentElement.lang = 'ar'
    h = await renderSection(<NotifyMe variantId={VARIANT} />, withNotify(vi.fn()))
    expect(h.container.querySelector('form')!.getAttribute('dir')).toBe('rtl')
    h.unmount()
  })

  it('an unlisted language shows English and REPORTS the fallback (never a broken string)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    document.documentElement.lang = 'sv-SE'
    const { text, unmount } = await renderSection(<NotifyMe variantId={VARIANT} />, withNotify(vi.fn()))
    expect(text()).toContain('Notify me when it’s back')
    expect(warn.mock.calls.some((c) => String(c[0]).includes('no copy for locale "sv-SE"'))).toBe(true)
    unmount()
  })
})

describe('where it appears (AddToCart block)', () => {
  const variant = (over: object) => ({ id: VARIANT, title: 'Red', availableForSale: false, ...over })
  const ctx = (over: Partial<ProductContextValue>): ProductContextValue =>
    ({ product: { handle: 'tee', title: 'Tee' }, soldOut: true, adding: false, add: vi.fn(), ...over }) as never

  it('a sold-out variant that exists shows the form under the sold-out button', async () => {
    const { container, unmount } = await renderSection(
      <ProductProvider value={ctx({ selectedVariant: variant({}) as never })}><AddToCart attributes={{}} /></ProductProvider>,
      withNotify(vi.fn()),
    )
    expect(container.querySelector('form.notify-me')).not.toBeNull()
    unmount()
  })

  it('an in-stock variant, or a combination that does not exist, shows no form', async () => {
    for (const c of [ctx({ soldOut: false, selectedVariant: variant({ availableForSale: true }) as never }), ctx({ soldOut: true, selectedVariant: undefined })]) {
      const { container, unmount } = await renderSection(<ProductProvider value={c}><AddToCart attributes={{}} /></ProductProvider>, withNotify(vi.fn()))
      expect(container.querySelector('form.notify-me')).toBeNull()
      unmount()
    }
  })
})
