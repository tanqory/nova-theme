/**
 * Which plane a render is on, and who may drive the preview bridge.
 *
 * Pure (no DOM, no React) so it is unit-tested directly (tests/preview-gate).
 *
 * The preview bridge accepts `postMessage` commands that insert arbitrary
 * section content into the page, so it may only mount on a page that is
 * genuinely the editor's canvas, and it may only take commands from a frame
 * whose origin is a known studio host:
 *
 *   PREVIEW plane  the dedicated `preview-<themeId>.<domain>` host, or a
 *                  loopback host (`localhost`, `*.localhost`, `127.0.0.1`) with
 *                  `?preview` — the laptop loop with `--plain-ports`.
 *   SERVE plane    everything else, including a published `<slug>.<domain>`
 *                  host carrying `?preview` — the storefront renders as usual.
 */

/** Studio origins allowed to drive the canvas when the theme configures none. */
export const DEFAULT_STUDIO_ORIGINS: readonly string[] = [
  'https://studio.tanqory.com',
  'https://studio.tanqory.dev',
]

const LOOPBACK_HOST = /^(?:localhost|127\.0\.0\.1|\[::1\]|(?:[a-z0-9-]+\.)+localhost)$/i

export function isLoopbackHostname(hostname: string): boolean {
  return LOOPBACK_HOST.test(hostname)
}

/** True when a `?preview` / `?edit`-style flag is on: present and not an explicit off value. */
export function flagOn(search: string, key: string): boolean {
  const v = new URLSearchParams(search).get(key)
  return v !== null && v !== 'false' && v !== '0'
}

/**
 * True when this page is the editor canvas (see the header of this file).
 * A published host never qualifies, whatever its query string says.
 */
export function isPreviewPlane(location: { hostname: string; search: string }): boolean {
  if (/^preview-/.test(location.hostname)) return true
  return isLoopbackHostname(location.hostname) && flagOn(location.search, 'preview')
}

/** An exact origin: `https://host[:port]`, or `http://` for loopback hosts only. */
export function isExactOrigin(value: string): boolean {
  if (value.includes('*')) return false
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return false
  }
  if (url.origin !== value) return false
  if (url.protocol === 'https:') return true
  return url.protocol === 'http:' && isLoopbackHostname(url.hostname)
}

/**
 * The origins the bridge accepts commands from and posts its messages to.
 * `configured` (exact origins) replaces the defaults when it yields at least
 * one valid origin. On a loopback page any loopback origin is also accepted,
 * so a local editor on any port can drive a local theme.
 */
export function resolvePreviewOrigins(
  configured: readonly string[] | undefined,
  pageHostname: string,
): { allowed: readonly string[]; acceptsLoopback: boolean } {
  const fromTheme = (configured ?? []).map((o) => o.trim()).filter((o) => o && isExactOrigin(o))
  const allowed = fromTheme.length ? fromTheme : [...DEFAULT_STUDIO_ORIGINS]
  return { allowed, acceptsLoopback: isLoopbackHostname(pageHostname) }
}

/** True when a message from `origin` may drive the bridge. */
export function isAllowedStudioOrigin(
  origin: string,
  rules: { allowed: readonly string[]; acceptsLoopback: boolean },
): boolean {
  if (rules.allowed.includes(origin)) return true
  if (!rules.acceptsLoopback) return false
  let url: URL
  try {
    url = new URL(origin)
  } catch {
    return false
  }
  return url.origin === origin && isLoopbackHostname(url.hostname)
}
