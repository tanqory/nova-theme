export interface ThemeConfig {
  name: string
  routes: Record<string, string>
  data: {
    mode: 'mock' | 'live'
    /** Store API base, e.g. https://api.tanqory.com (live mode; the router picks the store's cell). */
    endpoint?: string | undefined
    /** Store UUID to preview against (live mode). */
    storeId?: string | undefined
    /** Publishable storefront token — `x-publishable-key` (live mode, optional). */
    token?: string | undefined
  }
  tokens?: string
}

export function defineTheme(config: ThemeConfig): ThemeConfig {
  return config
}

import type { AttrSpec } from './types'

/** Global theme settings schema (drives the editor's "Theme settings" panel). */
export type SettingsSchema = Record<string, AttrSpec>

export function defineSettings(schema: SettingsSchema): SettingsSchema {
  return schema
}
