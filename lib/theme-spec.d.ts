/**
 * Tanqory theme spec v1 — the ONLY things a theme and the platform agree on.
 * A theme is a directory the store owns. The platform never imports its code;
 * it builds it, checks it against this spec, and calls `render()` inside an
 * isolate. Everything else (framework, data client, cart, styling) is the theme's.
 */

/** What the runtime hands to `render()`. */
export interface RenderContext {
  /** Spec version the runtime speaks. */
  spec: 1
  /** `serve` = a shopper on the published host · `preview` = the editor canvas
   *  (theme should render client-only so the canvas bridge can take over) */
  mode: 'serve' | 'preview'
  store: {
    id: string
    /** Storefront GraphQL base, e.g. https://api.tanqory.dev (theme calls it itself). */
    apiBase: string
    /** Publishable storefront token, when the store has one. */
    token?: string
    /** Country / locale hints from the request (Accept-Language, market). */
    country?: string
    locale?: string
  }
  /** The store's content revision — replaces the theme's bundled starter JSON. */
  content: {
    revision: string
    templates: Record<string, unknown>
    groups: Record<string, unknown>
    settings: Record<string, unknown>
  }
  /** Where the client bundle of THIS ThemeVersion is served from (absolute or root-relative). */
  assets: { base: string; manifest: Record<string, { file: string; css?: string[]; isEntry?: boolean }> }
  /** Bumped by the platform when catalog/menus change; use it in cache keys. */
  dataVersion: string
}

/** The theme's SSR entry (dist/ssr/entry.mjs) must export exactly these. */
export interface ThemeEntry {
  /** Render one request to a full HTML document (or any Response). */
  render(request: Request, ctx: RenderContext): Promise<Response>
  /** Static description of the theme for the editor — theme.manifest.json. */
  manifest: ThemeManifest
}

export interface ThemeManifest {
  spec: 1
  name: string
  version: string
  sections: Array<{ name: string; title?: string; role?: 'layout' | 'section' | 'block'; area?: string; attributes?: Record<string, unknown>; allowedBlocks?: string[]; presets?: unknown[]; requiresContext?: string[] }>
  templates: string[]
  groups: string[]
  settings?: { groups: Array<{ title?: string; settings: Array<{ id: string; type: string; [k: string]: unknown }> }> }
}

/** Canvas protocol — messages between the editor and the theme's preview page. */
export const CANVAS_PROTOCOL: {
  readonly fromTheme: readonly ['tq:ready', 'tq:select', 'tanqory-section-selected', 'tanqory-block-selected', 'tanqory-content-changed', 'tanqory-content', 'tanqory-collections', 'tanqory-menus', 'tanqory-products', 'tq-preview-height']
  readonly toTheme: readonly ['tq:set-content', 'tq:select', 'tq:theme-settings', 'tanqory-preview-update-section', 'tanqory-preview-select', 'tanqory-preview-reorder-sections', 'tanqory-preview-remove-section', 'tanqory-preview-insert-section', 'tanqory-get-content', 'tanqory-request-collections', 'tanqory-request-menus', 'tanqory-request-products']
}

export const LIMITS: { readonly ssrBundleBytes: number; readonly clientBundleBytes: number; readonly renderMs: number }

export interface CheckResult { ok: boolean; errors: string[]; warnings: string[]; manifest?: ThemeManifest }
/** Validate a BUILT theme directory (has dist/ssr/entry.mjs + dist/client/). */
export function checkTheme(themeDir: string): Promise<CheckResult>
export function validateManifest(manifest: unknown): string[]
