import { consentModeFromShop, holdConsentClosed, setConsentMode } from './consent'
import type { DataApi } from './data'

/**
 * Consent for the SSG-hydrated boot path (S8 #2549 B-1).
 *
 * The prerendered snapshot's `shop.cookieBanner` was computed for the BUILD machine's location, so it must never decide
 * a buyer's consent. This forces OPT_IN immediately (nothing tracks, nothing emits) and arms + emits only when the LIVE
 * per-request answer arrives, exactly once. A failed live fetch (`null`) leaves everything closed.
 */
export function createSsgConsentGate(emit: (data: DataApi) => void): {
  onLive: (live: DataApi | null | undefined) => void
} {
  holdConsentClosed() // OPT_IN and NOT armed: closed and silent until the live answer
  let armed = false
  return {
    onLive(live) {
      if (!live || armed) return
      armed = true
      setConsentMode(consentModeFromShop(live.shop))
      emit(live)
    },
  }
}
