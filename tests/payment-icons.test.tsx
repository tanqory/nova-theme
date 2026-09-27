/**
 * Payment badges are a trust claim: they must name only what the store accepts.
 *
 * The component already derives its badges from `shop.paymentSettings` when the
 * `methods` override is blank. The STARTER TEMPLATE, however, shipped
 * `"methods": "VISA, Mastercard, Amex, PayPal, Apple Pay"` in the footer, and an
 * override wins — so every new store (Prod, 2026-09-26: a store with no payment
 * method at all) promised five payment brands it could not take.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { PaymentIcons } from '../sections/PaymentIcons'
import { renderSection, stubData } from './helpers/render'

const ROOT = join(import.meta.dirname ?? __dirname, '..')

function paymentIconBlocks(node: unknown, out: Array<Record<string, unknown>> = []) {
  if (Array.isArray(node)) node.forEach((n) => paymentIconBlocks(n, out))
  else if (node && typeof node === 'object') {
    const o = node as Record<string, unknown>
    if (o.type === 'payment-icons') out.push(o)
    Object.values(o).forEach((v) => paymentIconBlocks(v, out))
  }
  return out
}

describe('starter templates never hard-code accepted payment brands', () => {
  it('no payment-icons block in templates/ or groups/ carries a `methods` override', () => {
    const hits: string[] = []
    for (const dir of ['templates', 'groups']) {
      for (const f of readdirSync(join(ROOT, dir)).filter((n) => n.endsWith('.json'))) {
        const json = JSON.parse(readFileSync(join(ROOT, dir, f), 'utf8'))
        for (const b of paymentIconBlocks(json)) {
          const methods = String((b.settings as Record<string, unknown> | undefined)?.methods ?? '').trim()
          if (methods) hits.push(`${dir}/${f}: ${b.id} → "${methods}"`)
        }
      }
    }
    expect(hits).toEqual([])
  })
})

describe('PaymentIcons with no override', () => {
  it('renders nothing when the store accepts no card brand or wallet', async () => {
    const { container, unmount } = await renderSection(<PaymentIcons attributes={{}} />, stubData({}))
    expect(container.querySelector('.payment-icons')).toBeNull()
    unmount()
  })

  it('names exactly the brands and wallets the store accepts', async () => {
    const data = stubData({})
    data.shop = {
      ...data.shop,
      paymentSettings: { acceptedCardBrands: ['VISA'], supportedDigitalWallets: ['APPLE_PAY'], currencyCode: 'USD' },
    } as typeof data.shop
    const { container, unmount } = await renderSection(<PaymentIcons attributes={{}} />, data)
    expect([...container.querySelectorAll('.payment-icon')].map((e) => e.textContent)).toEqual(['Visa', 'Apple Pay'])
    unmount()
  })
})
