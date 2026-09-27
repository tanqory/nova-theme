/**
 * The theme's SSR entry — the ONE thing the Tanqory runtime calls.
 *
 * The platform builds this file to `dist/ssr/entry.mjs`, loads it inside an
 * isolate, and calls `render(request, ctx)` per request. Everything in here is
 * the theme's own code: how it routes, how it fetches data, how it builds the
 * document. `ctx` (see @tanqory/theme-spec) carries what only the platform
 * knows — the store, its content revision, where this version's client bundle
 * is served from, and whether this is the editor canvas.
 *
 * A theme that wants to do it differently (another framework, its own data
 * client, no hydration) replaces this file. The spec only asks for
 * `render()` and `manifest`.
 */
import { renderSectionPreviewHTML, renderStorefrontHTML } from './lib/tanqory/ssg'
import { createLiveData, createMockData, type DataApi } from './lib/tanqory/index'
import { computeHead } from './lib/head'
import { jsonLdTag } from './lib/structured-data'
import { detailHandles, matchRoute, resolvePageTemplate } from './lib/routes'
import { localeStrings, themeLocaleOf } from './lib/theme-locale'
import { fontStylesheetHref, resolveThemeVars, themeSettingsCss } from './lib/theme-settings'
import collections from './lib/collections.json'
import bundledSettings from './config/settings.json'
import manifestJson from './theme.manifest.json'

// ── the theme's static shape (bundled at build time) ─────────────────────────
const sections = import.meta.glob('./sections/*.tsx', { eager: true })
const shell = import.meta.glob('./layouts/*.tsx', { eager: true })
const bundledTemplates = import.meta.glob('./templates/*.json', { eager: true }) as Record<string, { default: unknown }>
const bundledGroups = import.meta.glob('./groups/*.json', { eager: true }) as Record<string, { default: unknown }>
const localeModules = import.meta.glob('./locales/*.json', { eager: true }) as Record<string, { default: Record<string, string> }>
const localeMaps: Record<string, Record<string, string>> = Object.fromEntries(
  Object.entries(localeModules).map(([path, mod]) => [path.match(/\/([^/]+)\.json$/)?.[1] ?? 'en', mod.default]),
)

/** What the editor reads (spec v1 manifest), derived from the generated theme.manifest.json. */
const gen = manifestJson as unknown as { theme: { name: string; version: string }; sections: unknown[]; settings?: unknown }
export const manifest = {
  spec: 1 as const,
  name: gen.theme.name,
  version: gen.theme.version,
  sections: gen.sections,
  templates: Object.keys(bundledTemplates).map((k) => k.replace(/^.*\//, '').replace(/\.json$/, '')),
  groups: Object.keys(bundledGroups).map((k) => k.replace(/^.*\//, '').replace(/\.json$/, '')),
  ...(gen.settings ? { settings: gen.settings } : {}),
} as unknown as import('./lib/theme-spec.d.ts').ThemeManifest

type Ctx = import('./lib/theme-spec.d.ts').RenderContext

/** Content (templates / groups / settings) from the store's revision, else the theme's starter files. */
function contentOf(ctx: Ctx) {
  const pages: Record<string, { default: unknown }> = {}
  const tpl = ctx.content?.templates ?? {}
  if (Object.keys(tpl).length) for (const [name, doc] of Object.entries(tpl)) pages[`./templates/${name}.json`] = { default: doc }
  else Object.assign(pages, bundledTemplates)
  const groups: Record<string, { default: unknown }> = {}
  const grp = ctx.content?.groups ?? {}
  if (Object.keys(grp).length) for (const [name, doc] of Object.entries(grp)) groups[`./groups/${name}.json`] = { default: doc }
  else Object.assign(groups, bundledGroups)
  const settings = { ...(bundledSettings as Record<string, unknown>), ...(ctx.content?.settings ?? {}) }
  return { pages, groups, settings }
}

const templateExists = (pages: Record<string, unknown>) => (name: string) => Object.keys(pages).some((k) => k.endsWith(`/${name}.json`))

async function bootData(ctx: Ctx, pathname: string): Promise<{ data: DataApi; live: boolean }> {
  if (ctx.store?.apiBase && ctx.store.id) {
    const data = await createLiveData({
      endpoint: ctx.store.apiBase,
      storeId: ctx.store.id,
      token: ctx.store.token,
      country: ctx.store.country,
      locale: ctx.store.locale,
      ...detailHandles(pathname),
    })
    return { data, live: true }
  }
  return { data: createMockData(collections), live: false }
}

const esc = (v: unknown) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** The client bundle for this ThemeVersion, from Vite's manifest (`ctx.assets`). */
function assetTags(ctx: Ctx): string {
  const entry = entryChunk(ctx)
  if (!entry) return ''
  return `${styleTags(ctx)}<script type="module" src="${assetBase(ctx)}/${entry.file}"></script>`
}

const assetBase = (ctx: Ctx) => ctx.assets?.base?.replace(/\/$/, '') ?? ''
const entryChunk = (ctx: Ctx) => {
  const m = ctx.assets?.manifest ?? {}
  return Object.values(m).find((e) => e.isEntry) ?? m['main.tsx']
}
/** Just the CSS — the section preview wants the theme's look with no client app. */
function styleTags(ctx: Ctx): string {
  const entry = entryChunk(ctx)
  if (!entry) return ''
  return (entry.css ?? []).map((c) => `<link rel="stylesheet" href="${assetBase(ctx)}/${c}">`).join('')
}

/**
 * How a preview page announces that it IS one. The picker hides the iframe
 * until this arrives and shows "no preview" if it never does, so a runtime that
 * quietly falls through to the storefront can never be mistaken for a working
 * preview. It also carries the height the picker sizes its box to.
 */
const HEIGHT_REPORTER =
  `<script>(function(){function p(){try{parent.postMessage({type:'tq-preview-height',` +
  `height:Math.max(document.body.scrollHeight,document.documentElement.scrollHeight)},'*')}catch(e){}}` +
  `addEventListener('load',p);try{new ResizeObserver(p).observe(document.body)}catch(e){}` +
  `setTimeout(p,120);setTimeout(p,450)})();</script>`

/**
 * The editor's "Add section" preview: ONE section, server-rendered, with no
 * shell, no routing and no client app.
 *
 * It has to live here because the canvas is served from a BUILT ThemeVersion
 * inside an isolate. The dev-server middleware that used to answer this
 * (vite.config.ts) is not running there, and `render()` answers every other
 * path on that plane with the canvas shell — so the picker received the empty
 * preview document and reported "no preview" for every section in the list.
 *
 * Mock data on purpose: the question is "what does this look like", and a live
 * fetch per hovered row would make browsing the list slow.
 */
function sectionPreview(url: URL, ctx: Ctx, settings: Record<string, unknown>): Response {
  const type = url.searchParams.get('type') ?? ''
  let override: Record<string, unknown> | undefined
  const raw = url.searchParams.get('settings')
  if (raw) {
    try {
      // `atob`, not Buffer: prod runs this entry inside a Cloudflare Worker,
      // which has no Node globals. The escape/unescape pair is the inverse of
      // the picker's `btoa(unescape(encodeURIComponent(...)))` and survives
      // non-ASCII settings that a bare atob would mangle.
      override = JSON.parse(decodeURIComponent(escape(atob(raw)))) as Record<string, unknown>
    } catch {
      /* a malformed override just means the section's own defaults */
    }
  }
  const lang = themeLocaleOf((settings as { locale?: unknown }).locale, Object.keys(localeMaps))
  try {
    // No layout renders here, so the layout's ThemeSettingsProvider never runs:
    // emit the same stylesheet it would, or the section shows tokens.css
    // defaults instead of the merchant's own colours and fonts.
    const vars = themeSettingsCss(resolveThemeVars(settings as never))
    const fontHref = fontStylesheetHref(settings as never)
    const body = renderSectionPreviewHTML(
      { sections, data: createMockData(collections), settings, locale: localeStrings(lang, localeMaps) },
      type,
      override,
    )
    const html =
      `<!doctype html><html lang="${esc(lang)}"><head><meta charset="utf-8">` +
      `<meta name="viewport" content="width=device-width, initial-scale=1">` +
      styleTags(ctx) +
      (fontHref ? `<link rel="stylesheet" href="${esc(fontHref)}">` : '') +
      (vars ? `<style id="tq-theme-settings">${vars}</style>` : '') +
      `<style>html,body{margin:0}</style></head><body>${body}${HEIGHT_REPORTER}</body></html>`
    return new Response(html, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } })
  } catch (e) {
    // 200 with the reason, not 500: the picker only listens for the reporter, so
    // a failing section should say WHY in the pane rather than show "no preview".
    return new Response(
      `<!doctype html><meta charset="utf-8"><body style="margin:0"><pre style="padding:24px;font:13px ui-monospace,monospace;color:#b42318;white-space:pre-wrap">${esc((e as Error)?.message ?? e)}</pre>${HEIGHT_REPORTER}</body>`,
      { status: 200, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } },
    )
  }
}

function document(opts: { lang: string; head: ReturnType<typeof computeHead>; body: string; state: unknown; content: unknown; assets: string; mode: string }): string {
  const { head } = opts
  const meta = [
    head.description ? `<meta name="description" content="${esc(head.description)}">` : '',
    head.title ? `<meta property="og:title" content="${esc(head.title)}">` : '',
    head.description ? `<meta property="og:description" content="${esc(head.description)}">` : '',
    head.image ? `<meta property="og:image" content="${esc(head.image)}">` : '',
    head.type ? `<meta property="og:type" content="${esc(head.type)}">` : '',
    head.siteName ? `<meta property="og:site_name" content="${esc(head.siteName)}">` : '',
    // schema.org Product/Offer for search and AI answer engines — in the server HTML, because crawlers do not run JS.
    jsonLdTag(head.jsonLd),
  ].filter(Boolean).join('\n    ')
  const json = (v: unknown) => JSON.stringify(v).replace(/</g, '\\u003c')
  return `<!doctype html>
<html lang="${esc(opts.lang)}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${esc(head.title)}</title>
    ${meta}
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600&display=swap" rel="stylesheet" />
    ${opts.assets}
  </head>
  <body data-tq-mode="${esc(opts.mode)}">
    <script>window.__TQ_CONTENT__=${json(opts.content)}${opts.state ? `;window.__TQ_STATE__=${json(opts.state)}` : ''}</script>
    <div id="root">${opts.body}</div>
  </body>
</html>`
}

/** Exported for tests: the server document shell (head tags included). */
export { document as renderDocument }

/** Spec v1: one request → one Response. */
export async function render(request: Request, ctx: Ctx): Promise<Response> {
  const url = new URL(request.url)
  const { pages, groups, settings } = contentOf(ctx)
  const lang = themeLocaleOf((settings as { locale?: unknown }).locale, Object.keys(localeMaps))
  const locale = localeStrings(lang, localeMaps)
  const content = { revision: ctx.content?.revision ?? null, templates: Object.fromEntries(Object.entries(pages).map(([k, v]) => [k.replace(/^.*\//, '').replace(/\.json$/, ''), v.default])), groups: Object.fromEntries(Object.entries(groups).map(([k, v]) => [k.replace(/^.*\//, '').replace(/\.json$/, ''), v.default])), settings }

  // The editor canvas is client-only: the canvas bridge renders its own tree,
  // so server markup would only be a hydration mismatch. Ship the shell + data.
  if (ctx.mode === 'preview') {
    // The picker's section preview renders caller-supplied settings. It exists
    // ONLY on the preview plane: answered on the published host it would render
    // anyone's text and links under the shop's own origin.
    if (url.pathname === '/__editor/preview-section') return sectionPreview(url, ctx, settings)
    const html = document({ lang, head: { title: settings.shopName ? String(settings.shopName) : 'Preview' } as ReturnType<typeof computeHead>, body: '', state: null, content, assets: assetTags(ctx), mode: 'preview' })
    return new Response(html, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } })
  }

  let data: DataApi
  let live = false
  try {
    ;({ data, live } = await bootData(ctx, url.pathname))
  } catch (e) {
    // A configured store whose data is unreachable gets an honest 503, never fixtures.
    return new Response(`<!doctype html><title>Store temporarily unavailable</title><h1>This store is temporarily unavailable</h1><p>${esc((e as Error)?.message)}</p>`, { status: 503, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'retry-after': '30' } })
  }
  const page = resolvePageTemplate(url.pathname, data, templateExists(pages))
  const route = matchRoute(url.pathname)
  const status = route.template === '404' ? 404 : 200
  // A 404 is not worth a day at the edge: a product published after this
  // request would stay missing until the cache turned over.
  const cacheControl = status === 404
    ? 'public, max-age=0, s-maxage=60'
    : 'public, max-age=0, s-maxage=86400, stale-while-revalidate=604800'
  const body = renderStorefrontHTML({ sections, pages, groups, shell, data, settings, locale, page })
  const head = computeHead(url.pathname, data, settings as { shopName?: string }, url.origin)
  const state = live && data.getSnapshot ? { page, bootstrap: data.getSnapshot() } : null
  const html = document({ lang, head, body, state, content, assets: assetTags(ctx), mode: 'serve' })
  return new Response(html, {
    status,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      // The platform caches per (version, revision, dataVersion); this is the theme's own hint.
      'cache-control': cacheControl,
      'x-theme': `${manifest.name}@${manifest.version ?? '0'}`,
    },
  })
}
