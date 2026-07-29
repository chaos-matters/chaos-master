import type { FlameDescriptor } from '@/flame/schema/flameSchema'
import type { TimelineTrack } from '@/utils/timeline'

/**
 * Client for the Home tab's content API (see worker/index.ts). The gallery
 * lives in D1 rather than in the bundle so it can be re-curated by writing
 * rows, with no redeploy — which also means Home has to cope with the content
 * being unreachable, empty, or newer than this build.
 */

export type GallerySection = 'hero' | 'gallery' | 'motion' | 'capability'

/** Row as returned by the list endpoint — deliberately without the flame. */
export interface GalleryListItem {
  slug: string
  title: string
  caption: string | null
  author: string | null
  section: GallerySection
  capability: string | null
  dimensions: number
  transform_count: number
  poster_key: string | null
  poster_width: number | null
  poster_height: number | null
  sort_order: number
  has_animation: number
}

/** A single item, with the descriptor parsed. */
export interface GalleryItem extends Omit<GalleryListItem, 'has_animation'> {
  flame: FlameDescriptor
  animation: { tracks: TimelineTrack[] } | null
}

/** Where a poster lives once captured. Null items render a plain plate. */
export function posterUrl(item: {
  poster_key: string | null
}): string | undefined {
  return item.poster_key === null
    ? undefined
    : `/api/gallery/poster/${item.poster_key}`
}

export async function fetchGallery(
  section?: GallerySection,
): Promise<GalleryListItem[]> {
  const query = section === undefined ? '' : `?section=${section}`
  const res = await fetch(`/api/gallery${query}`)
  if (!res.ok) {
    // 503 simply means no content database is bound (a fresh environment, or
    // a deploy without the binding). Treated the same as an empty gallery:
    // Home degrades to its empty state rather than an error screen.
    throw new Error(`Gallery unavailable (${res.status})`)
  }
  const body = (await res.json()) as { items?: GalleryListItem[] }
  return body.items ?? []
}

export async function fetchGalleryItem(slug: string): Promise<GalleryItem> {
  const res = await fetch(`/api/gallery/${slug}`)
  if (!res.ok) throw new Error(`Gallery item unavailable (${res.status})`)
  return (await res.json()) as GalleryItem
}

/** Group a flat list into its sections, preserving the API's ordering. */
export function bySection(
  items: GalleryListItem[],
): Record<GallerySection, GalleryListItem[]> {
  const empty: Record<GallerySection, GalleryListItem[]> = {
    hero: [],
    gallery: [],
    motion: [],
    capability: [],
  }
  for (const item of items) {
    // Guard against a section this build does not know about: content can be
    // newer than the client, and an unknown value must not throw.
    if (item.section in empty) empty[item.section].push(item)
  }
  return empty
}
