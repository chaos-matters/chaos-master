import { ShareApi } from './apiClient'
import { blobToBase64 } from './blob'
import { encodeJsonQueryParam, encodeSharePayload } from './jsonQueryParam'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'
import type { CustomVariationDef } from '@/flame/variations/custom'
import type { TimelineConfig, TimelineTrack } from '@/utils/timeline'

/**
 * Encode a single custom variation into a self-contained `?cv=` link. The
 * recipient re-validates the code through the allowlist compiler on load (see
 * decodeVariationShare + importSharedVariations) and is shown a preview before
 * saving — the payload is never trusted as-is. Inline only (no shortener): a
 * variation's WGSL is small, so the link stays short and never expires.
 */
export async function encodeVariationShareUrl(
  def: CustomVariationDef,
): Promise<string> {
  const encoded = await encodeJsonQueryParam({ variation: def })
  return `${globalThis.location.origin}/?cv=${encoded}`
}

/**
 * Shared share-link logic, used by both the Share Link modal and the Discord
 * share fallback so links are produced identically everywhere: a self-contained
 * inline link that always works, plus a best-effort short link that degrades
 * gracefully when the shortener is unavailable.
 */

export interface ShareAnimation {
  tracks: TimelineTrack[]
  config: TimelineConfig
}

export interface ShareLink {
  /** Base64 share payload — the same value the Worker stores / hashes. */
  encoded: string
  /** Self-contained `?flame=` link: carries all data inline, never expires. */
  longUrl: string
  /** Shortened `?s=` link, or '' when the shortener is unavailable. */
  shortUrl: string
  /** shortUrl when present, else longUrl — the best link to hand a user. */
  primaryUrl: string
}

/**
 * Encode a flame (+ optional animation) into its inline `?flame=` link. No
 * network, so it always succeeds and callers always have something to copy.
 */
export async function encodeShareUrl(opts: {
  flame: FlameDescriptor
  animation?: ShareAnimation
  customVariations?: CustomVariationDef[]
}): Promise<{ encoded: string; longUrl: string }> {
  const encoded = await encodeSharePayload(
    opts.flame,
    opts.animation,
    opts.customVariations,
  )
  return { encoded, longUrl: `${globalThis.location.origin}/?flame=${encoded}` }
}

/**
 * Best-effort short link via the Worker. Returns '' if shortening is
 * unavailable (offline, worker not running, rate-limited) so callers fall back
 * to the inline long link.
 */
export async function shortenShareUrl(encoded: string): Promise<string> {
  const res = await ShareApi.shorten(encoded)
  return res?.id ? `${globalThis.location.origin}/?s=${res.id}` : ''
}

/**
 * Encode + shorten in one call. `primaryUrl` is the short link when available,
 * otherwise the inline long link — so it always resolves to a working URL.
 */
export async function createShareLink(opts: {
  flame: FlameDescriptor
  animation?: ShareAnimation
  customVariations?: CustomVariationDef[]
}): Promise<ShareLink> {
  const { encoded, longUrl } = await encodeShareUrl(opts)
  const shortUrl = await shortenShareUrl(encoded)
  return { encoded, longUrl, shortUrl, primaryUrl: shortUrl || longUrl }
}

/**
 * Content-addressed OG key — SHA-256 of the encoded payload, first 32 hex
 * chars. Must match the Worker's `ogKey` so `?flame=` and `?s=` links resolve
 * the same stored image.
 */
export async function ogKey(encoded: string): Promise<string> {
  const data = new TextEncoder().encode(encoded)
  const digest = await globalThis.crypto.subtle.digest('SHA-256', data)
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 32)
}

/** Title/description for the OG card, derived from flame metadata. */
export function deriveOgMeta(flame: FlameDescriptor): {
  title: string
  description: string
} {
  const meta = flame.metadata
  const name = meta?.name?.trim()
  const author = meta?.author
  const title = name
    ? name
    : author && author !== 'unknown'
      ? `Flame by ${author}`
      : 'Fractal Flame — Lumen Apeiron'
  const transformCount = Object.keys(flame.transforms ?? {}).length
  const description = meta?.description?.trim()
    ? meta.description.trim()
    : `${transformCount} transform${transformCount === 1 ? '' : 's'} • Created with Lumen Apeiron`
  return { title, description }
}

/**
 * Upload an OG preview image for a share, keyed by content hash. Best-effort —
 * the link works without it; the image just enriches the social preview card.
 */
export async function uploadOgPreview(opts: {
  encoded: string
  blob: Blob
  title: string
  description: string
}): Promise<void> {
  try {
    const image = await blobToBase64(opts.blob)
    await ShareApi.uploadOg(await ogKey(opts.encoded), {
      image,
      title: opts.title,
      description: opts.description,
    })
  } catch (err) {
    console.error('Failed to upload OG preview image:', err)
  }
}
