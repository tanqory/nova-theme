import { defineConfig, loadEnv, type Plugin, type PluginOption } from 'vite'
import react from '@vitejs/plugin-react'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { IncomingMessage } from 'node:http'
import { isExactOrigin, studioOrigins } from './lib/live-settings.ts'

// Both dev middlewares below act on behalf of the editor: one writes template
// files, the other renders arbitrary section settings to HTML. Each only serves
// a request that comes from this dev server's own pages, a studio origin, or
// (this is a laptop loop) another loopback origin — never a page elsewhere that
// framed or fetched the dev server. `Origin` covers fetches; the picker iframe
// is a navigation, which carries only `Referer`.
const LOOPBACK = /^(?:localhost|127\.0\.0\.1|(?:[a-z0-9-]+\.)+localhost)$/i
function callerAllowed(req: IncomingMessage): boolean {
  const raw = req.headers.origin ?? req.headers.referer
  if (typeof raw !== 'string' || !raw) return false
  let origin: URL
  try {
    origin = new URL(raw)
  } catch {
    return false
  }
  const host = req.headers['x-forwarded-host'] ?? req.headers.host
  if (typeof host === 'string' && host && origin.host === host) return true
  if (LOOPBACK.test(origin.hostname)) return true
  return isExactOrigin(origin.origin) && studioOrigins(process.env.VITE_TQ_STUDIO_ORIGINS, true).includes(origin.origin)
}
const PAGE_NAME = /^[a-z0-9][a-z0-9._-]{0,80}$/i
const escapeHtml = (v: string): string =>
  v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

// Editor persistence — the editor's "Save" POSTs the content tree here.
//   DOKS  (CODE_URL + THEME_ID set): PUT to the writable code store (PVC) so the
//          edit survives the scale-to-zero pod and the next fetch picks it up.
//   local (neither set): write templates/<page>.json on disk.
function studioSave(): Plugin {
  return {
    name: 'studio-save',
    configureServer(server) {
      server.middlewares.use('/__studio/save', (req, res) => {
        if (req.method !== 'POST') { res.statusCode = 405; return res.end() }
        if (!callerAllowed(req)) { res.statusCode = 403; return res.end(JSON.stringify({ ok: false, error: 'forbidden origin' })) }
        let body = ''
        req.on('data', (c) => (body += c))
        req.on('end', async () => {
          try {
            const { page = 'index', doc } = JSON.parse(body)
            // The page name becomes a file name: one path segment, no traversal.
            if (typeof page !== 'string' || !PAGE_NAME.test(page) || page.includes('..')) {
              res.statusCode = 400
              return res.end(JSON.stringify({ ok: false, error: 'invalid page name' }))
            }
            // theme-kit template format is { sections: [...] }
            const content = JSON.stringify(Array.isArray(doc) ? { sections: doc } : doc, null, 2) + '\n'
            const codeUrl = process.env.CODE_URL
            const themeId = process.env.THEME_ID
            if (codeUrl && themeId) {
              const r = await fetch(`${codeUrl}/api/themes/${themeId}/file?path=${encodeURIComponent(`templates/${page}.json`)}`, { method: 'PUT', body: content })
              if (!r.ok) throw new Error(`code-store PUT ${r.status}`)
              res.setHeader('content-type', 'application/json')
              res.end(JSON.stringify({ ok: true, persisted: 'code-store', themeId, page }))
            } else {
              writeFileSync(join(process.cwd(), 'templates', `${page}.json`), content)
              res.setHeader('content-type', 'application/json')
              res.end(JSON.stringify({ ok: true, file: `templates/${page}.json` }))
            }
          } catch (e) {
            res.statusCode = 400
            res.end(JSON.stringify({ ok: false, error: String(e) }))
          }
        })
      })
    },
  }
}

// Editor "Add section" preview — server-render ONE section to instant HTML
// (standard). The picker iframe hits /__editor/preview-section?type=<name>
// &settings=<base64>; we SSR just that section (no Shell, no routing, no SPA
// boot) via preview-render.tsx + ssrLoadModule, then inject the theme CSS so it
// looks real. Fast because it skips the whole client app + live data fetch.
function sectionPreview(): Plugin {
  return {
    name: 'tanqory-section-preview',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const u = new URL(req.url || '/', 'http://localhost')
        if (u.pathname !== '/__editor/preview-section') return next()
        if (!callerAllowed(req)) {
          res.statusCode = 403
          res.setHeader('content-type', 'text/plain; charset=utf-8')
          return res.end('section preview: open it from the editor')
        }
        void (async () => {
        try {
          const type = u.searchParams.get('type') || ''
          let settings: Record<string, unknown> | undefined
          const raw = u.searchParams.get('settings')
          if (raw) {
            try { settings = JSON.parse(Buffer.from(raw, 'base64').toString('utf8')) } catch { /* defaults */ }
          }
          const mod = (await server.ssrLoadModule('/preview-render.tsx')) as {
            renderSection: (t: string, s?: Record<string, unknown>) => string
          }
          const body = mod.renderSection(type, settings)
          res.setHeader('content-type', 'text/html; charset=utf-8')
          res.setHeader('cache-control', 'no-store')
          res.end(
            `<!doctype html><html><head><meta charset="utf-8">` +
              `<meta name="viewport" content="width=device-width, initial-scale=1">` +
              `<script type="module" src="/@vite/client"></script>` +
              `<script type="module">import '/assets/styles.css'</script>` +
              `<style>html,body{margin:0}</style></head><body>${body}</body></html>`,
          )
        } catch (e) {
          res.statusCode = 500
          res.setHeader('content-type', 'text/html; charset=utf-8')
          res.end(`<pre style="padding:24px;color:#b00020">preview error: ${escapeHtml(String((e as Error)?.message ?? e))}</pre>`)
        }
        })()
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  // Load .env(.local) so the storefront proxy + live-data config survive HOWEVER
  // the dev server is started (a plain `vite` start, not only a wrapper that
  // exports these). VITE_* vars are auto-exposed to import.meta.env by Vite; the
  // proxy target below is a non-VITE var, so we read it from the loaded env here.
  const env = loadEnv(mode, process.cwd(), '')
  const storefrontOrigin = process.env.TANQORY_STOREFRONT_ORIGIN || env.TANQORY_STOREFRONT_ORIGIN

  return {
    plugins: [react(), studioSave(), sectionPreview()] as PluginOption[],
    // Client bundle for the Tanqory runtime (spec v1): dist/client/ with a
    // Vite manifest, so the SSR entry can link the hashed files for THIS version.
    build: {
      outDir: 'dist/client',
      manifest: true,
      emptyOutDir: true,
      // One 586 kB chunk for every page. React and the theme's Tanqory glue
      // change on their own cadence; splitting them lets a section edit ship
      // without re-downloading either.
      rollupOptions: {
        output: {
          manualChunks(id: string) {
            if (id.includes('node_modules/react')) return 'react'
            if (id.includes('/lib/tanqory/')) return 'tanqory'
            return undefined
          },
        },
      },
    },
    server: {
      port: 4321,
      // Accept any ingress host (e.g. <slug>.mytanqory.com).
      allowedHosts: true,
      // HMR is disabled in the sandbox: the storefront runs behind the studio
      // router ingress, where vite's HMR WebSocket can't reach the pod
      // (browser tried wss://localhost:8080 and wss://<slug>.mytanqory.com → fail,
      // noisy console error). We don't need HMR here — live edits reach the canvas
      // via the editor's postMessage PreviewBridge, and saved edits apply on the
      // next pod start (Publish → code store → re-fetch). If STUDIO_PROXY_PORT is
      // set (local proxy dev), use it so HMR still works there.
      hmr: process.env.STUDIO_PROXY_PORT
        ? { clientPort: Number(process.env.STUDIO_PROXY_PORT) }
        : false,
      // Local "live data" preview: proxy the storefront API to a real cell so the
      // canvas renders the REAL store (name, products, menus) instead of the
      // offline mock. The storefront GraphQL has no CORS for localhost, so we
      // forward server-side here. Enable via .env.local (TANQORY_STOREFRONT_ORIGIN
      // + VITE_TANQORY_BACKEND=http://localhost:<thisPort> + VITE_TANQORY_STORE_ID).
      // Inert when TANQORY_STOREFRONT_ORIGIN is unset.
      ...(storefrontOrigin
        ? {
            proxy: {
              '/api/v1/stores': {
                target: storefrontOrigin,
                changeOrigin: true,
                secure: true,
              },
            },
          }
        : {}),
    },
    // Production serve plane: `vite preview` serves the built static site (no dev
    // server, no HMR client). It enforces its own host allow-list, so accept any
    // <slug>.mytanqory.com host here.
    preview: {
      allowedHosts: true,
    },
  }
})
