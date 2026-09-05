export interface Env {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  KV_SHORTENER: any
  // R2 bucket holding the per-share OG preview PNGs (keyed by short id).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  OG_IMAGES: any
  // D1 holding the Home tab's gallery content (FlameDescriptor JSON per row).
  // Curated rows are written with gallery-admin; the Worker may only add an
  // explicitly consented Discord submission in unpublished/pending state.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  CONTENT_DB?: any
  // Per-IP rate limiter for the share/OG write endpoints.
  API_RL: { limit: (options: { key: string }) => Promise<{ success: boolean }> }
  // Stricter per-IP limiter dedicated to the Discord share endpoint.
  DISCORD_RL: {
    limit: (options: { key: string }) => Promise<{ success: boolean }>
  }
  ASSETS: { fetch: typeof fetch }
  // Secrets (set via \`wrangler secret put\`). When unset the related feature is
  // treated as not-configured rather than enforced — keeps local dev working.
  TURNSTILE_SECRET?: string
  DISCORD_WEBHOOK_URL?: string
  DISCORD_INVITE_URL?: string
  // Comma-separated hostnames a Turnstile token may have been solved on (a var,
  // set per-env in wrangler.jsonc). When set, a token solved on one origin
  // can't be replayed against another. Unset → hostname is not pinned.
  TURNSTILE_ALLOWED_HOSTNAMES?: string
}

export const SHORTEN_TTL = 60 * 24 * 60 * 60 // 60 days in seconds
export const MAX_SHORTEN_PAYLOAD = 256 * 1024 // 256 KB
export const MAX_OG_UPLOAD = 4 * 1024 * 1024 // ~4 MB
export const MAX_DISCORD_UPLOAD = 12 * 1024 * 1024 // ~12 MB request (~9 MB image)
export const MAX_SHOWCASE_DESCRIPTOR = 512 * 1024
export const DISCORD_DAILY_CAP = 15
export const GALLERY_SECTIONS = ['hero', 'gallery', 'motion', 'capability']
export const GALLERY_CACHE_SECONDS = 300
export const TURNSTILE_VERIFY_URL =
  'https://challenges.cloudflare.com/turnstile/v0/siteverify'
export const SITE_NAME = 'Lumen Apeiron'
export const DEFAULT_TITLE = 'Fractal Flame — Lumen Apeiron'
export const DEFAULT_DESCRIPTION =
  'Explore and create fractal flames with Lumen Apeiron.'
export const DEFAULT_OG_PATH = '/og-cover.jpg'

export interface OgMeta {
  t?: string
  d?: string
  img?: number
}

export type ShowcaseRequest = {
  consent?: unknown
  consentVersion?: unknown
  flame?: unknown
  animation?: unknown
  shareUrl?: unknown
}

export type ShowcaseStatus = 'not-requested' | 'queued' | 'unavailable'
