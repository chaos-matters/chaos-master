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
  /**
   * Timeline frame the poster was captured at, or null when no frame applies
   * (a still) or none was recorded (a poster older than the column).
   *
   * An animated row's poster is NOT frame 0: the capture samples a fraction
   * into the timeline and slides off that frame when it lands on a vibrancy
   * dip, so the frame is chosen at capture time and stored here. It is what lets
   * a live plate render the poster's own image instead of the rest pose — see
   * `needsPosterFrame` and HomeFlame.
   */
  poster_frame: number | null
  sort_order: number
  has_animation: number
}

/** A single item, with the descriptor parsed. */
export interface GalleryItem extends Omit<GalleryListItem, 'has_animation'> {
  flame: FlameDescriptor
  animation: { tracks: TimelineTrack[] } | null
  /**
   * Extra descriptors this row plays through, in order, or null for the single
   * flame every other row is.
   *
   * Curated and stored, not generated live — `scripts/gallery-sequence.mjs`
   * derives them from the row's own flame with the app's randomiser and writes
   * them here, so what a visitor sees is a path someone chose. A FLAT list on
   * purpose: a row holding two different curated paths one after another is
   * twice as long and needs no player change (see `sequenceFlames`).
   *
   * Deliberately absent from the LIST endpoint. It is many times the size of a
   * row's own descriptor, and the list already omits `flame` for that reason.
   */
  sequence: FlameDescriptor[] | null
}

/** Where a poster lives once captured. Null items render a plain plate. */
export function posterUrl(item: {
  poster_key: string | null
}): string | undefined {
  return item.poster_key === null
    ? undefined
    : `/api/gallery/poster/${item.poster_key}`
}

/**
 * True when a live render of this row could not reproduce its poster, so the
 * plate has to stay on the poster (HomeFlame's `posterOnly`).
 *
 * The one case is an animated row whose poster predates `poster_frame`: the
 * poster is some frame partway through its timeline, nothing says which, and a
 * live render would sit at frame 0 — so going live and then freezing back would
 * visibly jump between two different images. With the frame recorded, the plate
 * replays the timeline there and the two agree.
 *
 * A row with no poster at all is NOT restricted: there is no second image to
 * disagree with, and such a plate never freezes (see HomeFlame's `canFreeze`),
 * so it renders live at frame 0 rather than showing nothing.
 */
export function needsPosterFrame(
  item: Pick<GalleryListItem, 'has_animation' | 'poster_key' | 'poster_frame'>,
): boolean {
  return (
    item.has_animation === 1 &&
    item.poster_key !== null &&
    item.poster_frame === null
  )
}

/**
 * The extra flames this row plays through — `[]` for every row that has none.
 *
 * The null case is not an error and not a special mode: an empty walk leaves a
 * plate resting on its own descriptor, which is what every gallery row has
 * always done. Content can also be newer or hand-edited, so a `sequence` that
 * is not an array of objects is treated as absent rather than trusted — a
 * malformed curation must degrade to the ordinary plate, not break it.
 */
export function sequenceFlames(
  item: Pick<GalleryItem, 'sequence'> | undefined | null,
): FlameDescriptor[] {
  const stored = item?.sequence
  if (!Array.isArray(stored)) {
    return []
  }
  return stored.filter(
    (entry): entry is FlameDescriptor =>
      typeof entry === 'object' && entry !== null,
  )
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
