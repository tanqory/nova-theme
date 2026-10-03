// Run: npm test  (node --test --experimental-strip-types)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  LEGACY_ACCENT_PLACEHOLDER,
  MIN_TEXT_CONTRAST,
  contrastRatio,
  fontStylesheetHref,
  hoverShade,
  normalizeColor,
  normalizeImageUrl,
  readableTextOn,
  resolveLogo,
  resolveThemeVars,
  themeSettingsCss,
  type BrandFallback,
  resolveRootFlags,
  LEGACY_KEYS,
  resolveFonts,
} from './theme-settings.ts'

const scaffold = JSON.parse(readFileSync(new URL('../config/settings.json', import.meta.url), 'utf8'))

const brand: BrandFallback = {
  logo: { url: 'https://cdn.example.com/brand-logo.png', altText: 'Acme' },
  colors: { primary: [{ background: '#123456', foreground: '#fefefe' }] },
  fonts: ['Lora', 'Inter'],
}

test('the shipped settings.json changes nothing: no variables, no stylesheet, no font request', () => {
  assert.deepEqual(resolveThemeVars(scaffold), {})
  assert.equal(themeSettingsCss(resolveThemeVars(scaffold)), '')
  assert.equal(fontStylesheetHref(scaffold), null)
  assert.equal(resolveLogo(scaffold), null)
})

test('an installed theme still carrying the legacy accent placeholder keeps the theme buttons', () => {
  const vars = resolveThemeVars({ ...scaffold, accent: LEGACY_ACCENT_PLACEHOLDER })
  assert.equal(vars['--color-button'], undefined)
  assert.equal(vars['--color-accent'], undefined)
  // Upper-case spelling of the same placeholder is the same placeholder.
  assert.equal(resolveThemeVars({ accent: '#0A0A0A' })['--color-button'], undefined)
})

test('accent (what ai-api writes) drives the accent token and primary buttons with readable text', () => {
  const vars = resolveThemeVars({ ...scaffold, accent: '#C2410C' })
  assert.equal(vars['--color-accent'], '#c2410c')
  assert.equal(vars['--color-button'], '#c2410c')
  assert.equal(vars['--color-button-text'], '#ffffff')
  assert.equal(vars['--color-button-hover'], hoverShade('#c2410c'))
  assert.equal(vars['--color-button-hover-text'], '#ffffff')
  assert.equal(resolveThemeVars({ accent: '#fde047' })['--color-button-text'], '#0a0a0a')
})

test('brand colour: theme setting wins, Settings → Brand is the fallback', () => {
  const fromBrand = resolveThemeVars({ colorBrand: '' }, brand)
  assert.equal(fromBrand['--color-brand'], '#123456')
  assert.equal(fromBrand['--color-brand-contrast'], '#fefefe')

  const fromTheme = resolveThemeVars({ colorBrand: '#ffffff' }, brand)
  assert.equal(fromTheme['--color-brand'], '#ffffff')
  assert.equal(fromTheme['--color-brand-contrast'], '#0a0a0a')

  // A Brand foreground that fails AA on its background is not used.
  const weak = resolveThemeVars({}, { colors: { primary: [{ background: '#fde047', foreground: '#ffffff' }] } })
  assert.equal(weak['--color-brand-contrast'], '#0a0a0a')
})

test('hover text: a light brand colour gets dark hover text (the hover no longer keeps --color-bg)', () => {
  const css = readFileSync(new URL('../assets/styles.css', import.meta.url), 'utf8')
  const hover = /\.btn--primary:hover\s*\{([^}]*)\}/.exec(css)?.[1] ?? ''
  // The roles are real tokens now (no var() fallbacks in styles.css): by default
  // they point at the brand tokens, and an accent re-points the whole set.
  assert.match(hover, /background:\s*var\(--color-button-hover\)/)
  assert.match(hover, /color:\s*var\(--color-button-hover-text\)/)
  const tokens = readFileSync(new URL('../assets/tokens.css', import.meta.url), 'utf8')
  assert.match(tokens, /--color-button-hover:\s*var\(--color-brand-hover\)/)
  assert.match(tokens, /--color-button-hover-text:\s*var\(--color-brand-contrast\)/)
  // …and a light brand colour gets a dark label on its (darker) hover shade too.
  assert.equal(resolveThemeVars({ colorPrimary: '#fde047' })['--color-button-hover-text'], '#0a0a0a')
  assert.equal(resolveThemeVars({ colorBrand: '#fde047' })['--color-brand-contrast'], '#0a0a0a')
})

test('every text colour picked meets WCAG AA (4.5:1), on the colour and on its hover shade', () => {
  // Colours the previous white-vs-#0a0a0a pick failed: mid-greys and blues
  // just under the crossover, and rgb()/hsl() input, which always got white.
  const cases = ['#787878', '#777777', '#7a7a7a', '#376efa', '#1f6feb', 'rgb(253, 224, 71)', 'hsl(50 98% 64%)', 'rgb(120 120 120)']
  for (const input of cases) {
    const c = normalizeColor(input)
    assert.ok(c, input)
    const text = readableTextOn(c)
    assert.ok(contrastRatio(c, text) >= MIN_TEXT_CONTRAST, `${input}: ${text} is ${contrastRatio(c, text).toFixed(2)}:1`)
    const vars = resolveThemeVars({ accent: input })
    const hoverRatio = contrastRatio(vars['--color-button-hover'], vars['--color-button-hover-text'])
    assert.ok(hoverRatio >= MIN_TEXT_CONTRAST, `${input} hover: ${hoverRatio.toFixed(2)}:1`)
  }
  // Exhaustive over a coarse RGB grid.
  const hex = (n: number) => n.toString(16).padStart(2, '0')
  for (let r = 0; r < 256; r += 17)
    for (let g = 0; g < 256; g += 17)
      for (let b = 0; b < 256; b += 17) {
        const c = `#${hex(r)}${hex(g)}${hex(b)}`
        for (const bg of [c, hoverShade(c)]) {
          assert.ok(contrastRatio(bg, readableTextOn(bg)) >= MIN_TEXT_CONTRAST, bg)
        }
      }
})

test('invalid rgb()/hsl() and translucent colours are rejected so the theme default applies', () => {
  for (const bad of [
    'rgb(300, 0, 0)', 'rgb(1, 2)', 'rgb(1, 2, 3, 4, 5)', 'rgb(10%, 20, 30)', 'rgb(1 2 3,)', 'rgb(1,, 2, 3)',
    'rgb(-1 0 0)', 'rgb(0 0 0 / 0.5)', 'rgba(1, 2, 3, 0.5)', 'hsl(120 50 50)', 'hsl(120 150% 50%)',
    'hsl(abc 50% 50%)', '#00000080', '#fff8', 'red', 'rgb()', 'rgb(1 2 3 / )',
  ]) {
    assert.equal(normalizeColor(bad), null, bad)
    assert.deepEqual(resolveThemeVars({ colorBrand: bad }), {}, bad)
  }
  // Valid forms normalise to one canonical hex.
  assert.equal(normalizeColor('rgb(253 224 71)'), '#fde047')
  assert.equal(normalizeColor('rgba(253, 224, 71, 1)'), '#fde047')
  assert.equal(normalizeColor('rgb(100%, 0%, 0%)'), '#ff0000')
  assert.equal(normalizeColor('hsl(120deg 50% 50%)'), '#40bf40')
  assert.equal(normalizeColor('hsl(-30, 100%, 50%)'), '#ff0080')
  assert.equal(normalizeColor('#ABC'), '#aabbcc')
  assert.equal(normalizeColor('#aabbccff'), '#aabbcc')
})

test('background and text are written as a pair and derive the surface palette', () => {
  const onlyText = resolveThemeVars({ colorText: '#222222' })
  assert.equal(onlyText['--color-fg'], '#222222')
  assert.equal(onlyText['--color-bg'], '#ffffff', 'a text colour alone must not meet the dark-scheme background')
  // Text over imagery and the footer keep nova's white-on-near-black pair.
  assert.equal(onlyText['--color-fg-inverse'], undefined)
  assert.equal(onlyText['--color-bg-inverse'], undefined)

  const dark = resolveThemeVars({ colorBackground: '#101820', colorText: '#f2f2f2' })
  assert.equal(dark['--color-bg'], '#101820')
  assert.equal(dark['--header-bg'], 'color-mix(in srgb, #101820 86%, transparent)')
  assert.equal(dark['--color-fg-muted'], 'color-mix(in srgb, #f2f2f2 68%, #101820)')
})

test('fonts: theme setting per role, else Settings → Brand fonts, with a fitting fallback stack', () => {
  const fromBrand = resolveThemeVars({}, brand)
  assert.match(fromBrand['--font-display'], /^"Lora", Georgia/)
  assert.match(fromBrand['--font-body'], /^"Inter", system-ui/)

  const mixed = resolveThemeVars({ fontHeading: 'Playfair Display', fontBody: '' }, brand)
  assert.match(mixed['--font-display'], /^"Playfair Display", Georgia/)
  assert.match(mixed['--font-body'], /^"Inter",/)

  assert.equal(
    fontStylesheetHref({ fontHeading: 'Playfair Display', fontBody: 'Inter' }),
    '/_tq/fonts/css2?family=Playfair+Display:wght@400;500;600;700&family=Inter:wght@400;500;600;700&display=swap',
  )
  // One family used for both roles is requested once.
  assert.equal(
    fontStylesheetHref({ fontHeading: 'Kanit', fontBody: 'Kanit' }),
    '/_tq/fonts/css2?family=Kanit:wght@400;500;600;700&display=swap',
  )
})

test('logo precedence: theme logo > Settings → Brand logo > none (shop name text)', () => {
  assert.deepEqual(resolveLogo({ logo: 'https://cdn.example.com/theme.png' }, brand), {
    url: 'https://cdn.example.com/theme.png',
    altText: null,
  })
  // shopName no longer hides the brand logo.
  assert.deepEqual(resolveLogo({ logo: '', shopName: 'Typed name' }, brand), {
    url: 'https://cdn.example.com/brand-logo.png',
    altText: 'Acme',
  })
  assert.equal(resolveLogo({ logo: '', shopName: 'Typed name' }, { logo: null }), null)
})

test('values that could break out of the <style> element are refused, not escaped', () => {
  for (const bad of ['red;}</style><script>alert(1)</script>', 'url(javascript:x)', '#12', 'expression(1)']) {
    assert.equal(normalizeColor(bad), null, bad)
  }
  const css = themeSettingsCss(
    resolveThemeVars({
      accent: '#fff;}body{display:none',
      fontHeading: 'Inter"}</style><script>',
      colorBrand: 'rgb(1, 2, 3)',
    }),
  )
  assert.equal(
    css,
    ':root{--color-brand:#010203 !important;--color-brand-hover:#010203 !important;--color-brand-active:#010203 !important;' +
      '--color-button-hover-text:#ffffff !important;--color-brand-contrast:#ffffff !important;}',
  )
  assert.equal(normalizeImageUrl('javascript:alert(1)'), null)
  assert.equal(normalizeImageUrl('"><img src=x onerror=1>'), null)
  assert.equal(normalizeImageUrl('/media/logo.png'), '/media/logo.png')
  assert.equal(normalizeImageUrl({ url: 'https://cdn.example.com/a.png' }), 'https://cdn.example.com/a.png')
})

test('precedence does not depend on source order: every declaration is !important', () => {
  // tokens.css `:root` is (0,1,0) and nova's dark-scheme rule
  // `:root:not([data-scheme])` is (0,2,0); a plain `:root:root` (0,2,0) only
  // won that tie by coming later in the document.
  assert.equal(themeSettingsCss({ '--color-accent': '#c2410c' }), ':root{--color-accent:#c2410c !important;}')
  const css = themeSettingsCss(resolveThemeVars({ accent: '#c2410c', colorText: '#222222', fontBody: 'Inter' }))
  const declarations = css.slice(':root{'.length, -1).split(';').filter(Boolean)
  assert.ok(declarations.length > 5)
  for (const d of declarations) assert.match(d, / !important$/, d)
  assert.equal(readableTextOn('#000000'), '#ffffff')
  assert.equal(readableTextOn('#ffffff'), '#0a0a0a')
})


// ── the design's vocabulary, one pipeline ────────────────────────────────────
// The schema follows design/spec/global.json. The names an earlier build saved
// under are still read, and every global prop — not only colour and type —
// resolves through this module, so the editor's live preview moves all of them.

test('design names are the schema; the names an earlier build saved under still work', () => {
  assert.deepEqual(LEGACY_KEYS, { colorPrimary: 'colorBrand', headingFont: 'fontHeading', bodyFont: 'fontBody' })
  assert.equal(resolveThemeVars({ colorPrimary: '#0055ff' })['--color-brand'], '#0055ff')
  assert.equal(resolveThemeVars({ colorBrand: '#0055ff' })['--color-brand'], '#0055ff')
  // A value saved under the new name is not shadowed by a stale old one…
  assert.equal(resolveThemeVars({ colorPrimary: '#0055ff', colorBrand: '#ff0000' })['--color-brand'], '#0055ff')
  // …and an EMPTY new value does not hide a real old one.
  assert.equal(resolveThemeVars({ colorPrimary: '', colorBrand: '#ff0000' })['--color-brand'], '#ff0000')
  assert.deepEqual(resolveFonts({ headingFont: 'Inter', bodyFont: 'Lora' }), { heading: 'Inter', body: 'Lora' })
  assert.deepEqual(resolveFonts({ fontHeading: 'Inter', fontBody: 'Lora' }), { heading: 'Inter', body: 'Lora' })
})

test('hover and active derive from the chosen brand colour instead of staying near-black', () => {
  const vars = resolveThemeVars({ colorPrimary: '#3366cc' })
  assert.notEqual(vars['--color-brand-hover'], undefined)
  assert.notEqual(vars['--color-brand-hover'], vars['--color-brand'])
  assert.notEqual(vars['--color-brand-active'], vars['--color-brand-hover'])
  assert.ok(contrastRatio(vars['--color-button-hover-text'], vars['--color-brand-hover']) >= MIN_TEXT_CONTRAST)
})

test('a semantic rung becomes a token; the design default writes nothing; garbage is ignored', () => {
  assert.equal(resolveThemeVars({ buttonRadius: 'pill' })['--btn-radius'], 'var(--radius-pill)')
  assert.equal(resolveThemeVars({ pageWidth: 'standard' })['--container-wide'], '1200px')
  assert.equal(resolveThemeVars({ sectionSpacing: 'large' })['--section-pad-y'], 'var(--section-lg)')
  assert.equal(resolveThemeVars({ productImageRatio: 'square' })['--ratio-product'], '1 / 1')
  assert.deepEqual(resolveThemeVars({ buttonRadius: 'small', pageWidth: 'wide', sectionSpacing: 'medium', motion: 'standard' }), {})
  assert.deepEqual(resolveThemeVars({ buttonRadius: '19px', cardRadius: 'url(x)', motion: 'fast;}' }), {})
  const reduced = resolveThemeVars({ motion: 'reduced' })
  assert.deepEqual([reduced['--duration-fast'], reduced['--duration-base'], reduced['--duration-slow']], ['0ms', '0ms', '0ms'])
  // Every rung survives the <style> filter — nothing the resolver writes is dropped on the way out.
  const css = themeSettingsCss(resolveThemeVars({ buttonRadius: 'pill', productImageRatio: 'square', colorSale: '#aa0000' }))
  assert.match(css, /--btn-radius:var\(--radius-pill\) !important;/)
  assert.match(css, /--ratio-product:1 \/ 1 !important;/)
  assert.match(css, /--color-sale:#aa0000 !important;/)
})

test('an explicit surface or border colour beats the one derived from background + text', () => {
  const vars = resolveThemeVars({ colorBackground: '#ffffff', colorText: '#111111', colorBorder: '#cccccc', colorSecondarySurface: '#f0f0f0' })
  assert.equal(vars['--color-border'], '#cccccc')
  assert.equal(vars['--color-bg-muted'], '#f0f0f0')
})

test('behaviour switches come back as root data-* flags, and only well-formed ones', () => {
  assert.deepEqual(
    resolveRootFlags({ cardHoverEffect: 'image-swap', badgeStyle: 'outline', cardBorder: true, typeScale: 'large', iconStyle: 'filled' }),
    { cardHover: 'image-swap', badgeStyle: 'outline', cardBorder: 'true', typeScale: 'large', iconStyle: 'filled' },
  )
  assert.deepEqual(resolveRootFlags({ cardHoverEffect: '"><script>', badgeStyle: '' }), {})
  assert.deepEqual(resolveRootFlags(scaffold).cardHover, (scaffold as Record<string, unknown>).cardHoverEffect)
})

test('fonts: no Google host is referenced before consent (B6, first-party /_tq/fonts)', async () => {
  const { readFileSync } = await import('node:fs')
  for (const f of ['index.html', 'entry.ts', 'lib/theme-settings.ts']) {
    const src = readFileSync(new URL(`../${f}`, import.meta.url), 'utf8')
    assert.doesNotMatch(src, /fonts\.(googleapis|gstatic)\.com/, `${f} must not reference a Google font host`)
  }
})
