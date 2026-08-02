import { describe, expect, it } from 'vitest'
import { bySection, needsPosterFrame, posterUrl, sequenceFlames, } from './galleryContent'
import type { GalleryItem, GalleryListItem } from './galleryContent'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'

const row = (over: Partial<GalleryListItem> = {}): GalleryListItem => ({
  slug: 'first-light',
  title: 'First Light',
  caption: null,
  author: null,
  section: 'gallery',
  capability: null,
  dimensions: 2,
  transform_count: 4,
  poster_key: 'first-light-abcd1234.webp',
  poster_width: 1600,
  poster_height: 900,
  poster_frame: null,
  sort_order: 0,
  has_animation: 0,
  ...over,
})

describe('needsPosterFrame', () => {
  it('restricts an animated row whose poster frame was never recorded', () => {
    // The failure it exists to prevent: live at frame 0, poster at some other
    // frame, so the freeze-to-poster swap jumps between two images.
    expect(
      needsPosterFrame(row({ has_animation: 1, poster_frame: null })),
    ).toBe(true)
  })

  it('lets an animated row go live once its frame is known', () => {
    expect(needsPosterFrame(row({ has_animation: 1, poster_frame: 31 }))).toBe(
      false,
    )
    // Frame 0 is a real choice on a short timeline, not a missing value.
    expect(needsPosterFrame(row({ has_animation: 1, poster_frame: 0 }))).toBe(
      false,
    )
  })

  it('does not restrict a row with no poster at all', () => {
    // Nothing to disagree with, and such a plate never freezes — restricting it
    // would leave an empty plate instead of a live flame.
    expect(
      needsPosterFrame(
        row({ has_animation: 1, poster_key: null, poster_frame: null }),
      ),
    ).toBe(false)
  })

  it('never restricts a still, whose poster is its only frame', () => {
    expect(needsPosterFrame(row())).toBe(false)
  })
})

describe('posterUrl', () => {
  it('serves through the Worker, which adds the gallery/ prefix', () => {
    expect(posterUrl(row())).toBe(
      '/api/gallery/poster/first-light-abcd1234.webp',
    )
  })

  it('is undefined for a row with no poster', () => {
    expect(posterUrl(row({ poster_key: null }))).toBeUndefined()
  })
})

describe('sequenceFlames', () => {
  // A curated `sequence` is what makes `cap-randomizer` play a path instead of
  // resting on one still. Every other row has none, and "none" has to be the
  // ordinary case rather than an error.
  const flame = (id: string) => ({ id }) as unknown as FlameDescriptor
  const item = (sequence: GalleryItem['sequence']) =>
    ({ sequence }) as Pick<GalleryItem, 'sequence'>

  it('returns the stored flames in the order they were curated', () => {
    const stored = [flame('a'), flame('b'), flame('c')]
    expect(sequenceFlames(item(stored))).toEqual(stored)
  })

  it('is empty for a row with no sequence — every row but one', () => {
    expect(sequenceFlames(item(null))).toEqual([])
    expect(sequenceFlames(undefined)).toEqual([])
    expect(sequenceFlames({} as Pick<GalleryItem, 'sequence'>)).toEqual([])
  })

  it('degrades a malformed sequence to the single-flame behaviour', () => {
    // The column is written by a script and read months later by a build that
    // may be older or newer. A shape nobody expected must cost the row its
    // walk, not its place on Home.
    const bad = 'not-an-array' as unknown as GalleryItem['sequence']
    expect(sequenceFlames(item(bad))).toEqual([])
  })

  it('drops the entries that are not descriptors, keeping the rest', () => {
    const good = flame('a')
    const mixed = [good, null, 'oops', 42] as unknown as GalleryItem['sequence']
    expect(sequenceFlames(item(mixed))).toEqual([good])
  })
})

describe('bySection', () => {
  it('groups in the order the API returned, and drops unknown sections', () => {
    const items = [
      row({ slug: 'a', section: 'gallery' }),
      row({ slug: 'b', section: 'motion' }),
      row({ slug: 'c', section: 'gallery' }),
      // Content can be newer than the client; an unknown section must not throw.
      row({ slug: 'd', section: 'lightbox' as GalleryListItem['section'] }),
    ]
    const grouped = bySection(items)
    expect(grouped.gallery.map((i) => i.slug)).toEqual(['a', 'c'])
    expect(grouped.motion.map((i) => i.slug)).toEqual(['b'])
    expect(grouped.hero).toEqual([])
  })
})
