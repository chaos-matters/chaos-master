/**
 * Where the Flame Clash preview gets its fighters: a shipped example, one of
 * the user's Recents (the editor's autosave lands its current flame there),
 * or a published gallery flame. A fighter is named in the page URL as
 * `?a=<ref>&b=<ref>`, with a ref of `example:<id>`, `recent:<id>` or
 * `gallery:<slug>`, so a bout can be linked.
 */
import { examples } from '@/flame/examples'
import { tryValidateFlame } from '@/flame/schema/flameSchema'
import { fetchGalleryItem } from '@/lib/galleryContent'
import { loadRecentFlame } from '@/utils/recentFlames'
import type { ExampleID } from '@/flame/examples'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'
import type { GalleryListItem } from '@/lib/galleryContent'
import type { RecentFlame } from '@/utils/recentFlames'

export type FighterSource = 'example' | 'recent' | 'gallery'
export type FighterRef = { source: FighterSource; id: string }

export type FighterOption = {
  ref: FighterRef
  label: string
  group: 'Your flames' | 'Examples' | 'Gallery'
}

/** The bout the page opens with: a 3D fighter against a 2D one. */
export const DEFAULT_FIGHTERS: Record<'a' | 'b', FighterRef> = {
  a: { source: 'example', id: 'example37' },
  b: { source: 'example', id: 'neonJulianCosmos' },
}

/** Examples that are test fixtures or blank starts, not fighters. */
const NOT_FIGHTERS = new Set(['benchmark', 'initExample', 'initExample3D'])

const SOURCES: readonly FighterSource[] = ['example', 'recent', 'gallery']
/** Ids in URLs are kept to what the three sources actually use. */
const SAFE_ID = /^[\w.-]{1,128}$/

export function parseFighterRef(value: string | null): FighterRef | undefined {
  if (!value) return undefined
  const split = value.indexOf(':')
  if (split < 0) return undefined
  const source = value.slice(0, split) as FighterSource
  const id = value.slice(split + 1)
  if (!SOURCES.includes(source) || !SAFE_ID.test(id)) return undefined
  return { source, id }
}

export function formatFighterRef(ref: FighterRef): string {
  return `${ref.source}:${ref.id}`
}

const isExampleId = (id: string): id is ExampleID =>
  Object.hasOwn(examples, id) && !NOT_FIGHTERS.has(id)

export function exampleOptions(): FighterOption[] {
  return Object.entries(examples)
    .filter(([id]) => isExampleId(id))
    .map(([id, flame]) => ({
      ref: { source: 'example' as const, id },
      label: flame.metadata.name || id,
      group: 'Examples' as const,
    }))
}

export function recentOptions(
  recents: readonly RecentFlame[],
): FighterOption[] {
  return [...recents]
    .sort((x, y) => y.savedAt - x.savedAt)
    .filter((recent) => SAFE_ID.test(recent.id))
    .map((recent) => ({
      ref: { source: 'recent' as const, id: recent.id },
      label: recent.name || 'Untitled',
      group: 'Your flames' as const,
    }))
}

export function galleryOptions(
  items: readonly GalleryListItem[],
): FighterOption[] {
  return items
    .filter((item) => SAFE_ID.test(item.slug))
    .map((item) => ({
      ref: { source: 'gallery' as const, id: item.slug },
      label: item.title,
      group: 'Gallery' as const,
    }))
}

export type LoadedFighter = { flame: FlameDescriptor; name: string }

/** The flame a ref names, validated, or undefined when it cannot be had. */
export async function loadFighter(
  ref: FighterRef,
): Promise<LoadedFighter | undefined> {
  switch (ref.source) {
    case 'example': {
      if (!isExampleId(ref.id)) return undefined
      const flame = examples[ref.id]
      return { flame, name: flame.metadata.name || ref.id }
    }
    case 'recent': {
      const recent = loadRecentFlame(ref.id)
      return recent && { flame: recent.flame, name: recent.name || 'Untitled' }
    }
    case 'gallery': {
      try {
        const item = await fetchGalleryItem(ref.id)
        const flame = tryValidateFlame(item.flame)
        return flame && { flame, name: item.title }
      } catch {
        return undefined
      }
    }
  }
}
