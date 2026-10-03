/**
 * Theme settings → what the storefront actually renders.
 *
 * `config/settings.json` holds the merchant's theme-wide values (edited in the
 * studio's Theme panel, schema in `config/settings.schema.ts`). Until now nova
 * declared `accent` but nothing read it, so a merchant could change it and the
 * storefront never moved. This module is the one place that turns those values
 * into nova's own design tokens (`assets/tokens.css`), so every section — and
 * every AI section, whose `--tq-*` tokens alias nova's variables — follows them.
 *
 * Precedence, for every value: a theme setting → the store's Settings → Brand →
 * the theme's own default (tokens.css / ai-tokens.css). An empty theme setting
 * means "not set", never "blank".
 *
 * Vocabulary: the approved design package names the global props
 * (`design/spec/global.json` — `colorPrimary`, `headingFont`, `bodyFont`, …)
 * and those names are the schema. `colorBrand`, `fontHeading` and `fontBody`
 * are the names an earlier build used; they are still READ (see `pick`) so a
 * saved value keeps working, and `scripts/migrate-content.mjs` renames them.
 *
 * Beyond colour and type, the design's semantic rungs are resolved here too —
 * `buttonRadius: 'pill'` → `--btn-radius: var(--radius-pill)` — so a merchant
 * picks a rung, never a pixel, and every one of them follows the editor's live
 * preview through the same path (components/ThemeSettings.tsx).
 *
 * Pure: no React, no DOM, no theme-kit import, so the layout (SSR + client) and
 * the section-preview renderer share it, and it is unit-tested directly
 * (lib/theme-settings.test.ts).
 */

export type ThemeSettings = Record<string, unknown>

/**
 * Design name first, then the name an earlier build saved under. The first key
 * holding a non-empty value wins, so a store that re-saves under the new name
 * is not shadowed by its old value.
 */
export const LEGACY_KEYS: Readonly<Record<string, string>> = {
  colorPrimary: 'colorBrand',
  headingFont: 'fontHeading',
  bodyFont: 'fontBody',
}
function pick(settings: ThemeSettings, key: string): unknown {
  const v = settings[key]
  if (v !== undefined && v !== null && v !== '') return v
  const legacy = LEGACY_KEYS[key]
  return legacy ? settings[legacy] : v
}
const text = (settings: ThemeSettings, key: string): string | null => {
  const v = pick(settings, key)
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null
}

/** The slice of `shop.brand` (Settings → Brand) that theme settings fall back to. */
export interface BrandFallback {
  logo?: { url?: string | null; altText?: string | null } | null
  colors?: {
    primary?: Array<{ background?: string | null; foreground?: string | null }> | null
  } | null
  /** Family names in priority order: [0] headings, [1] body. */
  fonts?: Array<string | null> | null
}

/**
 * The value every nova install shipped for `accent` before anything read it.
 * Nothing ever rendered it, so no merchant has seen it take effect — and it
 * equals nova's light-scheme text colour. Applying it now would paint primary
 * buttons near-black for visitors on a dark OS scheme on every existing store,
 * so it is read as "not set". A merchant who wants that exact black button can
 * pick any other near-black.
 */
export const LEGACY_ACCENT_PLACEHOLDER = '#0a0a0a'

type FontCategory = 'sans' | 'serif'

/** Google Fonts families offered by the Heading / Body font settings. */
export const FONT_CHOICES: ReadonlyArray<{ family: string; category: FontCategory }> = [
  { family: 'Inter', category: 'sans' },
  { family: 'DM Sans', category: 'sans' },
  { family: 'Work Sans', category: 'sans' },
  { family: 'Poppins', category: 'sans' },
  { family: 'Montserrat', category: 'sans' },
  { family: 'Roboto', category: 'sans' },
  { family: 'Open Sans', category: 'sans' },
  { family: 'Lato', category: 'sans' },
  { family: 'Nunito Sans', category: 'sans' },
  { family: 'Space Grotesk', category: 'sans' },
  { family: 'Noto Sans Thai', category: 'sans' },
  { family: 'IBM Plex Sans Thai', category: 'sans' },
  { family: 'Prompt', category: 'sans' },
  { family: 'Kanit', category: 'sans' },
  { family: 'Sarabun', category: 'sans' },
  { family: 'Playfair Display', category: 'serif' },
  { family: 'DM Serif Display', category: 'serif' },
  { family: 'Cormorant Garamond', category: 'serif' },
  { family: 'EB Garamond', category: 'serif' },
  { family: 'Libre Baskerville', category: 'serif' },
  { family: 'Lora', category: 'serif' },
  { family: 'Merriweather', category: 'serif' },
]

/** `select` options for the font settings; '' keeps Settings → Brand / the theme default. */
export const FONT_OPTIONS: Array<{ value: string; label: string }> = [
  { value: '', label: 'Default (Settings → Brand, else theme font)' },
  ...FONT_CHOICES.map((f) => ({ value: f.family, label: f.family })),
]

const SANS_STACK = "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
const SERIF_STACK = "Georgia, 'Times New Roman', Times, serif"

// ── Colours ─────────────────────────────────────────────────────────────────

type Rgb = [number, number, number]

const NUM = /^(?:\d+(?:\.\d+)?|\.\d+)$/
const PCT = /^(?:\d+(?:\.\d+)?|\.\d+)%$/

/** An opaque alpha component: `1`, `1.0`, `100%`. Anything translucent is refused. */
function isOpaqueAlpha(token: string): boolean {
  if (NUM.test(token)) return Number(token) === 1
  if (PCT.test(token)) return Number(token.slice(0, -1)) === 100
  return false
}

/**
 * The arguments of `fn(…)` in either CSS syntax: legacy `a, b, c[, alpha]` or
 * modern `a b c[ / alpha]`. Null when the list is neither (mixed separators,
 * empty tokens, wrong arity).
 */
function colorArgs(inner: string): { channels: string[]; alpha: string | null } | null {
  const body = inner.trim()
  if (!body) return null
  if (body.includes(',')) {
    if (body.includes('/')) return null
    const parts = body.split(',').map((t) => t.trim())
    if (parts.some((t) => !t || /\s/.test(t))) return null
    if (parts.length === 3) return { channels: parts, alpha: null }
    if (parts.length === 4) return { channels: parts.slice(0, 3), alpha: parts[3] }
    return null
  }
  const [main, alpha, extra] = body.split('/').map((t) => t.trim())
  if (extra !== undefined || alpha === '') return null
  const channels = main.split(/\s+/)
  if (channels.length !== 3 || (alpha !== undefined && /\s/.test(alpha))) return null
  return { channels, alpha: alpha ?? null }
}

function parseRgbFunction(inner: string): Rgb | null {
  const args = colorArgs(inner)
  if (!args || (args.alpha !== null && !isOpaqueAlpha(args.alpha))) return null
  const { channels } = args
  // CSS requires the three channels to be all numbers or all percentages.
  if (channels.every((t) => NUM.test(t))) {
    const v = channels.map(Number)
    return v.every((n) => n <= 255) ? (v.map(Math.round) as Rgb) : null
  }
  if (channels.every((t) => PCT.test(t))) {
    const v = channels.map((t) => Number(t.slice(0, -1)))
    return v.every((n) => n <= 100) ? (v.map((n) => Math.round((n / 100) * 255)) as Rgb) : null
  }
  return null
}

function parseHslFunction(inner: string): Rgb | null {
  const args = colorArgs(inner)
  if (!args || (args.alpha !== null && !isOpaqueAlpha(args.alpha))) return null
  const [hueToken, sToken, lToken] = args.channels
  const hue = /^-?(?:\d+(?:\.\d+)?|\.\d+)(?:deg)?$/.test(hueToken) ? Number(hueToken.replace(/deg$/, '')) : NaN
  if (!Number.isFinite(hue) || !PCT.test(sToken) || !PCT.test(lToken)) return null
  const sat = Number(sToken.slice(0, -1)) / 100
  const light = Number(lToken.slice(0, -1)) / 100
  if (sat > 1 || light > 1) return null
  const h = ((hue % 360) + 360) % 360
  const a = sat * Math.min(light, 1 - light)
  const f = (n: number) => {
    const k = (n + h / 30) % 12
    return Math.round((light - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))) * 255)
  }
  return [f(0), f(8), f(4)]
}

/** Parse an accepted colour to RGB, or null. Accepts hex and rgb()/hsl(); opaque only. */
export function parseColor(value: unknown): Rgb | null {
  if (typeof value !== 'string') return null
  const v = value.trim().toLowerCase()
  const hex = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/.exec(v)
  if (hex) {
    let h = hex[1]
    if (h.length <= 4) h = h.split('').map((c) => c + c).join('')
    if (h.length === 8 && h.slice(6) !== 'ff') return null
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as Rgb
  }
  const fn = /^(rgba?|hsla?)\((.*)\)$/.exec(v)
  if (!fn) return null
  return fn[1].startsWith('rgb') ? parseRgbFunction(fn[2]) : parseHslFunction(fn[2])
}

const toHex = (rgb: Rgb) => '#' + rgb.map((c) => c.toString(16).padStart(2, '0')).join('')

/**
 * A colour safe to write into a stylesheet, as canonical `#rrggbb`, or null.
 * Hex, rgb() and hsl() are accepted when they are valid CSS and opaque; every
 * other value — invalid numbers, translucent colours, keywords, anything that
 * could close a declaration — is refused, so the theme default applies.
 */
export function normalizeColor(value: unknown): string | null {
  const rgb = parseColor(value)
  return rgb ? toHex(rgb) : null
}

/** WCAG 2 relative luminance of an accepted colour. */
export function relativeLuminance(color: string): number {
  const rgb = parseColor(color)
  if (!rgb) return NaN
  const [r, g, b] = rgb.map((c) => {
    const s = c / 255
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** WCAG 2 contrast ratio between two accepted colours (1–21). */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

/** WCAG 2.1 AA for body-size text. */
export const MIN_TEXT_CONTRAST = 4.5

/**
 * The text colour for `background` that meets {@link MIN_TEXT_CONTRAST}.
 * Prefers white or nova's near-black (#0a0a0a), whichever reads better; on the
 * mid-greys where neither reaches 4.5:1 it uses pure black (the better of
 * white and pure black is never below 4.58:1), so the result always passes AA.
 */
export function readableTextOn(background: string): string {
  const bg = normalizeColor(background)
  if (!bg) return '#ffffff'
  const white = contrastRatio(bg, '#ffffff')
  const ink = contrastRatio(bg, '#0a0a0a')
  if (Math.max(white, ink) >= MIN_TEXT_CONTRAST) return white >= ink ? '#ffffff' : '#0a0a0a'
  return white >= contrastRatio(bg, '#000000') ? '#ffffff' : '#000000'
}

/** `color` mixed with black — the primary button's hover shade (85% colour). */
export function hoverShade(color: string): string {
  const rgb = parseColor(color)
  return rgb ? toHex(rgb.map((c) => Math.round(c * 0.85)) as Rgb) : color
}

/** A font family name safe to quote in CSS and put in a Google Fonts URL, or null. */
export function normalizeFontFamily(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const v = value.trim().replace(/\s+/g, ' ')
  return /^[A-Za-z0-9][A-Za-z0-9 -]{0,63}$/.test(v) ? v : null
}

/** An image URL the header may render: absolute http(s), protocol-relative, or root-relative. */
export function normalizeImageUrl(value: unknown): string | null {
  const raw =
    typeof value === 'string'
      ? value
      : value && typeof value === 'object' && typeof (value as { url?: unknown }).url === 'string'
        ? (value as { url: string }).url
        : null
  if (raw === null) return null
  const v = raw.trim()
  if (!v || /[\s"'<>]/.test(v)) return null
  return /^https?:\/\//i.test(v) || /^\/\/[^/]/.test(v) || /^\/[^/]/.test(v) ? v : null
}

function fontStack(family: string): string {
  const category = FONT_CHOICES.find((f) => f.family.toLowerCase() === family.toLowerCase())?.category
  return `"${family}", ${category === 'serif' ? SERIF_STACK : SANS_STACK}`
}

/** Heading + body families after precedence (theme setting → Settings → Brand). */
export function resolveFonts(
  settings: ThemeSettings,
  brand?: BrandFallback | null,
): { heading: string | null; body: string | null } {
  const brandFonts = (brand?.fonts ?? []).map(normalizeFontFamily).filter((f): f is string => !!f)
  return {
    heading: normalizeFontFamily(pick(settings, 'headingFont')) ?? brandFonts[0] ?? null,
    body: normalizeFontFamily(pick(settings, 'bodyFont')) ?? brandFonts[1] ?? brandFonts[0] ?? null,
  }
}

/**
 * The CSS custom properties the settings set on the root element. A key is
 * present only when a value was chosen, so an untouched store keeps every
 * tokens.css default — including nova's automatic dark scheme.
 */
export function resolveThemeVars(
  settings: ThemeSettings,
  brand?: BrandFallback | null,
): Record<string, string> {
  const vars: Record<string, string> = {}

  // Brand colour — theme setting, else Settings → Brand primary.
  const themeBrand = normalizeColor(pick(settings, 'colorPrimary'))
  const brandPrimary = brand?.colors?.primary?.[0]
  const brandColor = themeBrand ?? normalizeColor(brandPrimary?.background)
  if (brandColor) {
    // Text on the brand colour (the primary button's hover when no accent is
    // set). A Settings → Brand foreground is used only when it passes AA on
    // its background.
    const brandForeground = themeBrand ? null : normalizeColor(brandPrimary?.foreground)
    vars['--color-brand'] = brandColor
    // The design derives hover and active from Primary; tokens.css holds them
    // as fixed near-blacks, which a custom brand colour would otherwise keep.
    const brandHover = hoverShade(brandColor)
    vars['--color-brand-hover'] = brandHover
    vars['--color-brand-active'] = hoverShade(brandHover)
    // Darkening can carry a colour across the point where the other label
    // colour reads better, so the hover label is picked on the hover shade.
    vars['--color-button-hover-text'] = readableTextOn(brandHover)
    vars['--color-brand-contrast'] =
      brandForeground && contrastRatio(brandForeground, brandColor) >= MIN_TEXT_CONTRAST
        ? brandForeground
        : readableTextOn(brandColor)
  }

  // Accent — primary (solid) buttons and highlights.
  const accent = normalizeColor(settings.accent)
  if (accent && accent !== LEGACY_ACCENT_PLACEHOLDER) {
    vars['--color-accent'] = accent
    vars['--color-button'] = accent
    vars['--color-button-text'] = readableTextOn(accent)
    // The hover shade gets its own text colour: darkening can take a colour
    // across the point where the other text colour reads better.
    const hover = hoverShade(accent)
    vars['--color-button-hover'] = hover
    vars['--color-button-hover-text'] = readableTextOn(hover)
    vars['--color-button-active'] = hoverShade(hover)
  }

  // Background + text — always written as a pair, derived into nova's surface
  // palette, so a chosen text colour is never paired with the dark scheme's
  // background (or the reverse). The inverse pair (--color-fg-inverse /
  // --color-bg-inverse) is left alone on purpose: nova uses it for text over
  // imagery (hero, slideshow) and for the footer, where its white-on-near-black
  // reads correctly whatever the page palette is. Deriving it from a dark page
  // background puts dark headings on dark hero images.
  const bgIn = normalizeColor(settings.colorBackground)
  const fgIn = normalizeColor(settings.colorText)
  if (bgIn || fgIn) {
    const bg = bgIn ?? '#ffffff'
    const fg = fgIn ?? '#0a0a0a'
    Object.assign(vars, {
      '--color-bg': bg,
      '--color-bg-alt': `color-mix(in srgb, ${fg} 3%, ${bg})`,
      '--color-bg-muted': `color-mix(in srgb, ${fg} 6%, ${bg})`,
      '--color-bg-elevated': bg,
      '--color-fg': fg,
      '--color-fg-muted': `color-mix(in srgb, ${fg} 68%, ${bg})`,
      '--color-fg-subtle': `color-mix(in srgb, ${fg} 48%, ${bg})`,
      '--color-border': `color-mix(in srgb, ${fg} 10%, transparent)`,
      '--color-border-strong': `color-mix(in srgb, ${fg} 18%, transparent)`,
      '--header-bg': `color-mix(in srgb, ${bg} 86%, transparent)`,
    })
  }

  // Fonts — theme setting, else Settings → Brand fonts.
  const { heading, body } = resolveFonts(settings, brand)
  if (heading) vars['--font-display'] = fontStack(heading)
  if (body) vars['--font-body'] = fontStack(body)

  // The remaining colour roles the design lets a merchant set. Written AFTER
  // the background/text pair so an explicit choice beats the derived one.
  for (const [key, prop] of Object.entries(COLOR_ROLES)) {
    const c = normalizeColor(settings[key])
    if (c) vars[prop] = c
  }

  // Semantic rungs → tokens. An unknown value is ignored, so a stale saved
  // value falls back to tokens.css instead of writing garbage.
  for (const [key, { prop, values }] of Object.entries(RUNGS)) {
    const v = text(settings, key)
    // The design's default rung IS the token's value in tokens.css, so it is
    // not written: a store that changed nothing gets no stylesheet at all.
    if (v && v !== RUNG_DEFAULTS[key] && values[v]) vars[prop] = values[v]
  }
  const motion = text(settings, 'motion')
  if (motion && motion !== RUNG_DEFAULTS.motion && MOTION[motion]) {
    const [fast, base, slow] = MOTION[motion]
    vars['--duration-fast'] = fast
    vars['--duration-base'] = base
    vars['--duration-slow'] = slow
  }

  return vars
}

/** Colour settings that write straight to one role. */
const COLOR_ROLES: Readonly<Record<string, string>> = {
  colorSecondarySurface: '--color-bg-muted',
  colorBorder: '--color-border',
  colorSale: '--color-sale',
}

/** Semantic preset → the token it resolves to. */
const RUNGS: Readonly<Record<string, { prop: string; values: Record<string, string> }>> = {
  pageWidth: { prop: '--container-wide', values: { wide: '1440px', standard: '1200px', full: '100vw' } },
  sectionSpacing: {
    prop: '--section-pad-y',
    values: {
      none: 'var(--section-none)',
      small: 'var(--section-sm)',
      medium: 'var(--section-md)',
      large: 'var(--section-lg)',
      xlarge: 'var(--section-xl)',
    },
  },
  buttonRadius: {
    prop: '--btn-radius',
    values: { none: 'var(--radius-none)', small: 'var(--radius-sm)', medium: 'var(--radius-md)', pill: 'var(--radius-pill)' },
  },
  inputRadius: {
    prop: '--input-radius',
    values: { none: 'var(--radius-none)', small: 'var(--radius-sm)', medium: 'var(--radius-md)' },
  },
  cardRadius: {
    prop: '--card-radius',
    values: { none: 'var(--radius-none)', small: 'var(--radius-sm)', medium: 'var(--radius-md)' },
  },
  headingWeight: { prop: '--weight-heading', values: { regular: '400', medium: '500', semibold: '600' } },
  // `adapt` deliberately has no token — the card omits aspect-ratio instead.
  productImageRatio: { prop: '--ratio-product', values: { portrait: '4 / 5', square: '1 / 1', landscape: '3 / 2' } },
}

/** The rung each token already holds in tokens.css — the design's defaults (`pnpm check:design`). */
const RUNG_DEFAULTS: Readonly<Record<string, string>> = {
  pageWidth: 'wide',
  sectionSpacing: 'medium',
  buttonRadius: 'small',
  inputRadius: 'small',
  cardRadius: 'small',
  headingWeight: 'medium',
  productImageRatio: 'portrait',
  motion: 'standard',
}

/** Motion presets scale the three durations together; the OS preference still wins (tokens.css). */
const MOTION: Readonly<Record<string, readonly [string, string, string]>> = {
  standard: ['120ms', '200ms', '320ms'],
  reduced: ['0ms', '0ms', '0ms'],
}

/**
 * Settings that switch BEHAVIOUR rather than a value: `data-*` on the root
 * element, so CSS branches on them without a second source of truth. Returned
 * as data, applied by the provider — this module stays DOM-free.
 */
const ROOT_FLAGS: Readonly<Record<string, string>> = {
  cardBorder: 'cardBorder',
  buttonBorder: 'buttonBorder',
  cardHoverEffect: 'cardHover',
  badgeStyle: 'badgeStyle',
  buttonTextStyle: 'buttonText',
  typeScale: 'typeScale',
  productImageFit: 'productFit',
  iconStyle: 'iconStyle',
}
/**
 * Every enumerated global setting and the values it accepts — derived from the
 * tables above, so the live-preview allowlist (lib/live-settings.ts) can never
 * accept a value the resolver would ignore, or miss one it handles.
 */
export const ENUM_SETTINGS: Readonly<Record<string, readonly string[]>> = {
  ...Object.fromEntries(Object.entries(RUNGS).map(([key, { values }]) => [key, [...Object.keys(values), ...(key === 'productImageRatio' ? ['adapt'] : [])]])),
  motion: Object.keys(MOTION),
}
/** Colour settings beyond brand / background / text. */
export const EXTRA_COLOR_SETTINGS: readonly string[] = Object.keys(COLOR_ROLES)
/** Settings that become root `data-*` flags (string or boolean). */
export const FLAG_SETTINGS: readonly string[] = Object.keys(ROOT_FLAGS)

export function resolveRootFlags(settings: ThemeSettings): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [key, attr] of Object.entries(ROOT_FLAGS)) {
    const v = settings[key]
    if (typeof v === 'boolean') out[attr] = String(v)
    else if (typeof v === 'string' && /^[a-z0-9-]+$/i.test(v)) out[attr] = v
  }
  return out
}

/**
 * The stylesheet text for {@link resolveThemeVars}, or '' when nothing is set.
 *
 * Every declaration is `!important`. The rules it replaces have different
 * specificities — tokens.css / ai-tokens.css use `:root` (0,1,0), nova's
 * dark-scheme media rule uses `:root:not([data-scheme])` (0,2,0) — so any plain
 * selector would win or lose on source order, i.e. on where this <style> ends
 * up relative to the theme stylesheet. An important declaration beats every
 * normal declaration on the root element whatever its specificity or order.
 * It does not reach descendants: a section that sets `[data-scheme]` on itself
 * declares its own values on its own element and still re-scopes its subtree.
 */
export function themeSettingsCss(vars: Record<string, string>): string {
  const body = Object.entries(vars)
    // Defence in depth: every value is built from a normalized input, but this
    // text is injected into a <style> element, so nothing structural may pass.
    .filter(([k, v]) => /^--[a-z0-9-]+$/.test(k) && !/[<>{};!\\]/.test(v))
    .map(([k, v]) => `${k}:${v} !important;`)
    .join('')
  return body ? `:root{${body}}` : ''
}

/** First-party (/_tq/fonts proxy, B6) Google Fonts stylesheet for the resolved families, or null when none are set. */
export function fontStylesheetHref(settings: ThemeSettings, brand?: BrandFallback | null): string | null {
  const { heading, body } = resolveFonts(settings, brand)
  const families = Array.from(new Set([heading, body].filter((f): f is string => !!f)))
  if (!families.length) return null
  const query = families
    .map((f) => `family=${encodeURIComponent(f).replace(/%20/g, '+')}:wght@400;500;600;700`)
    .join('&')
  return `/_tq/fonts/css2?${query}&display=swap`
}

/**
 * The header logo image: the theme's own logo, else the Settings → Brand logo,
 * else null (the header then shows the shop name as text).
 */
export function resolveLogo(
  settings: ThemeSettings,
  brand?: BrandFallback | null,
): { url: string; altText: string | null } | null {
  const themeLogo = normalizeImageUrl(settings.logo)
  if (themeLogo) return { url: themeLogo, altText: null }
  const brandLogo = normalizeImageUrl(brand?.logo?.url)
  if (brandLogo) return { url: brandLogo, altText: brand?.logo?.altText ?? null }
  return null
}
