/**
 * The editor's live theme-settings preview — who may send it, and what it may say.
 *
 * While a merchant edits the studio's Theme panel, studio posts
 * `{ type: 'tq:theme-settings', settings }` into the preview iframe so the
 * canvas restyles before Save. That message is untrusted input arriving on the
 * store's own origin, so it is accepted only when ALL of these hold:
 *
 *   1. this page is an editor preview — the dedicated preview host
 *      (`preview-<themeId>.…`), or `?preview` on a dev build (the laptop loop);
 *      never a store's public host;
 *   2. it is framed, and the message comes from the parent frame;
 *   3. the parent's origin is an exact studio origin (no wildcard);
 *   4. it carries only the style keys below, each of the right type and
 *      passing the same validation the stylesheet applies. Every other key —
 *      account links, menus, copy — is dropped, so a message can never change
 *      a link or put a non-string where the layout expects text.
 *
 * Pure (no DOM, no React) so it is unit-tested directly
 * (lib/live-settings.test.ts); components/ThemeSettings.tsx wires it up.
 */
import {
  ENUM_SETTINGS,
  EXTRA_COLOR_SETTINGS,
  FLAG_SETTINGS,
  normalizeColor,
  normalizeFontFamily,
  normalizeImageUrl,
  type ThemeSettings,
} from './theme-settings.ts'

export const LIVE_SETTINGS_MESSAGE = 'tq:theme-settings'

/**
 * Studio origins allowed to drive the live preview when nothing is configured:
 * the studio app on Prod and on Dev. The cell- and central-named editor hosts
 * (studio-central, studio-do-sgp1) are retired (INFRA_STANDARD §2.2).
 */
export const DEFAULT_STUDIO_ORIGINS: readonly string[] = [
  'https://studio.tanqory.com',
  'https://studio.tanqory.dev',
]

/** Added on dev builds only: studio-app's local Vite server. */
export const DEV_STUDIO_ORIGINS: readonly string[] = ['http://localhost:5173']

const LOOPBACK_HOST = /^(?:localhost|127\.0\.0\.1|(?:[a-z0-9-]+\.)+localhost)$/

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
  return url.protocol === 'http:' && LOOPBACK_HOST.test(url.hostname)
}

/**
 * The allowed studio origins. `configured` (VITE_TQ_STUDIO_ORIGINS, comma-
 * separated exact origins) replaces the defaults when it yields at least one
 * valid origin; entries that are not exact origins — wildcards, paths, plain
 * http off loopback — are ignored.
 */
export function studioOrigins(configured: string | undefined, isDev: boolean): string[] {
  const fromEnv = (configured ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter((o) => o && isExactOrigin(o))
  const base = fromEnv.length ? fromEnv : [...DEFAULT_STUDIO_ORIGINS]
  return isDev ? Array.from(new Set([...base, ...DEV_STUDIO_ORIGINS])) : base
}

/** True on an editor preview page (see rule 1 above). */
export function isEditorPreview(location: { hostname: string; search: string }, isDev: boolean): boolean {
  if (/^preview-/.test(location.hostname)) return true
  return isDev && new URLSearchParams(location.search).has('preview')
}

const optional = (v: unknown, valid: (s: string) => boolean): boolean =>
  typeof v === 'string' && (v === '' || valid(v))

/** The keys a live message may set, each with its validation. */
const LIVE_KEYS: Record<string, (v: unknown) => boolean> = {
  logo: (v) => optional(v, (s) => normalizeImageUrl(s) !== null),
  shopName: (v) => typeof v === 'string' && v.length <= 120,
  colorBrand: (v) => optional(v, (s) => normalizeColor(s) !== null),
  accent: (v) => optional(v, (s) => normalizeColor(s) !== null),
  colorBackground: (v) => optional(v, (s) => normalizeColor(s) !== null),
  colorText: (v) => optional(v, (s) => normalizeColor(s) !== null),
  fontHeading: (v) => optional(v, (s) => normalizeFontFamily(s) !== null),
  fontBody: (v) => optional(v, (s) => normalizeFontFamily(s) !== null),
  // The design's names (config/settings.schema.ts). The three above them are
  // the names an earlier build used and are still accepted.
  colorPrimary: (v) => optional(v, (s) => normalizeColor(s) !== null),
  headingFont: (v) => optional(v, (s) => normalizeFontFamily(s) !== null),
  bodyFont: (v) => optional(v, (s) => normalizeFontFamily(s) !== null),
  ...Object.fromEntries(
    EXTRA_COLOR_SETTINGS.map((key) => [key, (v: unknown) => optional(v, (s) => normalizeColor(s) !== null)]),
  ),
  // Semantic rungs: only a value the resolver maps to a token.
  ...Object.fromEntries(
    Object.entries(ENUM_SETTINGS).map(([key, values]) => [key, (v: unknown) => optional(v, (s) => values.includes(s))]),
  ),
  // Behaviour switches → root data-* flags: a boolean, or one short identifier.
  ...Object.fromEntries(
    FLAG_SETTINGS.map((key) => [key, (v: unknown) => typeof v === 'boolean' || optional(v, (s) => /^[a-z0-9-]{1,32}$/i.test(s))]),
  ),
}

export const LIVE_SETTINGS_KEYS: readonly string[] = Object.keys(LIVE_KEYS)

/** Only the allowed keys whose values validate; everything else is dropped. */
export function sanitizeLiveSettings(input: Record<string, unknown>): ThemeSettings {
  const out: ThemeSettings = {}
  for (const [key, valid] of Object.entries(LIVE_KEYS)) {
    if (Object.prototype.hasOwnProperty.call(input, key) && valid(input[key])) out[key] = input[key]
  }
  return out
}

export interface LiveMessageContext {
  /** Result of {@link isEditorPreview} for this page. */
  isPreview: boolean
  /** `window.parent`, or null when the page is not framed. */
  parent: unknown
  /** Result of {@link studioOrigins}. */
  allowedOrigins: readonly string[]
}

/**
 * What a `message` event asks the preview to do: apply these settings, clear
 * the live values (`settings: null`), or nothing (null) — which covers every
 * message that fails a rule above.
 */
export function readLiveSettingsMessage(
  event: { origin: string; source: unknown; data: unknown },
  ctx: LiveMessageContext,
): { settings: ThemeSettings } | { clear: true } | null {
  if (!ctx.isPreview || !ctx.parent || event.source !== ctx.parent) return null
  if (!ctx.allowedOrigins.includes(event.origin)) return null
  const data = event.data as { type?: unknown; settings?: unknown } | null
  if (!data || typeof data !== 'object' || data.type !== LIVE_SETTINGS_MESSAGE) return null
  if (data.settings === null) return { clear: true }
  if (!data.settings || typeof data.settings !== 'object' || Array.isArray(data.settings)) return null
  return { settings: sanitizeLiveSettings(data.settings as Record<string, unknown>) }
}
