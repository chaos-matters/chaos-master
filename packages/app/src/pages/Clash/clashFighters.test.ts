/**
 * Fighter refs in the clash page URL, the options the picker offers, and
 * loading a fighter from each source.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { examples } from '@/flame/examples'
import { DEFAULT_FIGHTERS, exampleOptions, formatFighterRef, galleryOptions, loadFighter, parseFighterRef, recentOptions, } from './clashFighters'
import type { GalleryListItem } from '@/lib/galleryContent'
import type { RecentFlame } from '@/utils/recentFlames'

const fetchGalleryItem = vi.hoisted(() => vi.fn())
vi.mock('@/lib/galleryContent', () => ({ fetchGalleryItem }))

describe('fighter refs', () => {
  it.each(['example:example37', 'recent:m1x-abc', 'gallery:spiral-2'])(
    'round-trips %s',
    (value) => {
      const ref = parseFighterRef(value)
      expect(ref).toBeDefined()
      expect(formatFighterRef(ref!)).toBe(value)
    },
  )

  it.each([
    null,
    '',
    'example37',
    'disk:example37',
    'example:',
    'gallery:../api/admin',
    `recent:${'x'.repeat(200)}`,
  ])('refuses %s', (value) => {
    expect(parseFighterRef(value)).toBeUndefined()
  })
})

describe('picker options', () => {
  it('offers the shipped examples by name, but no fixtures', () => {
    const options = exampleOptions()
    const ids = options.map((o) => o.ref.id)
    expect(ids).toContain('example37')
    expect(ids).not.toContain('benchmark')
    expect(options.find((o) => o.ref.id === 'example37')?.label).toBe(
      examples.example37.metadata.name,
    )
  })

  it('offers Recents newest first', () => {
    const recent = (id: string, savedAt: number) =>
      ({ id, name: id, savedAt, flame: examples.example2 }) as RecentFlame
    const options = recentOptions([recent('old', 1), recent('new', 2)])
    expect(options.map((o) => o.ref.id)).toEqual(['new', 'old'])
  })

  it('offers gallery flames by title', () => {
    const options = galleryOptions([
      { slug: 'gasket', title: 'Golden Gasket' } as GalleryListItem,
    ])
    expect(options).toEqual([
      {
        ref: { source: 'gallery', id: 'gasket' },
        label: 'Golden Gasket',
        group: 'Gallery',
      },
    ])
  })

  it('opens on fighters that exist', async () => {
    for (const ref of Object.values(DEFAULT_FIGHTERS)) {
      expect(await loadFighter(ref)).toBeDefined()
    }
  })
})

describe('loadFighter', () => {
  beforeEach(() => fetchGalleryItem.mockReset())

  it('loads an example by id', async () => {
    const fighter = await loadFighter({ source: 'example', id: 'example38' })
    expect(fighter?.flame).toBe(examples.example38)
  })

  it('refuses a fixture example', async () => {
    expect(
      await loadFighter({ source: 'example', id: 'benchmark' }),
    ).toBeUndefined()
  })

  it('validates a gallery flame and gives up on a broken one', async () => {
    fetchGalleryItem.mockResolvedValueOnce({
      title: 'Galaxy',
      flame: examples.example37,
    })
    const fighter = await loadFighter({ source: 'gallery', id: 'galaxy' })
    expect(fighter?.name).toBe('Galaxy')
    fetchGalleryItem.mockResolvedValueOnce({ title: 'Bad', flame: {} })
    expect(await loadFighter({ source: 'gallery', id: 'bad' })).toBeUndefined()
    fetchGalleryItem.mockRejectedValueOnce(new Error('offline'))
    expect(await loadFighter({ source: 'gallery', id: 'x' })).toBeUndefined()
  })

  it('finds nothing for a Recents id that is not there', async () => {
    expect(
      await loadFighter({ source: 'recent', id: 'missing' }),
    ).toBeUndefined()
  })
})
